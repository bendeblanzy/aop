import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/monitoring/error-log'

/**
 * API publique (authentifié) pour soumettre un bug report.
 * Insère dans `bug_reports` puis envoie un mail de notification au super_admin.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise pour signaler un bug.' }, { status: 401 })
  }

  let body: {
    title?: string | null
    description?: string
    severity?: 'low' | 'medium' | 'high' | 'critical'
    url?: string | null
    user_agent?: string | null
    metadata?: Record<string, unknown> | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const description = (body.description ?? '').trim()
  if (!description) {
    return NextResponse.json({ error: 'La description est requise.' }, { status: 400 })
  }
  if (description.length > 5000) {
    return NextResponse.json({ error: 'Description trop longue (5000 caractères max).' }, { status: 400 })
  }

  const validSeverities = ['low', 'medium', 'high', 'critical'] as const
  const severity = (validSeverities as readonly string[]).includes(body.severity ?? '')
    ? body.severity!
    : 'medium'

  const { data, error } = await adminClient
    .from('bug_reports')
    .insert({
      reporter_user_id: user.id,
      reporter_email: user.email,
      title: body.title?.slice(0, 200) ?? null,
      description,
      severity,
      url: body.url?.slice(0, 1000) ?? null,
      user_agent: body.user_agent?.slice(0, 500) ?? null,
      metadata: body.metadata ?? null,
    })
    .select('id')
    .maybeSingle()

  if (error || !data) {
    await logError(error ?? new Error('insert bug_report failed'), {
      source: 'api/bug-reports',
      userId: user.id,
    })
    return NextResponse.json({ error: 'Impossible d\'enregistrer le signalement.' }, { status: 500 })
  }

  // Notif mail (best-effort, on ne fait pas échouer la requête si le mail rate)
  void notifySuperAdmin({
    id: data.id,
    reporterEmail: user.email ?? '',
    title: body.title ?? null,
    description,
    severity,
    url: body.url ?? null,
  })

  return NextResponse.json({ success: true, id: data.id })
}

async function notifySuperAdmin(opts: {
  id: string
  reporterEmail: string
  title: string | null
  description: string
  severity: string
  url: string | null
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  const to = process.env.MONITORING_ALERT_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'benjamindeblanzy@ladngroupe.com'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aop-staging.vercel.app'

  const severityColor = {
    low: '#9ca3af',
    medium: '#0000FF',
    high: '#f59e0b',
    critical: '#ef4444',
  }[opts.severity] || '#0000FF'

  const html = `
<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0;">
    <div style="background:${severityColor};padding:18px 28px;">
      <h1 style="color:#fff;margin:0;font-size:17px;font-weight:600;">🐛 Nouveau bug signalé — ${escapeHtml(opts.severity.toUpperCase())}</h1>
    </div>
    <div style="padding:24px 28px;">
      ${opts.title ? `<h2 style="margin:0 0 12px;font-size:16px;color:#111;">${escapeHtml(opts.title)}</h2>` : ''}
      <p style="color:#374151;margin:0 0 12px;white-space:pre-wrap;font-size:14px;line-height:1.5;">${escapeHtml(opts.description)}</p>
      <div style="background:#f5f5ff;border-radius:8px;padding:14px;margin:16px 0;font-size:13px;color:#4b5563;">
        <div><strong>Reporter :</strong> ${escapeHtml(opts.reporterEmail)}</div>
        ${opts.url ? `<div style="margin-top:6px;"><strong>URL :</strong> <a href="${escapeHtml(opts.url)}" style="color:#0000FF;word-break:break-all;">${escapeHtml(opts.url)}</a></div>` : ''}
      </div>
      <a href="${appUrl}/admin/monitoring/bugs" style="display:inline-block;margin-top:8px;background:#0000FF;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">Voir tous les bugs →</a>
    </div>
    <div style="padding:14px 28px;background:#fafafa;border-top:1px solid #f0f0f0;color:#9ca3af;font-size:11px;">
      ID interne : <code>${opts.id}</code>
    </div>
  </div>
</body></html>`

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: "L'ADN DATA <noreply@ladn.eu>",
        to: [to],
        subject: `[AOP Bug] ${opts.severity.toUpperCase()} — ${opts.title ?? opts.description.slice(0, 60)}`,
        html,
      }),
    })
  } catch (e) {
    console.error('[bug-reports notif] resend exception:', e)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
