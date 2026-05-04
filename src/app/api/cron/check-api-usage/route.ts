import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { USAGE_FETCHERS, PROVIDER_LABELS, PROVIDER_DASHBOARDS, type UsageSample } from '@/lib/monitoring/api-usage'

/**
 * Cron quotidien — snapshot de l'usage des APIs tierces.
 * Appelle chaque adapter, écrit un row dans api_usage_snapshots (UPSERT par jour),
 * envoie un email d'alerte si un provider passe au-dessus du seuil.
 *
 * Variables d'environnement :
 *   - CRON_SECRET (auth)
 *   - RESEND_API_KEY (envoi mail)
 *   - SUPER_ADMIN_EMAIL ou MONITORING_ALERT_EMAIL
 *   - API_USAGE_ALERT_THRESHOLD (en %, défaut 80)
 *   - APIFY_API_TOKEN (déjà utilisé par les crons sync)
 *   - ANTHROPIC_ADMIN_KEY (optionnel — sans, l'usage Anthropic n'est pas tracké)
 *   - OPENAI_ADMIN_KEY (optionnel)
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const threshold = Number(process.env.API_USAGE_ALERT_THRESHOLD ?? '80')
  const today = new Date().toISOString().slice(0, 10)

  const samples = await Promise.all(
    Object.values(USAGE_FETCHERS).map(fetcher => fetcher().catch(e => ({
      provider: 'unknown' as never,
      available: false,
      reason: e instanceof Error ? e.message : String(e),
    } as UsageSample))),
  )

  const persisted: { provider: string; pct?: number; available: boolean }[] = []
  for (const s of samples) {
    if (!s.available) {
      persisted.push({ provider: s.provider, available: false })
      continue
    }
    const { error } = await adminClient.from('api_usage_snapshots').upsert({
      provider: s.provider,
      snapshot_date: today,
      period_start: s.periodStart ?? null,
      period_end: s.periodEnd ?? null,
      usage_value: s.usageValue ?? null,
      usage_unit: s.usageUnit ?? null,
      limit_value: s.limitValue ?? null,
      usage_pct: s.usagePct ?? null,
      raw_payload: (s.raw as Record<string, unknown>) ?? null,
    }, { onConflict: 'provider,snapshot_date' })
    if (error) {
      console.error(`[check-api-usage/${s.provider}] upsert error:`, error.message)
    }
    persisted.push({ provider: s.provider, pct: s.usagePct, available: true })
  }

  // Détection anomalies
  const overThreshold = samples.filter(s => s.available && s.usagePct != null && s.usagePct >= threshold)

  let emailSent = false
  if (overThreshold.length > 0) {
    emailSent = await sendUsageAlert(overThreshold, threshold)
  }

  return NextResponse.json({
    success: true,
    threshold,
    samples: persisted,
    overThreshold: overThreshold.map(s => ({ provider: s.provider, pct: s.usagePct })),
    emailSent,
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}

async function sendUsageAlert(samples: UsageSample[], threshold: number): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false
  const to = process.env.MONITORING_ALERT_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'benjamindeblanzy@ladngroupe.com'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aop-staging.vercel.app'

  const itemsHtml = samples.map(s => {
    const pct = s.usagePct?.toFixed(1) ?? '?'
    const usage = s.usageValue != null ? `${s.usageValue.toLocaleString('fr-FR')} ${s.usageUnit ?? ''}` : ''
    const limit = s.limitValue != null ? ` / ${s.limitValue.toLocaleString('fr-FR')} ${s.usageUnit ?? ''}` : ''
    const dashboard = PROVIDER_DASHBOARDS[s.provider]
    return `
    <li style="margin-bottom:10px;">
      <strong style="color:#ef4444;">${PROVIDER_LABELS[s.provider]}</strong> — <strong>${pct}%</strong> consommé
      <div style="font-size:12px;color:#6b7280;margin-top:2px;">${usage}${limit} · <a href="${dashboard}" style="color:#0000FF;">Dashboard ${PROVIDER_LABELS[s.provider]} →</a></div>
    </li>`
  }).join('')

  const html = `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0;">
    <div style="background:#ef4444;padding:18px 28px;">
      <h1 style="color:#fff;margin:0;font-size:17px;font-weight:600;">⚠️ Crédits API — seuil ${threshold}% dépassé</h1>
    </div>
    <div style="padding:24px 28px;">
      <p style="color:#374151;margin:0 0 12px;">${samples.length} provider${samples.length > 1 ? 's ont' : ' a'} atteint ou dépassé ${threshold}% du quota.</p>
      <ul style="padding-left:20px;color:#374151;font-size:14px;">${itemsHtml}</ul>
      <a href="${appUrl}/admin/monitoring/api" style="display:inline-block;margin-top:8px;background:#0000FF;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">Ouvrir le monitoring →</a>
    </div>
    <div style="padding:14px 28px;background:#fafafa;border-top:1px solid #f0f0f0;color:#9ca3af;font-size:11px;">
      Pas de rechargement automatique — décide toi-même de la marche à suivre.
    </div>
  </div>
</body></html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: "L'ADN DATA <noreply@ladn.eu>",
        to: [to],
        subject: `[AOP API Usage] ${samples.length} provider${samples.length > 1 ? 's' : ''} > ${threshold}%`,
        html,
      }),
    })
    return res.ok
  } catch (e) {
    console.error('[check-api-usage] resend exception:', e)
    return false
  }
}
