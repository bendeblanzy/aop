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
// Stratégie de pagination :
//   - On utilise le "jump direct" via numPageTop=N + DefaultButtonTop submit
//     plutôt que de cliquer "page suivante" 100 fois. C'est plus robuste et
//     élimine les bugs de double-décompte côté PRADO.
//   - L'ordre Atexo n'est PAS strictement chronologique (les AO peuvent être
//     remontés par "dernière modification") donc on ne peut pas faire de
//     stop early temporel fiable. On scrape strictement maxPagesPerProvider
//     pages, et le filtrage temporel se fait en aval (côté Next.js).
//   - maxAgeDays sert seulement à filtrer les items poussés au dataset.
//
// Robustesse :
//   - Retry automatique 1 fois en cas d'erreur HTTP transient
//   - Délai 1s entre chaque page pour rester courtois
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_PATH = '/index.php?page=Entreprise.EntrepriseAdvancedSearch&AllCons'
const PAGE_DELAY_MS = 1000
const FETCH_TIMEOUT_MS = 45_000

interface ScrapeOptions {
  maxAgeDays: number
  maxPagesPerProvider: number
  /** Filtre catégorie ('services' | 'travaux' | 'fournitures' | null = tous) */
  categorie: string | null
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
      // Node fetch: les Set-Cookie sont dans res.headers.getSetCookie() ou via raw
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

/** True si l'AO a une date limite de remise déjà passée (= AO clos). */
function isClosed(dateLimiteIso: string | null): boolean {
  if (!dateLimiteIso) return false
  const t = Date.parse(dateLimiteIso)
  if (!Number.isFinite(t)) return false
  return t < Date.now()
}

/** Filtre items par catégorie + fenêtre temporelle + dédup. */
function filterAndDedupe(
  items: AtexoApifyItem[],
  seenRefs: Set<string>,
  categorie: string | null,
  maxAgeDays: number,
): AtexoApifyItem[] {
  const out: AtexoApifyItem[] = []
  for (const it of items) {
    if (!it.reference) continue
    const key = `${it.provider}|${it.reference}`
    if (seenRefs.has(key)) continue
    seenRefs.add(key)
    if (categorie) {
      const expected = categorie.toUpperCase()
      const expectedNorm =
        expected.startsWith('SERV') ? 'SERVICES'
          : expected.startsWith('TRAV') ? 'TRAVAUX'
          : expected.startsWith('FOURN') ? 'FOURNITURES'
          : expected
      // On garde aussi les items sans catégorie (champ optionnel) pour ne pas
      // perdre des AO mal taggués sur Atexo.
      if (it.type_marche && it.type_marche !== expectedNorm) continue
    }
    // On ne push pas les AO clos (date limite de remise déjà passée). Les AO
    // sans date_limite_remise sont conservés (incertitude → on garde).
    void maxAgeDays // paramètre conservé pour compat — non utilisé côté actor
    if (isClosed(it.date_limite_remise)) continue
    out.push(it)
  }
  return out
}

/**
 * Scrape une plateforme Atexo MPE.
 * Pousse au fur et à mesure dans le dataset Apify (Actor.pushData).
 */
export async function scrapeProvider(
  provider: AtexoProviderInput,
  opts: ScrapeOptions,
): Promise<{ pushed: number; pagesFetched: number; truncated: boolean }> {
  const { id, baseUrl } = provider
  const url = baseUrl + SEARCH_PATH
  log.info(`[${id}] Scraping ${url} (maxAgeDays=${opts.maxAgeDays}, maxPages=${opts.maxPagesPerProvider})`)

  const seenRefs = new Set<string>()
  let pushed = 0
  let pagesFetched = 0
  let truncated = false

  // ── Page 1 : GET pour récupérer PRADO_PAGESTATE et le cookie de session ──
  const r0 = await fetchWithRetry(url, { method: 'GET', headers: pradoHeaders(null, false) })
  if (r0.status !== 200) {
    throw new Error(`[${id}] GET initial failed: HTTP ${r0.status}`)
  }
  pagesFetched++
  const cookie = extractSessionCookie(r0.setCookie)
  let pradoState = extractPradoPageState(r0.html)
  if (!pradoState) {
    throw new Error(`[${id}] PRADO_PAGESTATE introuvable sur la page initiale`)
  }

  let parsed = parseListingPage(r0.html, baseUrl, id)
  const totalPages = parsed.totalPages ?? 1
  log.info(`[${id}] Page 1/${totalPages} — ${parsed.items.length} items, totalResults=${parsed.totalResults ?? '?'}`)

  // Push items de la page 1 (filtre catégorie + dédup, maxAgeDays appliqué item par item)
  let pageItems = filterAndDedupe(parsed.items, seenRefs, opts.categorie, opts.maxAgeDays)
  if (pageItems.length > 0) {
    await Actor.pushData(pageItems)
    pushed += pageItems.length
  }

  // ── Pages 2..N : pattern "jump direct" via numPageTop + DefaultButtonTop ──
  // LIMITATION CONNUE V1 : au-delà de 3 pages, PRADO renvoie "Page state is
  // corrupted" — probablement un viewstate qui se désynchronise après plusieurs
  // postbacks. Cap dur à 3 pages par plateforme pour rester stable. À itérer
  // en V2 avec sessions parallèles + offset.
  const HARD_CAP_PAGES = 3
  const lastPage = Math.min(totalPages, opts.maxPagesPerProvider, HARD_CAP_PAGES)
  if (opts.maxPagesPerProvider > HARD_CAP_PAGES) {
    log.info(`[${id}] maxPagesPerProvider=${opts.maxPagesPerProvider} > HARD_CAP_PAGES=${HARD_CAP_PAGES} → bridé à ${HARD_CAP_PAGES}`)
  }
  for (let page = 2; page <= lastPage; page++) {
    await new Promise(r => setTimeout(r, PAGE_DELAY_MS))

    const body = buildPradoPostbackBody(pradoState!, '', {
      'ctl0$CONTENU_PAGE$resultSearch$numPageTop': String(page),
      'ctl0$CONTENU_PAGE$resultSearch$DefaultButtonTop': '',
      'ctl0$CONTENU_PAGE$resultSearch$listePageSizeTop': '20',
    })

    let rN: FetchResult
    try {
      rN = await fetchWithRetry(url, {
        method: 'POST',
        headers: pradoHeaders(cookie, true),
        body,
      })
    } catch (e) {
      log.warning(`[${id}] Page ${page} fetch error: ${e instanceof Error ? e.message : e}`)
      break
    }
    pagesFetched++
    if (rN.status >= 500) {
      log.info(`[${id}] HTTP ${rN.status} sur page ${page} — fin probable de la pagination`)
      break
    }
    if (rN.status !== 200) {
      log.warning(`[${id}] HTTP ${rN.status} sur page ${page} — stop`)
      break
    }

    const newState = extractPradoPageState(rN.html)
    if (newState) pradoState = newState

    parsed = parseListingPage(rN.html, baseUrl, id)
    if (parsed.items.length === 0) {
      log.info(`[${id}] Page ${page} : aucun item — fin`)
      break
    }
    log.info(`[${id}] Page ${page}/${totalPages} — ${parsed.items.length} items`)

    pageItems = filterAndDedupe(parsed.items, seenRefs, opts.categorie, opts.maxAgeDays)
    if (pageItems.length > 0) {
      await Actor.pushData(pageItems)
      pushed += pageItems.length
    }

    if (page === lastPage && page < totalPages) {
      truncated = true
      log.warning(`[${id}] maxPagesPerProvider=${opts.maxPagesPerProvider} atteint, ${totalPages - page} pages non scrapées`)
    }
  }

  return { pushed, pagesFetched, truncated }
}
