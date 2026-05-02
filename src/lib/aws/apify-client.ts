import type {
  AwsMpiActorInput,
  AwsMpiApifyItem,
  ApifyRun,
  ApifyRunStatus,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Wrappers Apify API v2 pour l'actor AWS MPI.
//
// Variables d'environnement requises :
//   APIFY_API_TOKEN     — token Apify (partagé avec l'actor Atexo)
//   APIFY_AWS_ACTOR_ID  — ex: "username~aws-mpi-scraper"
// ─────────────────────────────────────────────────────────────────────────────

const APIFY_BASE = 'https://api.apify.com/v2'

function token(): string {
  const t = process.env.APIFY_API_TOKEN
  if (!t) throw new Error('APIFY_API_TOKEN manquant dans l\'environnement')
  return t
}

function actorId(): string {
  const id = process.env.APIFY_AWS_ACTOR_ID
  if (!id) throw new Error('APIFY_AWS_ACTOR_ID manquant dans l\'environnement (ex: "username~aws-mpi-scraper")')
  return id
}

interface ApifyEnvelope<T> {
  data: T
}

// AWS MPI est HTTP-only (pas de Playwright) — timeout plus serré que Atexo.
// 22 keywords × 10 pages × ~1s = ~220s listing + ~15s details ≈ 240s.
// On set à 300s (5 min) pour conserver une marge.
const DEFAULT_RUN_TIMEOUT_SECS = 300

export async function triggerActor(
  input: AwsMpiActorInput,
  timeoutSecs = DEFAULT_RUN_TIMEOUT_SECS,
): Promise<ApifyRun> {
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
    throw new Error(`Apify triggerActor (AWS) failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as ApifyEnvelope<ApifyRun>
  return json.data
}

export async function getRun(runId: string): Promise<ApifyRun> {
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(actorId())}/runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token())}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Apify getRun (AWS) failed: ${res.status} ${res.statusText}`)
  const json = (await res.json()) as ApifyEnvelope<ApifyRun>
  return json.data
}

const TERMINAL_STATUSES: ReadonlyArray<ApifyRunStatus> = [
  'SUCCEEDED',
  'FAILED',
  'TIMED-OUT',
  'ABORTED',
]

export async function waitForRun(runId: string, maxWaitMs = 340_000): Promise<ApifyRun> {
  const start = Date.now()
  const POLL_MS = 10_000
  let last: ApifyRun | null = null
  while (Date.now() - start < maxWaitMs) {
    last = await getRun(runId)
    if (TERMINAL_STATUSES.includes(last.status)) return last
    await new Promise(r => setTimeout(r, POLL_MS))
  }
  if (!last) throw new Error('Apify waitForRun (AWS): aucun statut récupéré')
  throw new Error(
    `Apify waitForRun (AWS): timeout (${Math.round(maxWaitMs / 1000)}s) — runId=${runId}, dernier statut=${last.status}`,
  )
}

export async function fetchDatasetItems(datasetId: string): Promise<AwsMpiApifyItem[]> {
  const items: AwsMpiApifyItem[] = []
  const PAGE = 1000
  let offset = 0
  while (true) {
    const url = `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items`
      + `?token=${encodeURIComponent(token())}`
      + `&format=json&clean=true&offset=${offset}&limit=${PAGE}`
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`Apify fetchDatasetItems (AWS) failed: ${res.status} ${res.statusText}`)
    const page = (await res.json()) as AwsMpiApifyItem[]
    if (!Array.isArray(page) || page.length === 0) break
    items.push(...page)
    if (page.length < PAGE) break
    offset += PAGE
  }
  return items
}

/**
 * Helper tout-en-un : trigger → wait → fetch dataset.
 * Si TIMED-OUT → récupère les items partiels (mieux que tout perdre).
 */
export async function runActorAndCollect(
  input: AwsMpiActorInput,
  maxWaitMs?: number,
): Promise<{ items: AwsMpiApifyItem[]; run: ApifyRun }> {
  const run0 = await triggerActor(input)
  console.log(`[aws/apify] Run lancé : ${run0.id} (${run0.status})`)
  const run = await waitForRun(run0.id, maxWaitMs)

  if (run.status === 'SUCCEEDED') {
    const items = await fetchDatasetItems(run.defaultDatasetId)
    console.log(`[aws/apify] Run ${run.id} ✓ ${items.length} items`)
    return { items, run }
  }

  if (run.status === 'TIMED-OUT') {
    const items = await fetchDatasetItems(run.defaultDatasetId).catch(() => [])
    console.warn(`[aws/apify] Run ${run.id} TIMED-OUT — récupération partielle de ${items.length} items`)
    return { items, run }
  }

  throw new Error(`Apify run (AWS) ${run.id} terminé en statut ${run.status}`)
}
