/**
 * Acteur Apify — Atexo MPE Scraper (V3 Playwright)
 *
 * Scrape les consultations en cours sur les profils acheteurs Atexo Local
 * Trust MPE (PLACE, Maximilien, ...) et expose un dataset normalisé.
 *
 * Input :
 *   { providers: [{ id, baseUrl }],
 *     filters: { categorie, keywords[], minDaysUntilDeadline },
 *     maxPagesPerProvider }
 *
 * Output (dataset items) :
 *   AtexoApifyItem (cf. src/types.ts) — contrat IMMUTABLE depuis V1.
 *
 * V3 (2026-04-28) :
 *   - Bascule vers Playwright headless (vs fetch HTTP brut en V2).
 *   - Plus de hard-cap PRADO 3 pages (le navigateur exécute le JS PRADO).
 *   - Plus de race PHP entre sub-runs (BrowserContext frais par sub-run).
 *   - 1 Chromium partagé pour tous les providers (économie mémoire).
 */

import { Actor, log } from 'apify'
import { scrapeProvider, launchSharedBrowser, SCRAPER_VERSION } from './scraper'
import type { AtexoActorInput } from './types'

async function main(): Promise<void> {
  await Actor.init()

  const rawInput = (await Actor.getInput<AtexoActorInput>()) ?? null
  if (!rawInput || !Array.isArray(rawInput.providers) || rawInput.providers.length === 0) {
    log.error('Input invalide : "providers" est requis et doit être un tableau non vide.')
    await Actor.exit({ exitCode: 1 })
    return
  }

  const input = rawInput as AtexoActorInput

  const opts = {
    categorie: input.filters?.categorie ?? 'services',
    // V3 : on relâche le cap (V2 était à 3 à cause de PRADO).
    // 50 pages × 20 items = 1000 items max par sub-run, suffisant pour
    // la couverture quasi-totale des keywords métier.
    maxPagesPerProvider: Math.min(Math.max(1, input.maxPagesPerProvider ?? 50), 500),
    keywords: Array.isArray(input.filters?.keywords) ? input.filters!.keywords : [],
    minDaysUntilDeadline: Math.max(0, input.filters?.minDaysUntilDeadline ?? 21),
    // P6 (2026-04-29) : enrichissement CPV/valeur/lots via fiche de détail.
    // Activé par défaut — coût ~12s pour 50 items (8 fetches parallèles × 200-800ms).
    // Budget total PLACE : ~294s listing + ~15s details = ~309s << timeout 420s.
    fetchDetails: true,
    maxDetailFetches: 50,
  }

  log.info(
    `[${SCRAPER_VERSION}] Démarrage Atexo MPE — `
    + `providers=[${input.providers.map((p) => p.id).join(', ')}], `
    + `categorie=${opts.categorie}, keywords=[${opts.keywords.join(', ')}], `
    + `minDaysUntilDeadline=${opts.minDaysUntilDeadline}, maxPages=${opts.maxPagesPerProvider}, `
    + `fetchDetails=${opts.fetchDetails} (max ${opts.maxDetailFetches})`,
  )

  let totalPushed = 0
  let totalPages = 0
  let totalSubRuns = 0
  const errors: Array<{ provider: string; error: string }> = []

  // 1 Chromium partagé pour tous les providers — gain mémoire & démarrage
  const browser = await launchSharedBrowser()
  log.info('Chromium headless lancé')

  try {
    for (const provider of input.providers) {
      try {
        const r = await scrapeProvider(provider, opts, browser)
        totalPushed += r.pushed
        totalPages += r.pagesFetched
        totalSubRuns += r.subRuns
        log.info(
          `[${provider.id}] ✓ ${r.pushed} items, ${r.pagesFetched} pages, ${r.subRuns} sub-runs`
          + (r.truncated ? ' (TRONQUÉ)' : ''),
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log.error(`[${provider.id}] ✗ ${msg}`)
        errors.push({ provider: provider.id, error: msg })
      }
    }
  } finally {
    await browser.close().catch(() => {})
  }

  log.info(
    `Total : ${totalPushed} items, ${totalPages} pages, ${totalSubRuns} sub-runs, `
    + `${errors.length} provider(s) en erreur`,
  )

  await Actor.setValue('SUMMARY', {
    scraperVersion: SCRAPER_VERSION,
    totalPushed,
    totalPages,
    totalSubRuns,
    errors,
    finishedAt: new Date().toISOString(),
  })

  await Actor.exit()
}

main().catch(async (err) => {
  log.exception(err as Error, 'Erreur fatale')
  await Actor.exit({ exitCode: 1 })
})
