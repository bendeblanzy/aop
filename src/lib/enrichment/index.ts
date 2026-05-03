/**
 * Enrichment service — orchestrateur principal.
 *
 * Public API :
 *   - enrichOrganization(orgId, opts?) — déclenche un enrichissement complet
 *     (LinkedIn + site + recherche web → synthèse Claude → stockage DB).
 *
 * Stratégie :
 *   1. Lit le profil depuis DB pour récupérer raison_sociale, linkedin_url, website_url
 *   2. Vérifie le cache : si enrichment_at < TTL et version = current, skip (sauf force)
 *   3. Lance les 3 sources EN PARALLÈLE (Promise.allSettled, jamais throw global)
 *   4. Synthèse Claude qui agrège
 *   5. UPDATE profile.enrichment_context + enrichment_at + enrichment_sources + enrichment_version
 *
 * Fallback gracieux : si une source échoue, on continue avec les autres.
 * Le caller reçoit toujours un EnrichmentContext (potentiellement vide si TOUT échoue).
 */

import { adminClient } from '@/lib/supabase/admin'
import { scrapeLinkedInCompany } from './linkedin-scraper'
import { fetchWebsite } from './website-fetcher'
import { searchCompanyWeb } from './web-search'
import { synthesize } from './synthesizer'
import {
  ENRICHMENT_SCHEMA_VERSION,
  ENRICHMENT_CACHE_TTL_DAYS,
  type EnrichmentContext,
  type EnrichmentSources,
  type SourceStatus,
} from './types'

export interface EnrichmentResult {
  context: EnrichmentContext
  sources: EnrichmentSources
  cached: boolean
  /** Coût + tokens consommés (utile pour monitoring). */
  cost: {
    input_tokens: number
    output_tokens: number
    cache_read_tokens: number
    cache_create_tokens: number
    apify_runs: number
  }
}

interface EnrichOptions {
  /** Force le recalcul même si cache valide. */
  force?: boolean
  /** AbortSignal pour cancel global (timeout serverless par exemple). */
  signal?: AbortSignal
}

/**
 * Vérifie si l'enrichment_at en DB est encore frais (< TTL).
 */
function isCacheFresh(at: string | null, version: number | null): boolean {
  if (!at || version !== ENRICHMENT_SCHEMA_VERSION) return false
  const ageMs = Date.now() - new Date(at).getTime()
  const ttlMs = ENRICHMENT_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000
  return ageMs < ttlMs
}

export async function enrichOrganization(
  orgId: string,
  options: EnrichOptions = {},
): Promise<EnrichmentResult> {
  // 1. Lire le profil
  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('raison_sociale, code_naf, forme_juridique, effectif_moyen, ville, siren, linkedin_url, website_url, enrichment_context, enrichment_at, enrichment_sources, enrichment_version')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) throw new Error(`Profil introuvable : ${error.message}`)
  if (!profile) throw new Error('Profil introuvable pour cette organization')
  if (!profile.raison_sociale) throw new Error('Raison sociale manquante — impossible d\'enrichir')

  // 2. Cache check (sauf si force)
  if (!options.force && isCacheFresh(profile.enrichment_at, profile.enrichment_version)) {
    return {
      context: (profile.enrichment_context as EnrichmentContext) ?? {},
      sources: (profile.enrichment_sources as EnrichmentSources) ?? { linkedin: 'skip', website: 'skip', web_search: 'skip' },
      cached: true,
      cost: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_create_tokens: 0, apify_runs: 0 },
    }
  }

  // 3. Lancer les 3 sources en parallèle
  const sources: EnrichmentSources = { linkedin: 'skip', website: 'skip', web_search: 'skip', errors: {} }
  const apifyRunsCount = profile.linkedin_url ? 1 : 0

  const [linkedinResult, websiteResult, webSearchResult] = await Promise.allSettled([
    profile.linkedin_url
      ? scrapeLinkedInCompany(profile.linkedin_url, { signal: options.signal })
      : Promise.resolve(null),
    profile.website_url
      ? fetchWebsite(profile.website_url, { signal: options.signal })
      : Promise.resolve(null),
    // Recherche web : toujours faite (utile même si LinkedIn/site présents pour corroborer)
    searchCompanyWeb(profile.raison_sociale, {
      code_naf: profile.code_naf ?? undefined,
      ville: profile.ville ?? undefined,
      siren: profile.siren ?? undefined,
    }),
  ])

  function statusFor(promise: PromiseSettledResult<unknown>, urlProvided: boolean): SourceStatus {
    if (!urlProvided && promise.status === 'fulfilled' && promise.value === null) return 'skip'
    if (promise.status === 'rejected') return 'fail'
    if (promise.status === 'fulfilled' && promise.value === null) return 'fail'
    return 'ok'
  }

  sources.linkedin = statusFor(linkedinResult, !!profile.linkedin_url)
  sources.website = statusFor(websiteResult, !!profile.website_url)
  sources.web_search = statusFor(webSearchResult, true)

  if (linkedinResult.status === 'rejected') sources.errors!.linkedin = String(linkedinResult.reason)
  if (websiteResult.status === 'rejected') sources.errors!.website = String(websiteResult.reason)
  if (webSearchResult.status === 'rejected') sources.errors!.web_search = String(webSearchResult.reason)

  const linkedin = linkedinResult.status === 'fulfilled' ? linkedinResult.value : null
  const website = websiteResult.status === 'fulfilled' ? websiteResult.value : null
  const webSearch = webSearchResult.status === 'fulfilled' ? webSearchResult.value : null

  // 4. Synthèse Claude
  const { context, tokens } = await synthesize(
    {
      raisonSociale: profile.raison_sociale,
      codeNaf: profile.code_naf ?? undefined,
      forme_juridique: profile.forme_juridique ?? undefined,
      effectif_moyen: profile.effectif_moyen ?? null,
      ville: profile.ville ?? undefined,
      linkedin,
      website,
      webSearch,
    },
    sources,
  )

  // 5. Persister en DB
  const { error: updateError } = await adminClient
    .from('profiles')
    .update({
      enrichment_context: context,
      enrichment_at: new Date().toISOString(),
      enrichment_sources: sources,
      enrichment_version: ENRICHMENT_SCHEMA_VERSION,
    })
    .eq('organization_id', orgId)

  if (updateError) {
    // Log mais ne throw pas : on retourne le contexte calculé même si l'écriture échoue
    console.error('[enrichmentService] update failed:', updateError.message)
  }

  return {
    context,
    sources,
    cached: false,
    cost: {
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      cache_read_tokens: tokens.cacheRead,
      cache_create_tokens: tokens.cacheCreate,
      apify_runs: apifyRunsCount,
    },
  }
}

/**
 * Lit le contexte d'enrichissement existant sans déclencher de calcul.
 * Retourne null si l'org n'a jamais été enrichie.
 */
export async function getEnrichmentContext(orgId: string): Promise<{
  context: EnrichmentContext | null
  sources: EnrichmentSources | null
  enriched_at: string | null
  is_stale: boolean
} | null> {
  const { data: profile } = await adminClient
    .from('profiles')
    .select('enrichment_context, enrichment_sources, enrichment_at, enrichment_version')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!profile) return null

  const context = profile.enrichment_context as EnrichmentContext | null
  const sources = profile.enrichment_sources as EnrichmentSources | null
  const enrichedAt = profile.enrichment_at

  return {
    context,
    sources,
    enriched_at: enrichedAt,
    is_stale: !isCacheFresh(enrichedAt, profile.enrichment_version),
  }
}

// Re-exports pour les consumers
export type { EnrichmentContext, EnrichmentSources } from './types'
export { ENRICHMENT_CACHE_TTL_DAYS, ENRICHMENT_SCHEMA_VERSION } from './types'
