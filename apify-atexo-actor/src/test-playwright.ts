/**
 * Test local Playwright — V3 Atexo MPE.
 *
 * Reproduit le flow scraper en standalone (sans Apify SDK). Permet de :
 *   1. Valider qu'un keyword sur PLACE remonte ≥ 50 items en 5 pages
 *   2. Enchaîner 5 keywords successifs sans erreur (PRADO state corruption)
 *   3. Mesurer le temps moyen par sub-run
 *
 * Usage :
 *   npx playwright install chromium   # une fois
 *   npx ts-node src/test-playwright.ts                   # test rapide PLACE
 *   npx ts-node src/test-playwright.ts multi             # test 5 keywords
 *   npx ts-node src/test-playwright.ts mxm communication # provider+keyword custom
 *
 * Dépend de la stabilité du serveur Atexo (peut faussement échouer si DOWN).
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { parseListingPage } from './parse'
import type { AtexoApifyItem, AtexoProviderId } from './types'

const PROVIDERS = {
  place: { id: 'place' as AtexoProviderId, baseUrl: 'https://www.marches-publics.gouv.fr' },
  mxm: { id: 'mxm' as AtexoProviderId, baseUrl: 'https://marches.maximilien.fr' },
  bdr: { id: 'bdr' as AtexoProviderId, baseUrl: 'https://marches.departement13.fr' },
}

const ADVSEARCH_PATH = '/?page=Entreprise.EntrepriseAdvancedSearch'
const NAV_TIMEOUT_MS = 45_000

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

async function submitForm(page: Page, baseUrl: string, keyword: string): Promise<boolean> {
  await page.goto(baseUrl + ADVSEARCH_PATH, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS })

  const safeKw = stripAccents(keyword)
  const kwInput = page.locator('input[name$="$AdvancedSearch$keywordSearch"]').first()
  if ((await kwInput.count()) === 0) return false
  await kwInput.fill(safeKw)

  const catSelect = page.locator('select[name$="$AdvancedSearch$categorie"]').first()
  if ((await catSelect.count()) > 0) {
    try { await catSelect.selectOption({ value: '3' }) } catch {}
  }

  const flou = page.locator('input[name$="$AdvancedSearch$rechercheFloue"]').first()
  if ((await flou.count()) > 0) {
    try { if (!(await flou.isChecked())) await flou.check() } catch {}
  }

  const submit = page
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
  if ((await submit.count()) === 0) return false

  const respP = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('AdvancedSearch'),
    { timeout: NAV_TIMEOUT_MS },
  )
  await submit.click({ timeout: 5000, noWaitAfter: true })
  await respP
  await page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT_MS }).catch(() => {})
  await page.waitForTimeout(800)
  return true
}

async function gotoNext(page: Page): Promise<boolean> {
  const a = page
    .locator(
      'a:has(span[data-original-title="Aller à la page suivante"]),'
      + ' a:has(span[title="Aller à la page suivante"])',
    )
    .first()
  if ((await a.count()) === 0) return false
  const disabled = await a
    .evaluate((el) => {
      const a2 = el as HTMLAnchorElement
      const href = a2.getAttribute('href')
      const onclick = a2.getAttribute('onclick')
      if (a2.classList.contains('disabled') || a2.getAttribute('aria-disabled') === 'true') return true
      if ((!href || href === '#') && !onclick) return true
      return false
    })
    .catch(() => false)
  if (disabled) return false

  try {
    const respP = page.waitForResponse((r) => r.request().method() === 'POST', { timeout: NAV_TIMEOUT_MS })
    await a.click({ timeout: 10_000, noWaitAfter: true })
    await respP
    await page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT_MS }).catch(() => {})
  } catch {
    return false
  }
  await page.waitForTimeout(800)
  return true
}

async function scrapeOne(
  browser: Browser,
  baseUrl: string,
  providerId: AtexoProviderId,
  keyword: string,
  maxPages: number,
): Promise<{ items: AtexoApifyItem[]; pages: number; durationMs: number }> {
  const t0 = Date.now()
  const context: BrowserContext = await browser.newContext({
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  })
  await context.route('**/*', (r) => {
    const t = r.request().resourceType()
    if (t === 'image' || t === 'font' || t === 'media') return r.abort()
    return r.continue()
  })

  const items: AtexoApifyItem[] = []
  let pages = 0
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(NAV_TIMEOUT_MS)
    const ok = await submitForm(page, baseUrl, keyword)
    if (!ok) {
      console.error(`[${providerId}:"${keyword}"] submit failed`)
      return { items, pages, durationMs: Date.now() - t0 }
    }

    for (let n = 1; n <= maxPages; n++) {
      const html = await page.content()
      const parsed = parseListingPage(html, baseUrl, providerId)
      pages++
      console.log(`  [${providerId}:"${keyword}"] page ${n}/${parsed.totalPages ?? '?'} → ${parsed.items.length} items (totalRes=${parsed.totalResults ?? '?'})`)
      if (parsed.items.length === 0) break
      items.push(...parsed.items)
      if (parsed.totalPages !== null && n >= parsed.totalPages) break
      if (n === maxPages) break
      const ok2 = await gotoNext(page)
      if (!ok2) break
    }
  } finally {
    await context.close().catch(() => {})
  }
  return { items, pages, durationMs: Date.now() - t0 }
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

async function scenarioSingle(provider: keyof typeof PROVIDERS, keyword: string): Promise<void> {
  const browser = await chromium.launch({ headless: true })
  console.log(`\n=== Single sub-run: ${provider} / "${keyword}" / 10 pages ===`)
  try {
    const r = await scrapeOne(browser, PROVIDERS[provider].baseUrl, PROVIDERS[provider].id, keyword, 10)
    console.log(`\nRésultat : ${r.items.length} items, ${r.pages} pages, ${r.durationMs}ms`)
    if (r.items.length > 0) {
      console.log('\nExemples :')
      r.items.slice(0, 3).forEach((it) => {
        console.log(`  - ${it.intitule?.slice(0, 80)} | ${it.organisme?.slice(0, 50)} | ${it.date_limite_remise}`)
      })
    }
    console.log(`\n✓ Critère succès : ≥ 50 items → ${r.items.length >= 50 ? 'OK' : 'KO'}`)
  } finally {
    await browser.close().catch(() => {})
  }
}

async function scenarioMulti(provider: keyof typeof PROVIDERS): Promise<void> {
  const KW = ['communication', 'evenementiel', 'audiovisuel', 'video', 'graphisme']
  const browser = await chromium.launch({ headless: true })
  console.log(`\n=== Multi-keyword: ${provider} / [${KW.join(', ')}] / 3 pages chacun ===`)
  let totalItems = 0
  let totalErrors = 0
  try {
    for (const kw of KW) {
      try {
        const r = await scrapeOne(browser, PROVIDERS[provider].baseUrl, PROVIDERS[provider].id, kw, 3)
        totalItems += r.items.length
        console.log(`  → "${kw}" : ${r.items.length} items en ${r.pages} pages, ${r.durationMs}ms`)
      } catch (e) {
        totalErrors++
        console.error(`  → "${kw}" : ERREUR`, e)
      }
    }
    console.log(`\nRésultat : ${totalItems} items totaux, ${totalErrors} erreurs / ${KW.length} keywords`)
    console.log(`✓ Critère succès : 0 erreur → ${totalErrors === 0 ? 'OK' : 'KO'}`)
  } finally {
    await browser.close().catch(() => {})
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const mode = args[0] ?? 'single'

  if (mode === 'multi') {
    const provider = (args[1] ?? 'place') as keyof typeof PROVIDERS
    if (!(provider in PROVIDERS)) throw new Error(`provider inconnu: ${provider}`)
    await scenarioMulti(provider)
  } else {
    // 'single' (défaut) ou un nom de provider
    const provider = ((mode in PROVIDERS) ? mode : 'place') as keyof typeof PROVIDERS
    const keyword = args[1] ?? args[(mode in PROVIDERS) ? 0 : 1] ?? 'communication'
    if (!(provider in PROVIDERS)) throw new Error(`provider inconnu: ${provider}`)
    await scenarioSingle(provider, keyword)
  }
}

main().catch((err) => {
  console.error('Erreur fatale:', err)
  process.exit(1)
})
