import { NextRequest } from 'next/server'
import { apiError, apiSuccess, getAuthContext } from '@/lib/api-utils'
import { enrichOrganization } from '@/lib/enrichment'

/**
 * POST /api/profil/enrich
 *
 * Déclenche un enrichissement complet de l'organisation courante :
 * scrape LinkedIn (si URL fournie) + fetch site web (si URL fournie) +
 * recherche web ciblée + synthèse Claude Sonnet → stockage en DB.
 *
 * Body (optionnel) :
 *   { force?: boolean }  — si true, ignore le cache (TTL 30j) et recalcule
 *
 * Réponse (200) :
 *   {
 *     context: EnrichmentContext,
 *     sources: EnrichmentSources,
 *     cached: boolean,
 *     cost: { input_tokens, output_tokens, cache_read_tokens, cache_create_tokens, apify_runs }
 *   }
 *
 * Latence : 30-60s en cold (cache miss), <100ms en cache hit.
 */
export async function POST(request: NextRequest) {
  const { user, orgId } = await getAuthContext()
  if (!user) return apiError('Unauthorized', 401)
  if (!orgId) return apiError('No organization', 403)

  let force = false
  try {
    const body = await request.json().catch(() => ({}))
    force = body?.force === true
  } catch {
    // body manquant ou invalide → on laisse force=false
  }

  try {
    const result = await enrichOrganization(orgId, { force })
    return apiSuccess(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api/profil/enrich] error:', msg)
    return apiError(`Enrichissement échoué : ${msg}`, 500)
  }
}
