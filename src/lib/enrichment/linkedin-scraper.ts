/**
 * LinkedIn Company Scraper — wrapper Apify.
 *
 * Utilise l'actor `harvestapi/linkedin-company` (le plus fiable et économique en
 * mai 2026, ~5 ct par scrape, retourne nom, description, industries, taille,
 * ancienneté, HQ, posts récents). L'actor ID est paramétrable via env var
 * `APIFY_LINKEDIN_ACTOR_ID` au cas où on changerait pour un autre actor.
 *
 * Cette fonction est tolérante à l'échec : si LinkedIn ban le scraper, ou si
 * l'URL est invalide, on retourne `null` (le synthesizer continuera avec
 * site web + recherche web).
 */

import type { RawLinkedInData } from './types'

const APIFY_BASE = 'https://api.apify.com/v2'
const DEFAULT_ACTOR_ID = 'harvestapi~linkedin-company'
const RUN_TIMEOUT_SECS = 90 // LinkedIn scrape rapide, 90s suffit largement

function token(): string {
  const t = process.env.APIFY_API_TOKEN
  if (!t) throw new Error('APIFY_API_TOKEN manquant')
  return t
}

function actorId(): string {
  return process.env.APIFY_LINKEDIN_ACTOR_ID || DEFAULT_ACTOR_ID
}

interface RunResponse {
  data: { id: string; status: string; defaultDatasetId?: string }
}

/**
 * Lance un scrape synchrone (run-sync-get-dataset-items).
 * Retourne les items bruts du dataset Apify ou null si échec.
 */
async function runSync(linkedinUrl: string, signal?: AbortSignal): Promise<unknown[] | null> {
  const url =
    `${APIFY_BASE}/acts/${encodeURIComponent(actorId())}/run-sync-get-dataset-items`
    + `?token=${encodeURIComponent(token())}`
    + `&timeout=${RUN_TIMEOUT_SECS}`

  // L'input format dépend de l'actor. harvestapi attend `companies: [url]`.
  const body = {
    companies: [linkedinUrl],
    // Limite explicite : on ne veut qu'un seul résultat
    maxItems: 1,
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout((RUN_TIMEOUT_SECS + 10) * 1000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[linkedin-scraper] Apify HTTP ${res.status}: ${text.slice(0, 200)}`)
      return null
    }
    const items = await res.json()
    return Array.isArray(items) ? items : null
  } catch (e) {
    console.warn('[linkedin-scraper] error:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Mapping permissif des champs bruts Apify → notre RawLinkedInData.
 * Les champs varient selon l'actor utilisé, donc on cherche plusieurs noms
 * possibles (defensive coding).
 */
function mapItem(raw: unknown): RawLinkedInData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const pickString = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = r[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return undefined
  }
  const pickArray = (...keys: string[]): string[] | undefined => {
    for (const k of keys) {
      const v = r[k]
      if (Array.isArray(v)) {
        const filtered = v.filter((x): x is string => typeof x === 'string' && x.length > 0)
        if (filtered.length > 0) return filtered
      }
    }
    return undefined
  }
  const pickNumber = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = r[k]
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string') {
        const n = parseInt(v, 10)
        if (Number.isFinite(n)) return n
      }
    }
    return undefined
  }

  const hq = (r.headquarter || r.headquarters || r.location) as Record<string, unknown> | undefined

  return {
    name: pickString('name', 'companyName', 'title'),
    description: pickString('description', 'about', 'tagline'),
    industries: pickArray('industries', 'industry'),
    specialties: pickArray('specialties', 'specialities'),
    employee_count_range: pickString('employeeCountRange', 'companySize', 'employee_count_range', 'staffCount'),
    founded_year: pickNumber('foundedOn', 'founded', 'foundedYear', 'year_founded'),
    headquarters: hq ? {
      city: typeof hq.city === 'string' ? hq.city : undefined,
      country: typeof hq.country === 'string' ? hq.country : undefined,
    } : undefined,
    website: pickString('website', 'websiteUrl', 'url'),
    recent_posts: undefined, // l'actor harvestapi/linkedin-company ne renvoie pas les posts par défaut
  }
}

/**
 * Scrape une page LinkedIn d'entreprise et retourne les données structurées.
 * Retourne `null` en cas d'échec (URL invalide, ban LinkedIn, timeout, etc.) —
 * le caller doit gérer ce cas comme une source manquante.
 */
export async function scrapeLinkedInCompany(
  linkedinUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<RawLinkedInData | null> {
  // Validation URL minimale
  if (!linkedinUrl || !linkedinUrl.includes('linkedin.com/company/')) {
    console.warn('[linkedin-scraper] URL invalide (attendu /company/) :', linkedinUrl)
    return null
  }

  const items = await runSync(linkedinUrl, options.signal)
  if (!items || items.length === 0) return null

  const mapped = mapItem(items[0])
  if (!mapped) return null

  // On considère le scrape réussi si on a au moins le nom OU la description
  if (!mapped.name && !mapped.description) {
    console.warn('[linkedin-scraper] item retourné mais ni name ni description')
    return null
  }

  return mapped
}
