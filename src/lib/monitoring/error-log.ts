import { adminClient } from '@/lib/supabase/admin'

/**
 * Logger d'erreurs serveur léger (alternative à Sentry).
 * Insère un row dans `error_logs` pour qu'il apparaisse sur la page
 * `/admin/monitoring/errors`.
 *
 * Best-effort : si l'insert échoue, on log seulement côté console pour
 * ne jamais propager une erreur de logging vers le caller.
 *
 * Usage côté API route :
 *   try { ... }
 *   catch (e) {
 *     await logError(e, { source: 'api/profil/enrich', url: req.url, userId })
 *     throw e
 *   }
 */

export interface LogErrorContext {
  source?: string
  userId?: string | null
  url?: string | null
  metadata?: Record<string, unknown>
  level?: 'warn' | 'error' | 'fatal'
}

export async function logError(err: unknown, ctx: LogErrorContext = {}): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack?.slice(0, 4000) : undefined

  try {
    await adminClient.from('error_logs').insert({
      level: ctx.level ?? 'error',
      message: message.slice(0, 2000),
      stack,
      source: ctx.source ?? null,
      user_id: ctx.userId ?? null,
      url: ctx.url ?? null,
      metadata: ctx.metadata ?? null,
    })
  } catch (logErr) {
    const msg = logErr instanceof Error ? logErr.message : String(logErr)
    console.error('[logError] insert failed (non-fatal):', msg)
  }
}
