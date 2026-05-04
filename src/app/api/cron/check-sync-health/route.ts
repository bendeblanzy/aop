import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { SYNC_SOURCES } from '@/lib/monitoring/sync-run'

/**
 * Cron quotidien — surveille la santé des syncs et envoie un email récap si anomalie.
 *
 * Anomalies détectées par source :
 *   - Aucun run dans les dernières 24h (cron loupé / Vercel down / route cassée)
 *   - Dernier run en statut `failed`
 *   - Dernier run avec `errors > 0`
 *   - Run encore `running` depuis > 1h → présumé timeout, on le marque `failed`
 *
 * Email envoyé via Resend uniquement si au moins une anomalie est détectée.
 *
 * Variables d'environnement :
 *   - CRON_SECRET (auth)
 *   - RESEND_API_KEY (envoi mail)
 *   - SUPER_ADMIN_EMAIL ou MONITORING_ALERT_EMAIL (destinataire, défaut benjamindeblanzy@ladngroupe.com)
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const oneHourAgo = new Date(now - 3600_000).toISOString()
  const twentyFourHoursAgo = new Date(now - 24 * 3600_000).toISOString()

  // 1. Marquer comme `failed` les runs zombies (running depuis > 1h)
  const { data: zombies, error: zombieErr } = await adminClient
    .from('sync_runs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      errors: 1,
      error_messages: { messages: ['Timeout présumé — run resté en statut running > 1h'] },
    })
    .eq('status', 'running')
    .lt('started_at', oneHourAgo)
    .select('id, source')

  if (zombieErr) {
    console.error('[check-sync-health] zombie cleanup failed:', zombieErr.message)
  }
  const zombieCount = zombies?.length ?? 0

  // 2. Pour chaque source, lire le dernier run et détecter les anomalies
  type Issue = { source: string; label: string; reason: string; details?: string }
  const issues: Issue[] = []

  for (const source of SYNC_SOURCES) {
    const { data: lastRun } = await adminClient
      .from('sync_runs')
      .select('status, started_at, errors, error_messages, duration_ms')
      .eq('source', source.id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!lastRun) {
      issues.push({
        source: source.id,
        label: source.label,
        reason: 'Jamais exécuté — aucun run en base.',
      })
      continue
    }

    if (lastRun.started_at < twentyFourHoursAgo) {
      issues.push({
        source: source.id,
        label: source.label,
        reason: `Aucun run depuis plus de 24h (dernier : ${new Date(lastRun.started_at).toLocaleString('fr-FR')}).`,
      })
      continue
    }

    if (lastRun.status === 'failed') {
      const msg = (lastRun.error_messages as { messages?: string[] } | null)?.messages?.[0]
      issues.push({
        source: source.id,
        label: source.label,
        reason: `Dernier run en échec.`,
        details: msg,
      })
      continue
    }

    if ((lastRun.errors ?? 0) > 0) {
      issues.push({
        source: source.id,
        label: source.label,
        reason: `Dernier run terminé avec ${lastRun.errors} erreur(s).`,
      })
    }
  }

  // 3. Envoi email si anomalie
  let emailSent = false
  if (issues.length > 0) {
    emailSent = await sendHealthAlert(issues, zombieCount)
  }

  return NextResponse.json({
    success: true,
    zombieCount,
    issuesCount: issues.length,
    emailSent,
    issues,
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}

async function sendHealthAlert(
  issues: { source: string; label: string; reason: string; details?: string }[],
  zombieCount: number,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[check-sync-health] RESEND_API_KEY non configuré, email skip')
    return false
  }

  const to =
    process.env.MONITORING_ALERT_EMAIL ||
    process.env.SUPER_ADMIN_EMAIL ||
    'benjamindeblanzy@ladngroupe.com'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aop-staging.vercel.app'
  const monitoringUrl = `${appUrl}/admin/monitoring/syncs`

  const issuesHtml = issues.map(i => `
    <li style="margin-bottom:8px;">
      <strong style="color:#0000FF;">${i.label}</strong> (<code style="background:#f5f5ff;padding:1px 4px;border-radius:3px;font-size:12px;">${i.source}</code>) — ${escapeHtml(i.reason)}
      ${i.details ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(i.details)}</div>` : ''}
    </li>
  `).join('')

  const subject = `[AOP Monitoring] ${issues.length} anomalie${issues.length > 1 ? 's' : ''} de sync détectée${issues.length > 1 ? 's' : ''}`

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0;">
    <div style="background:#0000FF;padding:20px 28px;">
      <h1 style="color:#fff;margin:0;font-size:18px;font-weight:600;">AOP — Anomalies de synchronisation</h1>
    </div>
    <div style="padding:24px 28px;">
      <p style="color:#374151;margin:0 0 16px;">Le contrôle de santé quotidien a détecté ${issues.length} anomalie${issues.length > 1 ? 's' : ''} sur les jobs de synchronisation${zombieCount > 0 ? ` et a nettoyé ${zombieCount} run${zombieCount > 1 ? 's zombies' : ' zombie'}` : ''}.</p>
      <ul style="padding-left:18px;color:#374151;font-size:14px;">${issuesHtml}</ul>
      <a href="${monitoringUrl}" style="display:inline-block;margin-top:16px;background:#0000FF;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">Ouvrir le monitoring →</a>
    </div>
    <div style="padding:14px 28px;background:#fafafa;border-top:1px solid #f0f0f0;color:#9ca3af;font-size:11px;">
      Email automatique — généré par <code>/api/cron/check-sync-health</code>
    </div>
  </div>
</body>
</html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "L'ADN DATA <noreply@ladn.eu>",
        to: [to],
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('[check-sync-health] Resend error:', err)
      return false
    }
    return true
  } catch (e) {
    console.error('[check-sync-health] Resend exception:', e)
    return false
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
