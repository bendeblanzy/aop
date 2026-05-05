/**
 * Scraper HTTP pur (fetch + cheerio) pour marches-publics.info (AWSolutions MPE).
 *
 * Pas de Playwright — la plateforme est du HTML statique servi par un serveur
 * PHP/ColdFusion sans JavaScript obligatoire pour les pages de listing et de détail.
 *
 * Flow par mot-clé :
 *   1. POST /Annonces/lister avec {IDE=EC, IDN=S, IDR=X, txtLibre=<kw>, ...}
 *      → session cookie établi, page 1 reçue
 *   2. GET /Annonces/lister?pager_s=N avec le cookie → pages 2, 3, ...
 *      jusqu'à absence de rel="next" ou maxPages atteint
 *   3. Déduplication des mpiRef cross-keywords
 *   4. Fetch details (CPV, SIRET, valeur) en batch de 8 parallèles
 *
 * Timeout : ~3s/page listing × 10 pages × 22 keywords = ~660s worst-case,
 * mais dans la pratique ~1s/page (serveur rapide), soit ~220s pour 22 keywords.
 * Avec 8 details parallèles, +~15s. Total estimé ~240s << timeout 420s.
 */

import { log } from 'apify'
import { parseListingPage, parseDetailPage } from './parse.js'
import type { ListingItem } from './parse.js'
import type { AwsMpiApifyItem } from './types.js'

export const SCRAPER_VERSION = 'V1.0.0'

const BASE_URL = 'https://www.marches-publics.info'
const LISTING_URL = `${BASE_URL}/Annonces/lister`

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; aws-mpi-scraper/1.0; +https://apify.com)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

/** Extrait la valeur du cookie de session depuis les headers Set-Cookie. */
function extractSessionCookie(headers: Headers): string | null {
  const setCookie = headers.get('set-cookie')
  if (!setCookie) return null
  // Format typique : "CFID=12345; CFTOKEN=abcdef; Path=/"
  // On garde tout le header pour l'envoyer tel quel en Cookie
  const parts = setCookie.split(',').map(c => c.split(';')[0].trim())
  return parts.filter(Boolean).join('; ')
}

async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

// ─── Keyword search ───────────────────────────────────────────────────────────

interface KeywordSearchResult {
  items: ListingItem[]
  cookie: string | null
}

/**
 * POST le formulaire de recherche pour un mot-clé.
 * Retourne les items de la page 1 + le cookie de session.
 */
async function searchKeyword(keyword: string): Promise<KeywordSearchResult> {
  const body = new URLSearchParams({
    IDE: 'EC',       // État : en cours
    IDN: 'S',        // Nature : Services
    IDR: 'X',        // Région : toutes
    txtLibre: keyword,
    IDP: 'X',        // Département : tous
    listeCPV: '',
    Rechercher: 'Rechercher',
  })

  const res = await fetchWithTimeout(LISTING_URL, {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    throw new Error(`POST listing failed: ${res.status} ${res.statusText}`)
  }

  const cookie = extractSessionCookie(res.headers)
  const html = await res.text()
  const { items } = parseListingPage(html)

  return { items, cookie }
}

/**
 * GET une page de pagination (pager_s=N) avec le cookie de session.
 */
async function fetchPage(
  pageNum: number,
  cookie: string,
): Promise<{ items: ListingItem[]; hasNextPage: boolean }> {
  const url = `${LISTING_URL}?pager_s=${pageNum}`
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      Cookie: cookie,
    },
  })

  if (!res.ok) {
    throw new Error(`GET page ${pageNum} failed: ${res.status} ${res.statusText}`)
  }

  const html = await res.text()
  const { items, hasNextPage } = parseListingPage(html)
  return { items, hasNextPage }
}

// ─── Detail fetch ─────────────────────────────────────────────────────────────

/**
 * Enrichit un listing item avec les données de sa fiche de détail
 * (SIRET, CPV, valeur estimée, lots complets, procedure).
 *
 * Renvoie null en cas d'erreur (non-bloquant).
 */
async function fetchItemDetail(item: ListingItem): Promise<Partial<AwsMpiApifyItem> | null> {
  try {
    const res = await fetchWithTimeout(item.urlConsultation, {
      method: 'GET',
      headers: DEFAULT_HEADERS,
    })
    if (!res.ok) return null
    const html = await res.text()
    const detail = parseDetailPage(html)
    return {
      siret: detail.siret,
      objet: detail.objet,
      procedure_type: detail.procedure_type,
      type_marche: detail.type_marche,
      lieu_execution: detail.lieu_execution,
      cpv_codes: detail.cpv_codes,
      valeur_estimee: detail.valeur_estimee,
      lots: detail.lots,
    }
  } catch {
    return null
  }
}

/**
 * Fetch les détails en parallèle (concurrence limitée à `concurrency`).
 * Retourne un tableau de mêmes longueur que `items` (null si erreur).
 */
async function fetchDetailsBatch(
  items: ListingItem[],
  concurrency = 8,
): Promise<Array<Partial<AwsMpiApifyItem> | null>> {
  const results: Array<Partial<AwsMpiApifyItem> | null> = new Array(items.length).fill(null)
  const chunks: ListingItem[][] = []
  for (let i = 0; i < items.length; i += concurrency) {
    chunks.push(items.slice(i, i + concurrency))
  }

  let offset = 0
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(item => fetchItemDetail(item)))
    for (let j = 0; j < chunkResults.length; j++) {
      results[offset + j] = chunkResults[j]
    }
    offset += chunk.length
  }

  return results
}

// ─── Main scrape function ─────────────────────────────────────────────────────

export interface ScrapeOptions {
  keywords: string[]
  minDaysUntilDeadline: number
  maxPagesPerKeyword: number
  maxDetailFetches: number
}

export interface ScrapeResult {
  pushed: number
  fetched: number
  skipped: number
  errors: number
}

/** ms restant avant deadline pour un item */
function msUntilDeadline(dateLimite: string | null): number {
  if (!dateLimite) return Infinity
  const t = new Date(dateLimite).getTime()
  return isNaN(t) ? Infinity : t - Date.now()
}

/**
 * Scrape complet : keywords → listing → dedup → details → push.
 *
 * @param opts Options de scraping
 * @param pushFn Callback appelé pour chaque item à enregistrer dans le dataset
 */
export async function scrapeAll(
  opts: ScrapeOptions,
  pushFn: (item: AwsMpiApifyItem) => Promise<void>,
): Promise<ScrapeResult> {
  const { keywords, minDaysUntilDeadline, maxPagesPerKeyword, maxDetailFetches } = opts

  const minMs = minDaysUntilDeadline * 24 * 60 * 60 * 1000

  // ── 1. Collecte listing cross-keywords avec déduplication ──────────────────
  const seenRefs = new Set<string>()
  const allListingItems: ListingItem[] = []
  let fetchErrors = 0

  for (const keyword of keywords) {
    try {
      log.info(`[scraper] Keyword "${keyword}" — POST search...`)
      const { items: page1, cookie } = await searchKeyword(keyword)
      log.info(`[scraper] "${keyword}" page 1 : ${page1.length} items`)

      let page = 1
      let currentItems = page1
      let hasMore = true

      // Lire le hasNextPage depuis page 1 en re-parsant (approximation : si page1 < 10 items → fin)
      // On refetch page 1 pour récupérer hasNextPage correctement... mais on l'a déjà dans
      // searchKeyword. Amélioration : retourner hasNextPage depuis searchKeyword.
      // En pratique : si < 10 items sur page 1, pas de page 2.
      hasMore = page1.length >= 10 && !!cookie && page < maxPagesPerKeyword

      for (const item of currentItems) {
        if (!seenRefs.has(item.mpiRef)) {
          seenRefs.add(item.mpiRef)
          allListingItems.push(item)
        }
      }

      // Pages suivantes
      while (hasMore && cookie) {
        page++
        try {
          const next = await fetchPage(page, cookie)
          log.info(`[scraper] "${keyword}" page ${page} : ${next.items.length} items`)
          for (const item of next.items) {
            if (!seenRefs.has(item.mpiRef)) {
              seenRefs.add(item.mpiRef)
              allListingItems.push(item)
            }
          }
          hasMore = next.hasNextPage && page < maxPagesPerKeyword
        } catch (e) {
          log.warning(`[scraper] "${keyword}" page ${page} erreur : ${String(e)}`)
          hasMore = false
        }
      }

      log.info(`[scraper] "${keyword}" terminé — total unique cumulé : ${allListingItems.length}`)
    } catch (e) {
      log.error(`[scraper] Keyword "${keyword}" échoué : ${String(e)}`)
      fetchErrors++
    }
  }

  log.info(`[scraper] Listing terminé — ${allListingItems.length} AO uniques collectés`)

  // ── 2. Filtre minDaysUntilDeadline ─────────────────────────────────────────
  const minMs_ = minMs
  const qualified = minDaysUntilDeadline > 0
    ? allListingItems.filter(i => msUntilDeadline(i.dateLimite) >= minMs_)
    : allListingItems
  const skipped = allListingItems.length - qualified.length

  if (skipped > 0) {
    log.info(`[scraper] ${skipped} AO éliminés (deadline < ${minDaysUntilDeadline}j), ${qualified.length} retenus`)
  }

  // ── 3. Fetch détails (CPV, SIRET, valeur, lots) ────────────────────────────
  const toEnrich = qualified.slice(0, maxDetailFetches)
  const notEnriched = qualified.slice(maxDetailFetches)
  let detailCount = 0

  log.info(`[scraper] Enrichissement détails : ${toEnrich.length} fiches (concurrence 8)...`)
  const detailResults = await fetchDetailsBatch(toEnrich, 8)
  detailCount = detailResults.filter(Boolean).length
  log.info(`[scraper] ${detailCount}/${toEnrich.length} fiches enrichies avec succès`)

  // ── 4. Merge listing + details → push ─────────────────────────────────────
  const scrapedAt = new Date().toISOString()
  let pushed = 0

  const buildItem = (listing: ListingItem, detail: Partial<AwsMpiApifyItem> | null): AwsMpiApifyItem => {
    const typeMarche = detail?.type_marche
      ? detail.type_marche
      : 'Services' // IDN=S → on sait que c'est SERVICES

    return {
      reference: listing.mpiRef,
      reference_acheteur: listing.referenceAcheteur,
      intitule: listing.intitule,
      objet: detail?.objet ?? null,
      organisme: listing.organisme,
      siret: detail?.siret ?? null,
      procedure_type: detail?.procedure_type ?? null,
      type_marche: typeMarche,
      date_publication: listing.datePublication,
      date_limite_remise: listing.dateLimite,
      lieu_execution: detail?.lieu_execution ?? null,
      code_departement: listing.codeDepartement,
      cpv_codes: detail?.cpv_codes ?? [],
      valeur_estimee: detail?.valeur_estimee ?? null,
      url_consultation: listing.urlConsultation,
      lots: detail?.lots ?? [],
      nb_lots: listing.nbLots,
      scraped_at: scrapedAt,
    }
  }

  for (let i = 0; i < toEnrich.length; i++) {
    const item = buildItem(toEnrich[i], detailResults[i])
    await pushFn(item)
    pushed++
  }

  // Items non enrichis (dépassent maxDetailFetches) → push sans détails
  for (const listing of notEnriched) {
    const item = buildItem(listing, null)
    await pushFn(item)
    pushed++
  }

  return {
    pushed,
    fetched: allListingItems.length,
    skipped,
    errors: fetchErrors,
  }
}
