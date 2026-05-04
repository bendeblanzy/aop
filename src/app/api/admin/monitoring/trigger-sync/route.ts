import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminContext } from '@/lib/auth/super-admin'
import { findActiveRun, SYNC_SOURCES, type SyncSource } from '@/lib/monitoring/sync-run'

/**
 * Re-déclenche manuellement un cron de sync depuis le backoffice super-admin.
 *
 * Sécurité :
 *   - Vérifie que l'appelant est super_admin
 *   - Vérifie qu'aucun run n'est déjà actif sur cette source (anti double-clic, fenêtre 5 min)
 *   - Appelle la route cron interne avec le CRON_SECRET + header `x-triggered-by` traçable
 *
 * Le cron tourne en arrière-plan : on retourne immédiatement après lancement
 * (les routes cron ont un maxDuration de 300s, on n'attend pas leur réponse).
 */
export async function POST(request: NextRequest) {
  const ctx = await getSuperAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let source: SyncSource | undefined
  try {
    const body = await request.json()
    source = body?.source
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const sourceConfig = SYNC_SOURCES.find(s => s.id === source)
  if (!sourceConfig) {
    return NextResponse.json({ error: `Source inconnue: ${source}` }, { status: 400 })
  }

  // Lock anti-doublon : refuse si un run est en cours ou a démarré il y a < 5 min
  const active = await findActiveRun(sourceConfig.id, 5 * 60 * 1000)
  if (active) {
    const startedAt = new Date(active.started_at)
    return NextResponse.json({
      error: `Un run est déjà en cours ou récent (statut=${active.status}, démarré à ${startedAt.toLocaleString('fr-FR')}). Réessaie dans quelques minutes.`,
    }, { status: 409 })
  }

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré côté serveur' }, { status: 500 })
  }

  // Construire l'URL absolue du cron interne. En prod Vercel, request.nextUrl.origin
  // donne le bon host (preview, staging, prod). En dev local, ça pointe vers
  // http://localhost:3000.
  const cronUrl = new URL(sourceConfig.cronPath, request.nextUrl.origin).toString()
  const triggeredBy = `manual:${ctx.email ?? ctx.userId}`

  // Fire-and-forget : on lance la requête mais on n'attend pas sa fin.
  // Le row sync_runs sera créé dès l'entrée dans le cron, l'UI le verra au refresh.
  fetch(cronUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
      'x-triggered-by': triggeredBy,
    },
    body: JSON.stringify({}),
  }).catch(err => {
    console.error(`[trigger-sync] background fetch failed for ${source}:`, err)
  })

  return NextResponse.json({
    success: true,
    source: sourceConfig.id,
    triggeredBy,
    message: `Sync ${sourceConfig.label} déclenchée en arrière-plan.`,
  })
}
