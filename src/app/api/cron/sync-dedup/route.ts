import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

/**
 * Route cron — déduplication multi-source (P9, 2026-04-29).
 * Appelée par Vercel Cron chaque jour à 8h (Europe/Paris), APRÈS les 3 crons sync.
 * Protégée par Authorization: Bearer {CRON_SECRET}.
 *
 * Logique :
 *   Appelle `mark_ted_boamp_duplicates(threshold)` qui identifie les notices TED
 *   ayant un équivalent BOAMP (cosine similarity > threshold sur les embeddings)
 *   et remplit leur colonne `duplicate_of` avec l'idweb BOAMP correspondant.
 *
 *   La RPC `match_tenders_by_embedding` filtre ensuite ces doublons (quand aucun
 *   filtre source n'est actif dans l'UI) pour ne pas polluer les résultats avec
 *   des AO déjà présents via BOAMP.
 *
 * Peut être déclenchée manuellement :
 *   curl -X POST .../api/cron/sync-dedup \
 *     -H "Authorization: Bearer VOTRE_CRON_SECRET"
 *
 * Paramètre optionnel JSON body :
 *   { "threshold": 0.95 }  — seuil de similarité (défaut 0.95, min 0.85, max 0.99)
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let threshold = 0.95
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body?.threshold === 'number') {
      threshold = Math.min(0.99, Math.max(0.85, body.threshold))
    }
  } catch {
    // body optionnel
  }

  console.log(`[cron/sync-dedup] Démarrage, threshold=${threshold}`)

  try {
    const { data, error } = await adminClient.rpc('mark_ted_boamp_duplicates', {
      sim_threshold: threshold,
    })

    if (error) {
      console.error('[cron/sync-dedup] Erreur RPC:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const marked = typeof data === 'number' ? data : 0
    console.log(`[cron/sync-dedup] ${marked} notices TED marquées comme doublons BOAMP`)

    return NextResponse.json({ success: true, marked, threshold })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron/sync-dedup] Exception:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Vercel Cron peut appeler en GET selon la config vercel.json
export async function GET(request: NextRequest) {
  return POST(request)
}
