import { runActorAndCollect } from './apify-client'
import { activeProviders, ATEXO_KEYWORDS_COMM } from './providers'
import { transformAtexoItem } from './transform'
import type { AtexoActorInput, AtexoSyncResult } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Sync principal Atexo MPE.
//
// Pattern aligné sur `src/lib/ted/sync.ts` :
//   1. Trigger un run Apify de l'actor `atexo-mpe-scraper`
//   2. Wait jusqu'à SUCCEEDED (max 8 min)
//   3. Fetch tous les items du dataset Apify
//   4. Transform → upsert batch 50 dans `tenders` (onConflict: idweb)
//   5. Filtre type_marche='SERVICES' pour rester aligné avec le scope projet
//
// L'embedding des nouveaux tenders se fait dans la route cron en aval
// (cf. src/app/api/cron/sync-atexo/route.ts), pour rester homogène avec
// les patterns BOAMP et TED.
// ─────────────────────────────────────────────────────────────────────────────

interface SyncOptions {
  /** [legacy] Nombre de jours à remonter — kept for compat avec l'ancien call signature */
  daysBack?: number
  /** Filtre type marché — 'services' pour ne récupérer que les services (défaut). null = tous */
  categorie?: 'services' | 'travaux' | 'fournitures' | null
  /**
   * Garde-fou : limite de pages scrapées par plateforme/keyword.
   * V2 (HTTP fetch) : hard-cap 3 (PRADO state corruption au-delà).
   * V3 (Playwright, 2026-04-28) : plus de hard-cap, défaut bumped à 50.
   */
  maxPagesPerProvider?: number
  /**
   * Override keywords. Si non fourni, on utilise ATEXO_KEYWORDS_COMM (16 keywords
   * métier ciblant communication/événementiel/audiovisuel/design).
   * Passer [] pour basculer en mode listing (tous AO non filtrés).
   */
  keywords?: ReadonlyArray<string>
  /** Délai minimum avant date limite de remise pour ingérer (défaut 21j). */
  minDaysUntilDeadline?: number
  /** Override providers (sinon : tous les providers `enabled: true` de providers.ts) */
  providers?: ReadonlyArray<{ id: import('./types').AtexoProviderId; baseUrl: string }>
}

/**
 * Sync Atexo MPE — délègue le scraping à l'actor Apify, puis upsert dans Supabase.
 *
 * @param supabaseAdmin - client Supabase service_role
 * @param opts - options de sync
 */
export async function syncAtexoTenders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  opts: SyncOptions = {},
): Promise<AtexoSyncResult> {
  const categorie = opts.categorie === undefined ? 'services' : opts.categorie
  const providers = opts.providers ?? activeProviders().map(p => ({ id: p.id, baseUrl: p.baseUrl }))
  const keywords = opts.keywords ?? ATEXO_KEYWORDS_COMM
  const minDaysUntilDeadline = opts.minDaysUntilDeadline ?? 21

  const input: AtexoActorInput = {
    providers: [...providers],
    filters: {
      categorie,
      maxAgeDays: opts.daysBack ?? 7, // legacy field kept for actor compat
      keywords: [...keywords],
      minDaysUntilDeadline,
    },
    // V3 Playwright : hard-cap PRADO levé. 50 pages × 20 items = 1000 max
    // par sub-run, largement assez pour couvrir le longtail des keywords.
    maxPagesPerProvider: opts.maxPagesPerProvider ?? 50,
  }

  console.log(
    `[sync-atexo] Démarrage : categorie=${categorie}, `
    + `providers=[${providers.map(p => p.id).join(', ')}], `
    + `keywords=${keywords.length}, minDaysUntilDeadline=${minDaysUntilDeadline}`,
  )

  // 1-3 : trigger + wait + fetch
  const { items, run } = await runActorAndCollect(input)

  // 4 : transform
  const records = items
    .map(transformAtexoItem)
    .filter((r): r is NonNullable<ReturnType<typeof transformAtexoItem>> => r !== null)

  // Filtre type_marche : si categorie='services' demandé côté actor, on a déjà
  // un dataset majoritairement SERVICES — on resécurise en aval pour éviter
  // qu'un AO mal classé pollue la base. Si categorie=null, on accepte tout.
  const filtered = categorie === 'services'
    ? records.filter(r => r.type_marche === 'SERVICES' || r.type_marche === null)
    : records

  const skipped = items.length - filtered.length

  // 5 : upsert par batch de 50, onConflict: idweb
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
      console.error(`[sync-atexo] Upsert error batch=${i}:`, error.message)
      errors += batch.length
    } else {
      inserted += data?.length ?? 0
    }
  }

  const result: AtexoSyncResult = {
    apifyRunId: run.id,
    fetched: items.length,
    inserted,
    skipped,
    errors,
    apifyRunDurationSecs: run.stats?.runTimeSecs ?? null,
  }

  console.log('[sync-atexo] Résultat:', result)
  return result
}
