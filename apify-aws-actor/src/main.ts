/**
 * Acteur Apify — AWS / Marchés Publics Info Scraper (V1)
 *
 * Scrape les consultations SERVICES en cours sur marches-publics.info
 * (plateforme AWSolutions MPE) par mots-clés et expose un dataset normalisé.
 *
 * Input :
 *   {
 *     keywords?: string[]          // défaut : 22 keywords comm/événementiel/design
 *     filters?: {
 *       minDaysUntilDeadline?: number  // défaut 15
 *       maxPagesPerKeyword?: number    // défaut 10
 *     }
 *     maxDetailFetches?: number    // défaut 100
 *   }
 *
 * Output (dataset items) :
 *   AwsMpiApifyItem (cf. src/types.ts) — contrat IMMUTABLE depuis V1.
 *
 * Architecture :
 *   - Pure HTTP fetch + cheerio (pas de Playwright)
 *   - 1 Chromium n'est pas utilisé — image apify/actor-node:20 (light)
 *   - Session cookie POST pour la recherche, GET pour la pagination
 *   - Dedup cross-keyword par mpiRef
 *   - Enrichissement CPV/SIRET/valeur via fetch de fiches détail (8 parallèles)
 */

import { Actor, log } from 'apify'
import { scrapeAll, SCRAPER_VERSION } from './scraper.js'
import type { AwsMpiActorInput } from './types.js'

// 22 mots-clés métier : communication, événementiel, audiovisuel, design, ...
// Pas d'accents pour maximiser la compatibilité avec l'encodage du serveur.
export const AWS_KEYWORDS_DEFAULT: string[] = [
  'communication',
  'evenementiel',
  'audiovisuel',
  'video',
  'graphisme',
  'design',
  'publicite',
  'marketing',
  'media',
  'imprimerie',
  'edition',
  'seminaire',
  'salon',
  'campagne',
  'identite visuelle',
  'relations publiques',
  'reseaux sociaux',
  'scenographie',
  'podcast',
  'signaletique',
  'numerique',
  'webdesign',
]

async function main(): Promise<void> {
  await Actor.init()

  const rawInput = (await Actor.getInput<AwsMpiActorInput>()) ?? {}
  const input = rawInput as AwsMpiActorInput

  // ── Validation / defaults ──────────────────────────────────────────────────
  const keywords = Array.isArray(input.keywords) && input.keywords.length > 0
    ? input.keywords
    : AWS_KEYWORDS_DEFAULT

  const minDaysUntilDeadline = Math.max(0, input.filters?.minDaysUntilDeadline ?? 15)
  const maxPagesPerKeyword = Math.min(
    Math.max(1, input.filters?.maxPagesPerKeyword ?? 10),
    50,
  )
  const maxDetailFetches = Math.max(0, input.maxDetailFetches ?? 100)

  log.info(
    `[${SCRAPER_VERSION}] Démarrage AWS MPI scraper — `
    + `keywords=${keywords.length}, `
    + `minDaysUntilDeadline=${minDaysUntilDeadline}, `
    + `maxPagesPerKeyword=${maxPagesPerKeyword}, `
    + `maxDetailFetches=${maxDetailFetches}`,
  )

  // ── Scrape ─────────────────────────────────────────────────────────────────
  let totalPushed = 0

  const result = await scrapeAll(
    { keywords, minDaysUntilDeadline, maxPagesPerKeyword, maxDetailFetches },
    async (item) => {
      await Actor.pushData(item)
      totalPushed++
    },
  )

  // ── Résumé ─────────────────────────────────────────────────────────────────
  log.info(
    `[${SCRAPER_VERSION}] Terminé — `
    + `pushed=${result.pushed}, fetched=${result.fetched}, `
    + `skipped=${result.skipped}, errors=${result.errors}`,
  )

  await Actor.setValue('SUMMARY', {
    scraperVersion: SCRAPER_VERSION,
    totalPushed,
    fetched: result.fetched,
    skipped: result.skipped,
    errors: result.errors,
    keywordsUsed: keywords.length,
    finishedAt: new Date().toISOString(),
  })

  await Actor.exit()
}

main().catch(async (err) => {
  log.exception(err as Error, 'Erreur fatale')
  await Actor.exit({ exitCode: 1 })
})
