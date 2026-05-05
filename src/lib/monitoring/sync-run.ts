import { adminClient } from '@/lib/supabase/admin'

/**
 * Helper de logging pour les routes cron de synchronisation.
 *
 * Wrapper non-invasif autour de la fonction métier d'une route cron :
 *   - INSERT un row `sync_runs` en statut "running" au début
 *   - exécute la fonction et mesure la durée
 *   - UPDATE le row avec status / métriques / error_messages à la fin
 *   - dans tous les cas, propage le résultat ou relance l'erreur
 *
 * La fonction métier reçoit l'id du run (utile pour persister des étapes
 * intermédiaires dans `metadata` si besoin) et retourne un objet
 * `SyncRunResult` contenant les métriques et le payload à renvoyer au cron.
 */

export type SyncSource =
  | 'boamp'
  | 'ted'
  | 'atexo'
  | 'aws'
  | 'dedup'
  | 'embed-tenders'
  | 'enrich-tenders'

export const SYNC_SOURCES: { id: SyncSource; label: string; cronPath: string }[] = [
  { id: 'boamp', label: 'BOAMP', cronPath: '/api/cron/sync-boamp' },
  { id: 'ted', label: 'TED', cronPath: '/api/cron/sync-ted' },
  { id: 'atexo', label: 'Atexo MPE', cronPath: '/api/cron/sync-atexo' },
  { id: 'aws', label: 'AWS MPI', cronPath: '/api/cron/sync-aws' },
  { id: 'dedup', label: 'Déduplication', cronPath: '/api/cron/sync-dedup' },
  { id: 'embed-tenders', label: 'Embeddings tenders', cronPath: '/api/cron/embed-tenders' },
  { id: 'enrich-tenders', label: 'Enrichissement BOAMP', cronPath: '/api/cron/enrich-tenders' },
]

export interface SyncRunMetrics {
  fetched?: number
  inserted?: number
  updated?: number
  errors?: number
  errorMessages?: string[]
  metadata?: Record<string, unknown>
  /** Si true, le run sera marqué `partial` même sans erreur fatale. */
  partial?: boolean
}

export interface SyncRunResult<T = unknown> {
  metrics?: SyncRunMetrics
  /** Payload qui sera retourné par la route au caller. */
  response: T
}

interface WithSyncRunOptions {
  source: SyncSource
  triggeredBy?: string  // 'cron' (défaut) ou 'manual:<email>'
}

export interface ProgressInfo {
  current: number
  total: number
  step?: string
}

export type ProgressUpdater = (progress: ProgressInfo) => Promise<void>

/**
 * Met à jour le `progress` jsonb d'un run en cours (best-effort).
 */
async function updateRunProgress(runId: string, progress: ProgressInfo): Promise<void> {
  try {
    await adminClient
      .from('sync_runs')
      .update({ progress })
      .eq('id', runId)
  } catch (e) {
    // Best-effort
    console.error('[sync-run/progress] update failed:', e instanceof Error ? e.message : e)
  }
}

/**
 * Crée un run, exécute la fonction, log le résultat et propage la réponse.
 * En cas d'erreur, le run est marqué `failed` avant que l'exception ne remonte.
 *
 * La fonction métier reçoit `(runId, updateProgress)` :
 *   - runId : id du row sync_runs (ou '' si l'INSERT a échoué)
 *   - updateProgress : callback pour pousser un état d'avancement temps réel
 */
export async function withSyncRun<T>(
  opts: WithSyncRunOptions,
  fn: (runId: string, updateProgress: ProgressUpdater) => Promise<SyncRunResult<T>>,
): Promise<T> {
  const triggeredBy = opts.triggeredBy ?? 'cron'
  const startedAt = Date.now()

  // 1. INSERT running. Best-effort : si la table n'existe pas (migration pas
  // encore déployée), on n'empêche pas la route cron de tourner.
  let runId: string | null = null
  try {
    const { data, error } = await adminClient
      .from('sync_runs')
      .insert({
        source: opts.source,
        status: 'running',
        triggered_by: triggeredBy,
      })
      .select('id')
      .maybeSingle()

    if (error) {
      console.error(`[sync-run/${opts.source}] insert failed (non-fatal):`, error.message)
    } else if (data?.id) {
      runId = data.id
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[sync-run/${opts.source}] insert exception (non-fatal):`, msg)
  }

  try {
    const updater: ProgressUpdater = runId
      ? (p) => updateRunProgress(runId, p)
      : async () => {}
    const { metrics, response } = await fn(runId ?? '', updater)

    // 2. UPDATE success / partial / failed
    if (runId) {
      // Affiner : si on a eu des erreurs ET rien n'a été récupéré, c'est un échec.
      // Si on a eu des erreurs ET au moins quelques succès, c'est partiel.
      const hasErrors = !!(metrics?.errors && metrics.errors > 0)
      const hasFetched = !!(metrics?.fetched && metrics.fetched > 0)
      const status = metrics?.partial
        ? 'partial'
        : hasErrors
          ? (hasFetched ? 'partial' : 'failed')
          : 'success'

      const errorMessages = metrics?.errorMessages && metrics.errorMessages.length > 0
        ? metrics.errorMessages.slice(0, 20)
        : null

      const { error: upErr } = await adminClient
        .from('sync_runs')
        .update({
          status,
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          fetched: metrics?.fetched ?? 0,
          inserted: metrics?.inserted ?? 0,
          updated: metrics?.updated ?? 0,
          errors: metrics?.errors ?? 0,
          error_messages: errorMessages ? { messages: errorMessages } : null,
          metadata: metrics?.metadata ?? null,
        })
        .eq('id', runId)

      if (upErr) {
        console.error(`[sync-run/${opts.source}] update failed (non-fatal):`, upErr.message)
      }
    }

    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined

    // 3. UPDATE failed
    if (runId) {
      try {
        await adminClient
          .from('sync_runs')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            errors: 1,
            error_messages: { messages: [message], stack: stack?.slice(0, 2000) },
          })
          .eq('id', runId)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[sync-run/${opts.source}] update-on-failure exception:`, msg)
      }
    }

    throw err
  }
}

/**
 * Vérifie qu'aucun run sur cette source n'est `running` ou n'a démarré
 * dans les dernières `windowMs` ms. Renvoie le run bloquant le cas échéant.
 * Utilisé par `/api/admin/monitoring/trigger-sync` pour empêcher le double-clic.
 */
export async function findActiveRun(source: SyncSource, windowMs = 5 * 60 * 1000) {
  const cutoff = new Date(Date.now() - windowMs).toISOString()

  const { data } = await adminClient
    .from('sync_runs')
    .select('id, status, started_at')
    .eq('source', source)
    .or(`status.eq.running,started_at.gte.${cutoff}`)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}
