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
    maxAgeDays: Math.min(Math.max(1, input.filters?.maxAgeDays ?? 7), 30),
    maxPagesPerProvider: Math.min(Math.max(1, input.maxPagesPerProvider ?? 50), 500),
  }

  log.info(
    `Démarrage scrape Atexo MPE — providers=[${input.providers.map(p => p.id).join(', ')}], `
    + `categorie=${opts.categorie}, maxAgeDays=${opts.maxAgeDays}, maxPages=${opts.maxPagesPerProvider}`,
  )

  let totalPushed = 0
  let totalPages = 0
  const errors: Array<{ provider: string; error: string }> = []

  for (const provider of input.providers) {
    try {
      const r = await scrapeProvider(provider, opts)
      totalPushed += r.pushed
      totalPages += r.pagesFetched
      log.info(
        `[${provider.id}] ✓ ${r.pushed} items poussés, ${r.pagesFetched} pages scrapées`
        + (r.truncated ? ' (TRONQUÉ — augmenter maxPagesPerProvider)' : ''),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`[${provider.id}] ✗ ${msg}`)
      errors.push({ provider: provider.id, error: msg })
    }
  }

  log.info(`Total : ${totalPushed} items poussés, ${totalPages} pages scrapées, ${errors.length} provider(s) en erreur`)

  await Actor.setValue('SUMMARY', {
    totalPushed,
    totalPages,
    errors,
    finishedAt: new Date().toISOString(),
  })

  await Actor.exit()
}

main().catch(async (err) => {
  log.exception(err as Error, 'Erreur fatale')
  await Actor.exit({ exitCode: 1 })
})
