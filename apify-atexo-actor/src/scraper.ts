import { Actor, log } from 'apify'
import {
  buildPradoPostbackBody,
  extractPradoPageState,
  extractSessionCookie,
  pradoHeaders,
} from './prado'
import { parseListingPage } from './parse'
import type { AtexoApifyItem, AtexoProviderInput } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Scraper haut niveau d'une plateforme Atexo MPE.
//
// Deux modes de recherche :
//
//   1. Mode LISTING (par défaut, sans keywords) :
//        URL = /index.php?page=Entreprise.EntrepriseAdvancedSearch&AllCons
//        → liste tous les AO publics actifs, paginés.
//
//   2. Mode KEYWORD SEARCH (si opts.keywords est fourni) :
//        URL = /?page=Entreprise.EntrepriseAdvancedSearch (sans &AllCons)
//        On fait 1 sub-run par keyword. Chaque sub-run :
//          - GET du formulaire de recherche avancée
//          - POST avec keyword + categorie=3 (Services) + lancerRecherche
//          - Pagination identique au mode listing
//        Les keywords sont rechargés sans accents — PRADO Atexo plante en
//        UTF-8 sur les keyword search ("Page state is corrupted").
//
// Stratégie de pagination (commune aux 2 modes) :
//   - Pattern "jump direct" via numPageTop=N + DefaultButtonTop submit.
//   - Hard-cap 3 pages : au-delà, PRADO renvoie 400 ("page state corrupted").
//
// Filtres appliqués au push :
//   - categorie : SERVICES/TRAVAUX/FOURNITURES (lit type_marche)
//   - minDaysUntilDeadline : on exclut les AO clos OU expirant trop vite
//   - dédup : un seul (provider, reference) par run global
// ─────────────────────────────────────────────────────────────────────────────

const ALLCONS_PATH = '/index.php?page=Entreprise.EntrepriseAdvancedSearch&AllCons'
const ADVSEARCH_PATH = '/?page=Entreprise.EntrepriseAdvancedSearch'
const PAGE_DELAY_MS = 1000
const FETCH_TIMEOUT_MS = 45_000
const HARD_CAP_PAGES = 3

interface ScrapeOptions {
  maxPagesPerProvider: number
  /** Filtre catégorie ('services' | 'travaux' | 'fournitures' | null = tous) */
  categorie: string | null
  /** Mots-clés (sub-runs séparés). Si vide ou non fourni → mode listing. */
  keywords: string[]
  /** Nombre de jours minimum avant date limite pour push (0 = pas de filtre). */
  minDaysUntilDeadline: number
}

interface FetchResult {
  status: number
  html: string
  setCookie: string[]
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 2,
): Promise<FetchResult> {
  let lastErr: unknown = null
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      const setCookie: string[] = []
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getSet = (res.headers as any).getSetCookie
        if (typeof getSet === 'function') {
          const arr = (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie()
          if (Array.isArray(arr)) setCookie.push(...arr)
        } else {
          const sc = res.headers.get('set-cookie')
          if (sc) setCookie.push(sc)
        }
      } catch {
        const sc = res.headers.get('set-cookie')
        if (sc) setCookie.push(sc)
      }
      const html = await res.text()
      return { status: res.status, html, setCookie }
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 1500))
        continue
      }
    }
  }
  throw new Error(`fetch failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

/** True si l'AO ferme dans moins de `minDaysUntilDeadline` jours (ou est déjà clos). */
function expiresTooSoon(dateLimiteIso: string | null, minDays: number): boolean {
  if (!dateLimiteIso) return false // pas de date → on garde
  const t = Date.parse(dateLimiteIso)
  if (!Number.isFinite(t)) return false
  const cutoff = Date.now() + minDays * 86_400_000
  return t < cutoff
}

/** "événementiel" → "evenementiel" — PRADO Atexo n'accepte pas l'UTF-8 en keyword. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Code de catégorie PRADO Atexo (formulaire avancé). */
function categorieCode(c: string | null): string {
  if (!c) return '0' // Toutes
  const t = c.toLowerCase()
  if (t.startsWith('trav')) return '1'
  if (t.startsWith('fourn')) return '2'
  if (t.startsWith('serv')) return '3'
  return '0'
}

interface FilterContext {
  seenRefs: Set<string>
  categorie: string | null
  minDaysUntilDeadline: number
}

/** Filtre items par catégorie + fraîcheur + dédup. */
function filterAndDedupe(
  items: AtexoApifyItem[],
  ctx: FilterContext,
): AtexoApifyItem[] {
  const out: AtexoApifyItem[] = []
  for (const it of items) {
    if (!it.reference) continue
    const key = `${it.provider}|${it.reference}`
    if (ctx.seenRefs.has(key)) continue
    ctx.seenRefs.add(key)
    if (ctx.categorie) {
      const expected = ctx.categorie.toUpperCase()
      const expectedNorm =
        expected.startsWith('SERV') ? 'SERVICES'
          : expected.startsWith('TRAV') ? 'TRAVAUX'
          : expected.startsWith('FOURN') ? 'FOURNITURES'
          : expected
      if (it.type_marche && it.type_marche !== expectedNorm) continue
    }
    if (expiresTooSoon(it.date_limite_remise, ctx.minDaysUntilDeadline)) continue
    out.push(it)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination — extrait pour réutilisation entre les 2 modes (listing & search).
// On part d'un HTML déjà récupéré (page 1) avec son PRADO_PAGESTATE et son
// cookie. La fonction collecte les items des pages 2..N et les push au dataset.
// ─────────────────────────────────────────────────────────────────────────────
interface PaginateInput {
  /** Identifiant logique pour les logs */
  scopeLabel: string
  /** Provider technique (pour parseListingPage) */
  providerId: import('./types').AtexoProviderId
  /** Base URL utilisée dans les liens de fiche */
  baseUrl: string
  /** URL POST cible (formulaire de pagination) */
  postUrl: string
  /** PRADO_PAGESTATE et cookie issus du dernier fetch */
  initialPradoState: string
  cookie: string | null
  /** HTML page 1 déjà parsé */
  page1Html: string
  totalPages: number
  /** Items page 1 (déjà parsés, à push après filtre) */
  page1Items: AtexoApifyItem[]
  /** maxPages effectif pour ce sub-run */
  maxPages: number
  /** Contexte de filtrage partagé (seenRefs persistant entre sub-runs) */
  filterCtx: FilterContext
}

interface PaginateOutput {
  pushed: number
  pagesFetched: number
  truncated: boolean
}

async function paginateAndCollect(input: PaginateInput): Promise<PaginateOutput> {
  let pushed = 0
  let pagesFetched = 1 // page 1 déjà fetched par l'appelant
  let truncated = false

  // Push items page 1
  const p1Items = filterAndDedupe(input.page1Items, input.filterCtx)
  if (p1Items.length > 0) {
    await Actor.pushData(p1Items)
    pushed += p1Items.length
  }

  let pradoState = input.initialPradoState
  const lastPage = Math.min(input.totalPages, input.maxPages, HARD_CAP_PAGES)

  for (let page = 2; page <= lastPage; page++) {
    await new Promise(r => setTimeout(r, PAGE_DELAY_MS))

    const body = buildPradoPostbackBody(pradoState, '', {
      'ctl0$CONTENU_PAGE$resultSearch$numPageTop': String(page),
      'ctl0$CONTENU_PAGE$resultSearch$DefaultButtonTop': '',
      'ctl0$CONTENU_PAGE$resultSearch$listePageSizeTop': '20',
    })

    let rN: FetchResult
    try {
      rN = await fetchWithRetry(input.postUrl, {
        method: 'POST',
        headers: pradoHeaders(input.cookie, true),
        body,
      })
    } catch (e) {
      log.warning(`[${input.scopeLabel}] Page ${page} fetch error: ${e instanceof Error ? e.message : e}`)
      break
    }
    pagesFetched++
    if (rN.status >= 500 || rN.status === 400) {
      log.info(`[${input.scopeLabel}] HTTP ${rN.status} sur page ${page} — fin pagination`)
      break
    }
    if (rN.status !== 200) {
      log.warning(`[${input.scopeLabel}] HTTP ${rN.status} sur page ${page} — stop`)
      break
    }

    const newState = extractPradoPageState(rN.html)
    if (newState) pradoState = newState

    const parsed = parseListingPage(rN.html, input.baseUrl, input.providerId)
    if (parsed.items.length === 0) {
      log.info(`[${input.scopeLabel}] Page ${page} : aucun item — fin`)
      break
    }
    log.info(`[${input.scopeLabel}] Page ${page}/${input.totalPages} — ${parsed.items.length} items`)

    const pageItems = filterAndDedupe(parsed.items, input.filterCtx)
    if (pageItems.length > 0) {
      await Actor.pushData(pageItems)
      pushed += pageItems.length
    }

    if (page === lastPage && page < input.totalPages) {
      truncated = true
    }
  }

  return { pushed, pagesFetched, truncated }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 1 — Listing /AllCons (mode par défaut, sans keywords).
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeListing(
  provider: AtexoProviderInput,
  opts: ScrapeOptions,
  filterCtx: FilterContext,
): Promise<PaginateOutput> {
  const { id, baseUrl } = provider
  const url = baseUrl + ALLCONS_PATH
  const scopeLabel = id

  log.info(`[${scopeLabel}] Listing ${url}`)

  const r0 = await fetchWithRetry(url, { method: 'GET', headers: pradoHeaders(null, false) })
  if (r0.status !== 200) {
    throw new Error(`[${scopeLabel}] GET initial failed: HTTP ${r0.status}`)
  }
  const cookie = extractSessionCookie(r0.setCookie)
  const pradoState = extractPradoPageState(r0.html)
  if (!pradoState) {
    throw new Error(`[${scopeLabel}] PRADO_PAGESTATE introuvable`)
  }
  const parsed = parseListingPage(r0.html, baseUrl, id)
  const totalPages = parsed.totalPages ?? 1
  log.info(`[${scopeLabel}] Page 1/${totalPages} — ${parsed.items.length} items, totalResults=${parsed.totalResults ?? '?'}`)

  return paginateAndCollect({
    scopeLabel, providerId: id, baseUrl, postUrl: url,
    initialPradoState: pradoState, cookie,
    page1Html: r0.html, totalPages, page1Items: parsed.items,
    maxPages: opts.maxPagesPerProvider,
    filterCtx,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 2 — Recherche par mot-clé (sub-run par keyword).
// ─────────────────────────────────────────────────────────────────────────────
/** Une tentative complète : GET + POST search. Retourne null si la séquence
 * a échoué (PRADO "Page state corrupted" — bug aléatoire d'Atexo sur sub-runs
 * successifs). Caller fait du retry. */
async function tryKeywordSearch(
  baseUrl: string,
  url: string,
  providerId: import('./types').AtexoProviderId,
  keyword: string,
  categorie: string | null,
): Promise<null | { html: string; pradoState: string; cookie: string | null; parsed: ReturnType<typeof parseListingPage> }> {
  const r0 = await fetchWithRetry(url, { method: 'GET', headers: pradoHeaders(null, false) })
  if (r0.status !== 200) return null
  const cookie = extractSessionCookie(r0.setCookie)
  const pradoState0 = extractPradoPageState(r0.html)
  if (!pradoState0) return null

  // Petit délai pour laisser le serveur consolider le pagestate
  await new Promise(r => setTimeout(r, 500))

  const safeKeyword = stripAccents(keyword)
  const params = new URLSearchParams()
  params.set('PRADO_PAGESTATE', pradoState0)
  params.set('PRADO_POSTBACK_TARGET', 'ctl0$CONTENU_PAGE$AdvancedSearch$lancerRecherche')
  params.set('PRADO_POSTBACK_PARAMETER', '')
  params.set('ctl0$CONTENU_PAGE$AdvancedSearch$keywordSearch', safeKeyword)
  params.set('ctl0$CONTENU_PAGE$AdvancedSearch$categorie', categorieCode(categorie))
  params.set('ctl0$CONTENU_PAGE$AdvancedSearch$rechercheFloue', '1')

  const r1 = await fetchWithRetry(url, {
    method: 'POST',
    headers: pradoHeaders(cookie, true),
    body: params.toString(),
  })
  if (r1.status !== 200) return null
  const pradoState = extractPradoPageState(r1.html) ?? pradoState0
  const parsed = parseListingPage(r1.html, baseUrl, providerId)
  return { html: r1.html, pradoState, cookie, parsed }
}

async function scrapeKeyword(
  provider: AtexoProviderInput,
  keyword: string,
  opts: ScrapeOptions,
  filterCtx: FilterContext,
): Promise<PaginateOutput> {
  const { id, baseUrl } = provider
  const url = baseUrl + ADVSEARCH_PATH
  const scopeLabel = `${id}:"${keyword}"`

  log.info(`[${scopeLabel}] Recherche avancée`)

  // Retry 3x avec back-off : Atexo PRADO échoue aléatoirement avec
  // "Page state is corrupted" sur les sub-runs (~25% de fail rate).
  let result = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await tryKeywordSearch(baseUrl, url, id, keyword, opts.categorie)
      if (result) break
    } catch (e) {
      log.warning(`[${scopeLabel}] attempt ${attempt} : ${e instanceof Error ? e.message : e}`)
    }
    if (attempt < 3) {
      const backoff = 2000 * attempt
      log.info(`[${scopeLabel}] retry après ${backoff}ms...`)
      await new Promise(r => setTimeout(r, backoff))
    }
  }

  if (!result) {
    log.warning(`[${scopeLabel}] échec après 3 tentatives`)
    return { pushed: 0, pagesFetched: 2, truncated: false }
  }

  const totalPages = result.parsed.totalPages ?? 1
  log.info(`[${scopeLabel}] ${result.parsed.totalResults ?? '?'} résultats, ${totalPages} pages, items page1=${result.parsed.items.length}`)

  if (result.parsed.items.length === 0) {
    return { pushed: 0, pagesFetched: 2, truncated: false }
  }

  return paginateAndCollect({
    scopeLabel, providerId: id, baseUrl, postUrl: url,
    initialPradoState: result.pradoState, cookie: result.cookie,
    page1Html: result.html, totalPages, page1Items: result.parsed.items,
    maxPages: opts.maxPagesPerProvider,
    filterCtx,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point — itère sur les modes et accumule les résultats.
// ─────────────────────────────────────────────────────────────────────────────
export async function scrapeProvider(
  provider: AtexoProviderInput,
  opts: ScrapeOptions,
): Promise<{ pushed: number; pagesFetched: number; truncated: boolean; subRuns: number }> {
  const filterCtx: FilterContext = {
    seenRefs: new Set<string>(),
    categorie: opts.categorie,
    minDaysUntilDeadline: opts.minDaysUntilDeadline,
  }

  let totalPushed = 0
  let totalPages = 0
  let anyTruncated = false
  let subRuns = 0

  // Si keywords fournis : on fait 1 sub-run par keyword.
  // Sinon : on fait 1 run en mode listing global.
  if (opts.keywords && opts.keywords.length > 0) {
    for (const kw of opts.keywords) {
      try {
        const r = await scrapeKeyword(provider, kw, opts, filterCtx)
        totalPushed += r.pushed
        totalPages += r.pagesFetched
        anyTruncated ||= r.truncated
        subRuns++
        log.info(`[${provider.id}:"${kw}"] ✓ ${r.pushed} items (cumul: ${totalPushed})`)
      } catch (e) {
        log.warning(`[${provider.id}:"${kw}"] sub-run échec : ${e instanceof Error ? e.message : e}`)
      }
      // Délai entre keywords : 3s — au-dessous, Atexo retourne souvent
      // "Page state is corrupted" sur les sub-runs successifs (race PHP).
      await new Promise(r => setTimeout(r, 3000))
    }
  } else {
    const r = await scrapeListing(provider, opts, filterCtx)
    totalPushed = r.pushed
    totalPages = r.pagesFetched
    anyTruncated = r.truncated
    subRuns = 1
  }

  return { pushed: totalPushed, pagesFetched: totalPages, truncated: anyTruncated, subRuns }
}
