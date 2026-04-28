/**
 * Acteur Apify — Atexo MPE Scraper
 *
 * Scrape les consultations en cours sur les profils acheteurs Atexo Local
 * Trust MPE (PLACE, Maximilien, ...) et expose un dataset normalisé.
 *
 * Input :
 *   { providers: [{ id, baseUrl }], filters: { categorie, maxAgeDays }, maxPagesPerProvider }
 *
 * Output (dataset items) :
 *   AtexoApifyItem (cf. src/types.ts)
 *
 * Particularité Atexo : moteur PHP PRADO avec viewstate ~100 KB dans
 *   `PRADO_PAGESTATE` qui doit être renvoyé dans chaque POST. Détails dans
 *   `src/prado.ts` et `src/scraper.ts`.
 */

import { Actor, log } from 'apify'
import { scrapeProvider } from './scraper'
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
    maxPagesPerProvider: Math.min(Math.max(1, input.maxPagesPerProvider ?? 3), 500),
    keywords: Array.isArray(input.filters?.keywords) ? input.filters!.keywords : [],
    minDaysUntilDeadline: Math.max(0, input.filters?.minDaysUntilDeadline ?? 21),
  }

  log.info(
    `Démarrage Atexo MPE — providers=[${input.providers.map(p => p.id).join(', ')}], `
    + `categorie=${opts.categorie}, keywords=[${opts.keywords.join(', ')}], `
    + `minDaysUntilDeadline=${opts.minDaysUntilDeadline}, maxPages=${opts.maxPagesPerProvider}`,
  )

  let totalPushed = 0
  let totalPages = 0
  let totalSubRuns = 0
  const errors: Array<{ provider: string; error: string }> = []

  for (const provider of input.providers) {
    try {
      const r = await scrapeProvider(provider, opts)
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

  log.info(`Total : ${totalPushed} items, ${totalPages} pages, ${totalSubRuns} sub-runs, ${errors.length} provider(s) en erreur`)

  await Actor.setValue('SUMMARY', {
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
