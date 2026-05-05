import { NextResponse } from 'next/server'
import { shouldRunNow } from './cron-schedule'

/**
 * Helper à appeler en début de route cron : vérifie l'auth + check si on doit
 * tourner maintenant selon les settings DB.
 *
 * Renvoie :
 *   - { ok: true } si on doit continuer
 *   - { ok: false, response } si on doit retourner immédiatement (auth KO ou skip planifié)
 *
 * Usage :
 *   const guard = await checkCronGuard(request, 'boamp')
 *   if (!guard.ok) return guard.response
 */
export async function checkCronGuard(
  request: Request,
  source: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  // 1. Auth CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  // 2. Trigger manuel = bypass du check planning (l'utilisateur veut explicitement run)
  const triggeredBy = request.headers.get('x-triggered-by') ?? 'cron'
  if (triggeredBy.startsWith('manual:') || triggeredBy.startsWith('auto-chain:')) {
    return { ok: true }
  }

  // 3. Check planning DB
  const decision = await shouldRunNow(source)
  if (!decision.shouldRun) {
    return {
      ok: false,
      response: NextResponse.json({
        skipped: true,
        source,
        reason: decision.reason,
      }),
    }
  }

  return { ok: true }
}
