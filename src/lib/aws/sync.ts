import { runActorAndCollect } from './apify-client'
import { transformAwsMpiItem } from './transform'
import type { AwsMpiActorInput, AwsMpiApifyItem, AwsMpiSyncResult, ApifyRun } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Sync AWS MPI.
//
// Flow :
//   1. Lance 1 run Apify unique (l'actor scrape les 22 keywords en interne)
//   2. Récupère le dataset Apify
//   3. Transforme les items → records `tenders`
//   4. Filtre type_marche = 'SERVICES' (par sécurité — IDN=S est déjà appliqué
//      dans l'actor, mais on resécurise côté Next.js)
//   5. Upsert batch 50 dans Supabase (onConflict: idweb)
//
// Différence avec Atexo : 1 seul run (pas de parallélisation par provider)
// car la plateforme est unique.
// ─────────────────────────────────────────────────────────────────────────────

interface SyncOptions {
  /** Filtre type marché — 'services' (défaut) | null = tous */
  categorie?: 'services' | 'travaux' | 'fournitures' | null
  /** Override keywords (défaut : les 22 keywords de l'actor) */
  keywords?: ReadonlyArray<string>
  /** Délai minimum avant date limite (défaut 15j) */
  minDaysUntilDeadline?: number
  /** Pages max par keyword dans l'actor (défaut 10) */
  maxPagesPerKeyword?: number
  /** Max fiches de détail à enrichir (défaut 100) */
  maxDetailFetches?: number
}

/**
 * Sync AWS MPI — 1 run Apify, puis upsert dans Supabase.
 *
 * @param supabaseAdmin - client Supabase service_role
 * @param opts - options de sync
 */
export async function syncAwsMpiTenders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  opts: SyncOptions = {},
): Promise<AwsMpiSyncResult> {
  const categorie = opts.categorie === undefined ? 'services' : opts.categorie
  const minDaysUntilDeadline = opts.minDaysUntilDeadline ?? 15

  // Construction input actor
  const input: AwsMpiActorInput = {
    ...(opts.keywords && opts.keywords.length > 0 ? { keywords: [...opts.keywords] } : {}),
    filters: {
      minDaysUntilDeadline,
      maxPagesPerKeyword: opts.maxPagesPerKeyword ?? 10,
    },
    maxDetailFetches: opts.maxDetailFetches ?? 100,
  }

  console.log(
    `[sync-aws] Démarrage — categorie=${categorie}, `
    + `minDaysUntilDeadline=${minDaysUntilDeadline}, `
    + `keywords=${opts.keywords ? opts.keywords.length : 'default (22)'}`,
  )

  const wallStart = Date.now()

  // ── 1 : run Apify ──────────────────────────────────────────────────────────
  let allItems: AwsMpiApifyItem[]
  let run: ApifyRun
  try {
    const result = await runActorAndCollect(input)
    allItems = result.items
    run = result.run
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[sync-aws] Run Apify échoué : ${msg}`)
    throw e
  }

  const wallMs = Date.now() - wallStart
  console.log(`[sync-aws] Run ${run.id} terminé (${run.status}) en ${(wallMs / 1000).toFixed(1)}s — ${allItems.length} items`)

  // ── 2 : transform ──────────────────────────────────────────────────────────
  const records = allItems
    .map(transformAwsMpiItem)
    .filter((r): r is NonNullable<ReturnType<typeof transformAwsMpiItem>> => r !== null)

  // ── 3 : filtre type_marche ─────────────────────────────────────────────────
  const filtered = categorie === 'services'
    ? records.filter(r => r.type_marche === 'SERVICES' || r.type_marche === null)
    : records

  const skipped = allItems.length - filtered.length

  // ── 4 : upsert par batch de 50 ─────────────────────────────────────────────
  let inserted = 0
  let errors = 0
  const BATCH = 50
  for (let i = 0; i < filtered.length; i += BATCH) {
    const batch = filtered.slice(i, i + BATCH)
    const { data, error } = await supabaseAdmin
      .from('tenders')
      .upsert(batch, { onConflict: 'idweb', ignoreDuplicates: false })
      .select('idweb')
    if (error) {
      console.error(`[sync-aws] Upsert error batch=${i}:`, error.message)
      errors += batch.length
    } else {
      inserted += data?.length ?? 0
    }
  }

  const result2: AwsMpiSyncResult = {
    apifyRunId: run.id,
    fetched: allItems.length,
    inserted,
    skipped,
    errors,
    apifyRunDurationSecs: Math.round(run.stats?.runTimeSecs ?? wallMs / 1000),
  }

  console.log('[sync-aws] Résultat:', result2)
  return result2
}
