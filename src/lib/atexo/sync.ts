import { runActorAndCollect } from './apify-client'
import { activeProviders, ATEXO_KEYWORDS_COMM } from './providers'
import { transformAtexoItem } from './transform'
import type { AtexoActorInput, AtexoApifyItem, AtexoSyncResult, ApifyRun, AtexoProviderId } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Sync principal Atexo MPE.
//
// V3 (2026-04-28, parallélisation) :
//   1. Pour chaque provider actif, on lance UN run Apify dédié (input avec
//      un seul provider, mais tous les keywords). Les runs partent en
//      parallèle via Promise.allSettled — Apify supporte largement la
//      concurrence (32+ runs simultanés sur free tier).
//   2. Chaque run a 420s de timeout pour scraper sa plateforme avec les
//      22 keywords métier. Si un run TIMED-OUT, on récupère les items
//      partiels via runActorAndCollect (et on continue avec les autres).
//   3. On agrège tous les items, transform → upsert batch 50 dans `tenders`.
//   4. Filtre type_marche='SERVICES' pour rester aligné avec le scope projet.
//
// Bénéfice vs V2/V3-séquentiel : au lieu de séquencer 6 plateformes en un
// seul run (et timeout à PLACE+mxm), on couvre les 6 simultanément en ~7 min
// max wall-clock. L'embedding des nouveaux tenders se fait dans la route
// cron en aval (cf. src/app/api/cron/sync-atexo/route.ts).
// ─────────────────────────────────────────────────────────────────────────────

interface SyncOptions {
  /** [legacy] Nombre de jours à remonter — kept for compat avec l'ancien call signature */
  daysBack?: number
  /** Filtre type marché — 'services' pour ne récupérer que les services (défaut). null = tous */
  categorie?: 'services' | 'travaux' | 'fournitures' | null
  /**
   * Garde-fou : limite de pages scrapées par plateforme/keyword.
   * V2 (HTTP fetch) : hard-cap 3 (PRADO state corruption au-delà).
   * V3 (Playwright, 2026-04-28) : plus de hard-cap, défaut bumped à 30.
   */
  maxPagesPerProvider?: number
  /**
   * Override keywords. Si non fourni, on utilise ATEXO_KEYWORDS_COMM (22 keywords
   * métier ciblant communication/événementiel/audiovisuel/design).
   * Passer [] pour basculer en mode listing (tous AO non filtrés).
   */
  keywords?: ReadonlyArray<string>
  /** Délai minimum avant date limite de remise pour ingérer (défaut 15j). */
  minDaysUntilDeadline?: number
  /** Override providers (sinon : tous les providers `enabled: true` de providers.ts) */
  providers?: ReadonlyArray<{ id: AtexoProviderId; baseUrl: string }>
}

interface ProviderRunResult {
  providerId: AtexoProviderId
  items: AtexoApifyItem[]
  run: ApifyRun | null
  error: string | null
}

/**
 * Lance un run Apify dédié à un seul provider et retourne les items scrapés.
 * Le `mode` détermine si on passe les keywords (mode 'keyword') ou un tableau
 * vide (mode 'listing' = scraping global /AllCons sans filtre keyword).
 */
async function runOneProvider(
  provider: { id: AtexoProviderId; baseUrl: string },
  baseInput: Omit<AtexoActorInput, 'providers'>,
  mode: 'keyword' | 'listing',
): Promise<ProviderRunResult> {
  const input: AtexoActorInput = {
    providers: [provider],
    filters: {
      ...baseInput.filters,
      // Mode listing : on vide le tableau de keywords pour basculer le scraper
      // sur le path /AllCons (1 sub-run global au lieu de N sub-runs par mot-clé).
      keywords: mode === 'listing' ? [] : baseInput.filters.keywords,
    },
    maxPagesPerProvider: baseInput.maxPagesPerProvider,
  }
  try {
    const { items, run } = await runActorAndCollect(input)
    return { providerId: provider.id, items, run, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[sync-atexo] Provider ${provider.id} run échoué : ${msg}`)
    return { providerId: provider.id, items: [], run: null, error: msg }
  }
}

/**
 * Sync Atexo MPE — 1 run Apify par provider en parallèle, puis upsert dans Supabase.
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
  // On garde le mode/baseUrl du config provider — utile pour décider keyword vs listing
  const providersWithMode = opts.providers
    ? opts.providers.map(p => ({ id: p.id, baseUrl: p.baseUrl, mode: 'keyword' as const }))
    : activeProviders().map(p => ({ id: p.id, baseUrl: p.baseUrl, mode: p.mode }))
  const keywords = opts.keywords ?? ATEXO_KEYWORDS_COMM
  // V3 (2026-04-28) : passé de 21j à 15j — sur BOAMP le filtre 21j élimine
  // 64% des AO actifs, c'est trop strict pour des agences qui peuvent
  // répondre vite. 15j laisse une fenêtre raisonnable de réponse.
  const minDaysUntilDeadline = opts.minDaysUntilDeadline ?? 15

  const baseInput = {
    filters: {
      categorie,
      maxAgeDays: opts.daysBack ?? 7, // legacy field kept for actor compat
      keywords: [...keywords],
      minDaysUntilDeadline,
    },
    // V3 Playwright : hard-cap PRADO levé. 30 pages × 20 items = 600 max
    // par sub-run, suffisant pour couvrir les keywords les plus volumineux.
    maxPagesPerProvider: opts.maxPagesPerProvider ?? 30,
  }

  console.log(
    `[sync-atexo] Démarrage parallèle : categorie=${categorie}, `
    + `providers=[${providersWithMode.map(p => `${p.id}(${p.mode})`).join(', ')}] (${providersWithMode.length} runs Apify), `
    + `keywords=${keywords.length}, minDaysUntilDeadline=${minDaysUntilDeadline}`,
  )

  const wallStart = Date.now()

  // 1 : trigger N runs Apify en parallèle (1 par provider)
  // Apify supporte largement la concurrence — pas de back-pressure ici.
  const runResults = await Promise.all(
    providersWithMode.map(p =>
      runOneProvider({ id: p.id, baseUrl: p.baseUrl }, baseInput, p.mode),
    ),
  )

  const wallMs = Date.now() - wallStart

  // 2 : agrégation des items + log par-provider
  const allItems: AtexoApifyItem[] = []
  const perProviderStats: Array<{ provider: string; items: number; status: string; runId: string | null }> = []
  let firstRunId: string | null = null

  for (const r of runResults) {
    allItems.push(...r.items)
    if (r.run && !firstRunId) firstRunId = r.run.id
    perProviderStats.push({
      provider: r.providerId,
      items: r.items.length,
      status: r.error ? 'ERROR' : (r.run?.status ?? 'NORUN'),
      runId: r.run?.id ?? null,
    })
  }

  console.log(
    `[sync-atexo] Wall ${(wallMs / 1000).toFixed(1)}s — `
    + perProviderStats.map(p => `${p.provider}:${p.items}(${p.status})`).join(', '),
  )

  // 3 : transform
  const records = allItems
    .map(transformAtexoItem)
    .filter((r): r is NonNullable<ReturnType<typeof transformAtexoItem>> => r !== null)

  // Filtre type_marche : si categorie='services' demandé côté actor, on a déjà
  // un dataset majoritairement SERVICES — on resécurise en aval pour éviter
  // qu'un AO mal classé pollue la base. Si categorie=null, on accepte tout.
  const filtered = categorie === 'services'
    ? records.filter(r => r.type_marche === 'SERVICES' || r.type_marche === null)
    : records

  const skipped = allItems.length - filtered.length

  // 4 : upsert par batch de 50, onConflict: idweb
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

  // Compute aggregate runtime: sum of per-provider runtimes (sequential equivalent),
  // wall-clock = max (parallel reality)
  const totalRunSecs = runResults.reduce((acc, r) => acc + (r.run?.stats?.runTimeSecs ?? 0), 0)

  const result: AtexoSyncResult = {
    apifyRunId: firstRunId ?? 'no-run',
    fetched: allItems.length,
    inserted,
    skipped,
    errors,
    apifyRunDurationSecs: Math.round(totalRunSecs),
  }

  console.log('[sync-atexo] Résultat:', result)
  return result
}
