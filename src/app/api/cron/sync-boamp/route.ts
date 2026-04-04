import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { syncBoampTenders } from '@/lib/boamp/sync'

/**
 * Route cron — appellée par Vercel Cron chaque jour à 6h (Europe/Paris)
 * Protégée par Authorization: Bearer {CRON_SECRET}
 *
 * Peut aussi être déclenchée manuellement :
 *   curl -X POST /api/cron/sync-boamp \
 *     -H "Authorization: Bearer VOTRE_CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"daysBack": 30}'
 */
export async function POST(request: NextRequest) {
  // Vérification du secret cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Paramètre optionnel : nombre de jours à remonter
  let daysBack = 7
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body?.daysBack === 'number') {
      daysBack = Math.min(Math.max(1, body.daysBack), 90)
    }
  } catch {
    // body optionnel
  }

  console.log(`[cron/sync-boamp] Démarrage sync, daysBack=${daysBack}`)

  try {
    const result = await syncBoampTenders(adminClient, daysBack)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron/sync-boamp] Erreur:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Vercel Cron appelle en GET aussi selon la config vercel.json
export async function GET(request: NextRequest) {
  return POST(request)
}
