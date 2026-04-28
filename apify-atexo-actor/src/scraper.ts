import { Actor, log } from 'apify'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { parseListingPage } from './parse'
import type { AtexoApifyItem, AtexoProviderInput, AtexoProviderId } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// V3 — Scraper Playwright pour Atexo Local Trust MPE.
//
// Pourquoi un vrai navigateur :
//   - Le moteur PRADO (PHP) renvoie HTTP 400 ("Page state is corrupted") au-delà
//     de 3 pages quand on attaque en POST HTTP brut, parce qu'il s'attend à des
//     événements client (clics) avec des sequence numbers cohérents que seul un
//     vrai DOM produit. Avec Playwright, on clique le lien "page suivante" et
//     PRADO suit son propre flow → pas de hard-cap.
//   - Les variantes mineures de formulaire entre plateformes régionales
//     (Grand Est, PdL, Alsace, ...) sont absorbées par les selectors Playwright
//     robustes (`[name$="..."]`) au lieu de POST encodés à la main.
//   - Pas de race PHP entre sub-runs : chaque keyword a son propre
//     BrowserContext (cookies isolés).
//
// Stratégie globale :
//   - 1 Browser Chromium partagé pour tous les providers (économie mémoire).
//   - 1 BrowserContext frais par sub-run = (provider × keyword) → cookies
//     isolés, état PRADO clean, pas de pollution entre sub-runs.
//   - Pour chaque sub-run :
//       1. goto /?page=Entreprise.EntrepriseAdvancedSearch
//       2. Remplir le formulaire (keywordSearch + categorie + rechercheFloue)
//       3. Cliquer "Lancer la recherche"
//       4. Boucle pagination : page.content() → parseListingPage → push,
//          puis cliquer "Aller à la page suivante", waitForLoadState
//       5. Stop à totalPages OU maxPagesPerProvider OU 0 items
//
// Filtres conservés (identique V2) :
//   - categorie (services / travaux / fournitures / null)
//   - minDaysUntilDeadline (exclut AO clos ou expirant trop tôt)
//   - dédup (provider, reference) global au run
// ─────────────────────────────────────────────────────────────────────────────

const ADVSEARCH_PATH = '/?page=Entreprise.EntrepriseAdvancedSearch'
const ALLCONS_PATH = '/index.php?page=Entreprise.EntrepriseAdvancedSearch&AllCons'
const NAV_TIMEOUT_MS = 45_000
const PAGE_DELAY_MS = 600

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/120.0.0.0 Safari/537.36 LADNDataAtexoScraper/2.0'

interface ScrapeOptions {
  maxPagesPerProvider: number
  /** 'services' | 'travaux' | 'fournitures' | null */
  categorie: string | null
  /** Mots-clés (sub-runs séparés). Vide → mode listing global. */
  keywords: string[]
  /** 0 = pas de filtre */
  minDaysUntilDeadline: number
}

interface FilterContext {
  seenRefs: Set<string>
  categorie: string | null
  minDaysUntilDeadline: number
}

interface SubRunResult {
  pushed: number
  pagesFetched: number
  truncated: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitaires (filtrage, normalisation)
// ─────────────────────────────────────────────────────────────────────────────

/** True si l'AO ferme dans moins de `minDays` jours (ou est déjà clos). */
function expiresTooSoon(dateLimiteIso: string | null, minDays: number): boolean {
  if (!dateLimiteIso) return false
  const t = Date.parse(dateLimiteIso)
  if (!Number.isFinite(t)) return false
  const cutoff = Date.now() + minDays * 86_400_000
  return t < cutoff
}

/** "événementiel" → "evenementiel" — PRADO Atexo refuse l'UTF-8 dans keywordSearch. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Valeur du <select name="...categorie"> Atexo : 0=Toutes, 1=Travaux, 2=Fournitures, 3=Services. */
function categorieCode(c: string | null): string {
  if (!c) return '0'
  const t = c.toLowerCase()
  if (t.startsWith('trav')) return '1'
  if (t.startsWith('fourn')) return '2'
  if (t.startsWith('serv')) return '3'
  return '0'
}

/** Filtre items par catégorie + fraîcheur + dédup. Mutate ctx.seenRefs. */
function filterAndDedupe(items: AtexoApifyItem[], ctx: FilterContext): AtexoApifyItem[] {
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
// Étape 1 — submit du formulaire de recherche avancée
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ouvre la page formulaire avancé, le remplit et le soumet.
 * Retourne true si on est arrivé sur une page de résultats (parseable).
 */
async function submitAdvancedSearch(
  page: Page,
  baseUrl: string,
  keyword: string | null,
  categorie: string | null,
  scopeLabel: string,
): Promise<boolean> {
  // Mode listing global (sans keyword) : on attaque /AllCons directement
  const targetPath = keyword ? ADVSEARCH_PATH : ALLCONS_PATH
  const url = baseUrl + targetPath

  log.info(`[${scopeLabel}] goto ${url}`)
  try {
    await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS })
  } catch (e) {
    log.warning(`[${scopeLabel}] goto failed: ${e instanceof Error ? e.message : e}`)
    return false
  }

  // En mode listing, /AllCons donne directement les résultats
  if (!keyword) return true

  // Sinon : remplir le formulaire et cliquer "Lancer la recherche"
  const safeKw = stripAccents(keyword)

  // Timeout court pour les interactions formulaire — si un input est exotique
  // ou caché derrière un wrapper PRADO, on n'attend pas 30s.
  const FIELD_TIMEOUT = 5_000

  // 1. keywordSearch — l'input texte du formulaire
  const kwInput = page.locator('input[name$="$AdvancedSearch$keywordSearch"]').first()
  if ((await kwInput.count()) === 0) {
    log.warning(`[${scopeLabel}] champ keywordSearch introuvable`)
    return false
  }
  try {
    await kwInput.fill(safeKw, { timeout: FIELD_TIMEOUT })
  } catch (e) {
    log.warning(`[${scopeLabel}] fill keywordSearch échoué: ${e instanceof Error ? e.message : e}`)
    return false
  }

  // 2. categorie — un <select> PRADO. Optionnel : si absent ou code inexistant, on laisse.
  const catSelect = page.locator('select[name$="$AdvancedSearch$categorie"]').first()
  if ((await catSelect.count()) > 0) {
    try {
      await catSelect.selectOption({ value: categorieCode(categorie) }, { timeout: FIELD_TIMEOUT })
    } catch {
      // Variante de plateforme : pas grave, on accepte tous les marchés et le
      // filtrage se fera en aval sur type_marche.
      log.info(`[${scopeLabel}] catégorie non sélectionnable (variant) — laisse défaut`)
    }
  }

  // 3. rechercheFloue — désactivée (P5, 2026-04-28).
  // La recherche floue PRADO matchait des AO hors-périmètre (ex: "film" →
  // "film de protection pour véhicules" → prestations de motorisation UGAP).
  // Nos keywords sont déjà larges (22 termes) et sans accents (stripAccents).
  // Le scoring vectoriel pgvector côté Next.js absorbe les variantes sémantiques.
  // → On laisse le checkbox dans son état par défaut (non coché = recherche stricte).
  // Pour réactiver : replacer la valeur `inp.checked` par `true` ci-dessous.
  //
  // const flou = page.locator('input[name$="$AdvancedSearch$rechercheFloue"]').first()
  // if ((await flou.count()) > 0) { await flou.evaluate(el => { (el as HTMLInputElement).checked = true }) }

  // 4. Cliquer "Lancer la recherche" — postback complet PRADO → on attend "load".
  // Sur PLACE/Maximilien le bouton est un <input type="submit"> ;
  // sur certaines variantes plus anciennes c'est un <a>. On accepte les deux.
  const submitLink = page
    .locator(
      [
        'input[id$="_lancerRecherche"]',
        'input[id$="lancerRecherche"]',
        'a[id$="_lancerRecherche"]',
        'a[id$="lancerRecherche"]',
        'a[id$="$lancerRecherche"]',
      ].join(', '),
    )
    .first()
  if ((await submitLink.count()) === 0) {
    log.warning(`[${scopeLabel}] bouton lancerRecherche introuvable`)
    return false
  }

  // PRADO postback complet : on lance le click puis on attend que la page de
  // résultats apparaisse (présence de #...nombreElement OU disparition du
  // formulaire). PLACE peut chaîner 2 POST (submit puis redirect interne) et
  // `waitForResponse` seul ne suffit pas → on attend une preuve DOM.
  try {
    await submitLink.click({ timeout: FIELD_TIMEOUT, noWaitAfter: true })
    await page
      .waitForSelector('#ctl0_CONTENU_PAGE_resultSearch_nombreElement', {
        state: 'attached',
        timeout: NAV_TIMEOUT_MS,
      })
      .catch(() => {
        /* fallback — la page a peut-être 0 résultat sans afficher nombreElement */
      })
    await page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT_MS }).catch(() => {})
    // Petit délai pour laisser PRADO finir d'injecter ses scripts/inputs cachés
    await page.waitForTimeout(500)
  } catch (e) {
    log.warning(`[${scopeLabel}] submit timeout: ${e instanceof Error ? e.message : e}`)
    return false
  }

  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Étape 2 — pagination via clic sur "Aller à la page suivante"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cherche le lien "page suivante" et clique. Retourne false si pas de lien
 * (dernière page) ou si la navigation a échoué.
 *
 * Marqueur stable du DOM Atexo : un <span data-original-title="Aller à la
 * page suivante"> (depuis migration Bootstrap), avec fallback sur title="..."
 * pour les anciennes versions.
 */
async function gotoNextPage(page: Page, scopeLabel: string): Promise<boolean> {
  // Sélecteur tolérant aux deux variantes (Bootstrap tooltip vs title natif)
  const NEXT_SELECTOR =
    'a:has(span[data-original-title="Aller à la page suivante"]),'
    + ' a:has(span[title="Aller à la page suivante"])'
  const parentA = page.locator(NEXT_SELECTOR).first()
  if ((await parentA.count()) === 0) return false

  const disabled = await parentA
    .evaluate((a) => {
      const el = a as HTMLAnchorElement
      if (el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true') return true
      // Atexo désactive parfois en supprimant le href "#" et l'onclick
      const href = el.getAttribute('href')
      const onclick = el.getAttribute('onclick')
      if ((!href || href === '#') && !onclick) return true
      return false
    })
    .catch(() => false)
  if (disabled) return false

  // Même pattern que submitAdvancedSearch : on clique puis on attend une preuve
  // DOM stable (le numéro de page courant change ou les items se rerendent).
  // On capture le numéro de page actuel pour pouvoir détecter le changement.
  let beforePage: string | null = null
  try {
    beforePage = await page
      .locator('input[id$="_resultSearch_numPageTop"]')
      .first()
      .inputValue({ timeout: 2_000 })
      .catch(() => null)
  } catch {
    /* pas grave */
  }

  try {
    await parentA.click({ noWaitAfter: true, timeout: 10_000 })
    await page
      .waitForFunction(
        (prev) => {
          const inp = document.querySelector('input[id$="_resultSearch_numPageTop"]') as HTMLInputElement | null
          if (!inp) return false
          // si on n'avait pas de valeur avant, attendre seulement que l'input existe
          if (!prev) return true
          return inp.value !== prev
        },
        beforePage,
        { timeout: NAV_TIMEOUT_MS },
      )
      .catch(() => {})
    await page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT_MS }).catch(() => {})
  } catch (e) {
    log.warning(`[${scopeLabel}] click next page failed: ${e instanceof Error ? e.message : e}`)
    return false
  }

  // Petit délai courtois — laisse le serveur consolider sa réponse
  await page.waitForTimeout(PAGE_DELAY_MS)
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Étape 3 — sub-run complet (1 keyword × 1 provider, ou 1 listing)
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeSubRun(
  browser: Browser,
  provider: AtexoProviderInput,
  keyword: string | null,
  opts: ScrapeOptions,
  filterCtx: FilterContext,
): Promise<SubRunResult> {
  const scopeLabel = keyword ? `${provider.id}:"${keyword}"` : `${provider.id}:listing`

  let context: BrowserContext | null = null
  let pushed = 0
  let pagesFetched = 0
  let truncated = false

  try {
    context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    })

    // Bloquer les ressources lourdes (images, fonts, media) — gain X3-5 en vitesse
    await context.route('**/*', (route) => {
      const t = route.request().resourceType()
      if (t === 'image' || t === 'font' || t === 'media') return route.abort()
      return route.continue()
    })

    const page = await context.newPage()
    page.setDefaultTimeout(NAV_TIMEOUT_MS)

    const formOk = await submitAdvancedSearch(page, provider.baseUrl, keyword, opts.categorie, scopeLabel)
    if (!formOk) {
      log.warning(`[${scopeLabel}] échec submit, sub-run abandonné`)
      return { pushed: 0, pagesFetched: 0, truncated: false }
    }

    // Boucle pagination — page actuelle déjà chargée
    let totalPages: number | null = null
    for (let pageNum = 1; pageNum <= opts.maxPagesPerProvider; pageNum++) {
      const html = await page.content()
      const parsed = parseListingPage(html, provider.baseUrl, provider.id)
      pagesFetched++
      if (totalPages === null) totalPages = parsed.totalPages

      if (pageNum === 1) {
        log.info(
          `[${scopeLabel}] Page 1/${parsed.totalPages ?? '?'} — `
          + `${parsed.items.length} items, totalResults=${parsed.totalResults ?? '?'}`,
        )
      } else {
        log.info(`[${scopeLabel}] Page ${pageNum}/${parsed.totalPages ?? '?'} — ${parsed.items.length} items`)
      }

      if (parsed.items.length === 0) {
        log.info(`[${scopeLabel}] page ${pageNum} : aucun item — fin pagination`)
        break
      }

      const filtered = filterAndDedupe(parsed.items, filterCtx)
      if (filtered.length > 0) {
        await Actor.pushData(filtered)
        pushed += filtered.length
      }

      // Stop si on a atteint la dernière page connue
      if (parsed.totalPages !== null && pageNum >= parsed.totalPages) {
        break
      }

      // Stop si on a atteint le cap maxPagesPerProvider sans avoir tout couvert
      if (pageNum >= opts.maxPagesPerProvider) {
        if (parsed.totalPages !== null && pageNum < parsed.totalPages) truncated = true
        break
      }

      // Aller à la page suivante
      const ok = await gotoNextPage(page, scopeLabel)
      if (!ok) {
        log.info(`[${scopeLabel}] pas de page suivante après page ${pageNum}`)
        break
      }
    }
  } catch (e) {
    log.warning(`[${scopeLabel}] sub-run exception: ${e instanceof Error ? e.message : e}`)
  } finally {
    if (context) await context.close().catch(() => {})
  }

  return { pushed, pagesFetched, truncated }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point — itère sur (keywords × 1 provider)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scrape une plateforme Atexo. Si un Browser partagé est fourni, on le réutilise
 * (économie mémoire pour main.ts qui scrape plusieurs providers d'affilée).
 * Sinon, on en lance un et on le ferme à la fin.
 */
export async function scrapeProvider(
  provider: AtexoProviderInput,
  opts: ScrapeOptions,
  sharedBrowser?: Browser,
): Promise<{ pushed: number; pagesFetched: number; truncated: boolean; subRuns: number }> {
  const ownsBrowser = !sharedBrowser
  const browser = sharedBrowser ?? (await launchSharedBrowser())

  const filterCtx: FilterContext = {
    seenRefs: new Set<string>(),
    categorie: opts.categorie,
    minDaysUntilDeadline: opts.minDaysUntilDeadline,
  }

  let totalPushed = 0
  let totalPages = 0
  let anyTruncated = false
  let subRuns = 0

  try {
    if (opts.keywords && opts.keywords.length > 0) {
      for (const kw of opts.keywords) {
        try {
          const r = await scrapeSubRun(browser, provider, kw, opts, filterCtx)
          totalPushed += r.pushed
          totalPages += r.pagesFetched
          anyTruncated ||= r.truncated
          subRuns++
          log.info(`[${provider.id}:"${kw}"] ✓ ${r.pushed} items (cumul: ${totalPushed})`)
        } catch (e) {
          log.warning(
            `[${provider.id}:"${kw}"] sub-run échec : ${e instanceof Error ? e.message : e}`,
          )
        }
        // Petit délai courtois entre sub-runs (cookies isolés mais évitons un
        // burst sur l'IP côté Atexo)
        await new Promise((r) => setTimeout(r, 500))
      }
    } else {
      const r = await scrapeSubRun(browser, provider, null, opts, filterCtx)
      totalPushed = r.pushed
      totalPages = r.pagesFetched
      anyTruncated = r.truncated
      subRuns = 1
    }
  } finally {
    if (ownsBrowser) await browser.close().catch(() => {})
  }

  return { pushed: totalPushed, pagesFetched: totalPages, truncated: anyTruncated, subRuns }
}

/** Lance un Chromium headless avec les flags adaptés à un container Apify. */
export async function launchSharedBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  })
}

// Expose les helpers pour les tests
export { stripAccents, categorieCode, expiresTooSoon, filterAndDedupe }
export type { ScrapeOptions, FilterContext }

// ─────────────────────────────────────────────────────────────────────────────
// Tag pour reconnaître facilement la version dans les logs Apify
// ─────────────────────────────────────────────────────────────────────────────
export const SCRAPER_VERSION = 'V3-Playwright-2026-04-28'
