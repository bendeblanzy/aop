import type {
  AtexoActorInput,
  AtexoApifyItem,
  ApifyRun,
  ApifyRunStatus,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Wrappers minimaux de l'API Apify v2.
//
// Documentation officielle : https://docs.apify.com/api/v2
//
// On utilise :
//   - POST /v2/acts/{actorId}/runs                 → trigger run
//   - GET  /v2/acts/{actorId}/runs/{runId}         → poll status
//   - GET  /v2/datasets/{datasetId}/items          → fetch dataset items
//
// Auth : query param `?token=...` (équivalent au Bearer header, accepté partout).
// ─────────────────────────────────────────────────────────────────────────────

const APIFY_BASE = 'https://api.apify.com/v2'

function token(): string {
  const t = process.env.APIFY_API_TOKEN
  if (!t) {
    throw new Error('APIFY_API_TOKEN manquant dans l\'environnement')
  }
  return t
}

function actorId(): string {
  const id = process.env.APIFY_ATEXO_ACTOR_ID
  if (!id) {
    throw new Error('APIFY_ATEXO_ACTOR_ID manquant dans l\'environnement (ex: "username~atexo-mpe-scraper")')
  }
  return id
}

interface ApifyEnvelope<T> {
  data: T
}

/**
 * Trigger un run de l'actor Atexo et retourne le run object initial.
 *
 * V3 (Playwright) : 6 plateformes × 8 keywords = jusqu'à 48 sub-runs.
 * Chaque sub-run met 10-30s, certains sub-runs très lents (~50s) sur les
 * formulaires "no result". On cap Apify à 420s (7 min) — si tous les
 * sub-runs ne tiennent pas, on récupère quand même les items partiels
 * via le `runActorAndCollect`. Marge 180s côté Vercel pour upsert + embed.
 */
const DEFAULT_RUN_TIMEOUT_SECS = 420

export async function triggerActor(input: AtexoActorInput, timeoutSecs = DEFAULT_RUN_TIMEOUT_SECS): Promise<ApifyRun> {
  const url =
    `${APIFY_BASE}/acts/${encodeURIComponent(actorId())}/runs`
    + `?token=${encodeURIComponent(token())}`
    + `&timeout=${encodeURIComponent(String(timeoutSecs))}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Apify triggerActor failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as ApifyEnvelope<ApifyRun>
  return json.data
}

/** Récupère l'état courant d'un run. */
export async function getRun(runId: string): Promise<ApifyRun> {
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(actorId())}/runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token())}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) {
    throw new Error(`Apify getRun failed: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as ApifyEnvelope<ApifyRun>
  return json.data
}

const TERMINAL_STATUSES: ReadonlyArray<ApifyRunStatus> = [
  'SUCCEEDED',
  'FAILED',
  'TIMED-OUT',
  'ABORTED',
]

/**
 * Attend qu'un run termine (ou timeout). Polling toutes les 10s.
 *
 * @param runId    ID du run Apify
 * @param maxWaitMs  Timeout total côté Vercel (défaut 460s pour laisser un
 *                   peu plus de marge que le timeout Apify de 420s :
 *                   l'actor s'arrête, on lit l'état, on récupère partiels).
 */
export async function waitForRun(
  runId: string,
  maxWaitMs = 460_000,
): Promise<ApifyRun> {
  const start = Date.now()
  const POLL_MS = 10_000
  let last: ApifyRun | null = null
  while (Date.now() - start < maxWaitMs) {
    last = await getRun(runId)
    if (TERMINAL_STATUSES.includes(last.status)) return last
    await new Promise(r => setTimeout(r, POLL_MS))
  }
  if (!last) throw new Error('Apify waitForRun: aucun statut récupéré')
  throw new Error(
    `Apify waitForRun: timeout (${Math.round(maxWaitMs / 1000)}s) — runId=${runId}, dernier statut=${last.status}`,
  )
}

/**
 * Récupère les items d'un dataset Apify. Pour les gros datasets, on pagine
 * via `offset`/`limit`.
 */
export async function fetchDatasetItems(datasetId: string): Promise<AtexoApifyItem[]> {
  const items: AtexoApifyItem[] = []
  const PAGE = 1000
  let offset = 0
  while (true) {
    const url = `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items`
      + `?token=${encodeURIComponent(token())}`
      + `&format=json&clean=true&offset=${offset}&limit=${PAGE}`
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) {
      throw new Error(`Apify fetchDatasetItems failed: ${res.status} ${res.statusText}`)
    }
    const page = (await res.json()) as AtexoApifyItem[]
    if (!Array.isArray(page) || page.length === 0) break
    items.push(...page)
    if (page.length < PAGE) break
    offset += PAGE
  }
  return items
}

/**
 * Helper "tout-en-un" : trigger + wait + fetch.
 * Renvoie les items + le runId pour log/debug.
 *
 * V3 : si le run finit en TIMED-OUT (cap atteint avant que tous les
 * sub-runs aient pu tourner), on récupère quand même le dataset partiel et
 * on continue. Sinon on perdrait les ~30-50 items collectés en début de run.
 */
export async function runActorAndCollect(
  input: AtexoActorInput,
  maxWaitMs?: number,
): Promise<{ items: AtexoApifyItem[]; run: ApifyRun }> {
  const run0 = await triggerActor(input)
  console.log(`[atexo/apify] Run lancé : ${run0.id} (${run0.status})`)
  const run = await waitForRun(run0.id, maxWaitMs)

  if (run.status === 'SUCCEEDED') {
    const items = await fetchDatasetItems(run.defaultDatasetId)
    console.log(`[atexo/apify] Run ${run.id} ✓ ${items.length} items`)
    return { items, run }
  }

  if (run.status === 'TIMED-OUT') {
    // Récupère quand même les items déjà pushés avant le timeout — mieux que perdre tout
    const items = await fetchDatasetItems(run.defaultDatasetId).catch(() => [])
    console.warn(
      `[atexo/apify] Run ${run.id} TIMED-OUT — récupération partielle de ${items.length} items`,
    )
    return { items, run }
  }

  throw new Error(`Apify run ${run.id} terminé en statut ${run.status}`)
}
