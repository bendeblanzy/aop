import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminContext } from '@/lib/auth/super-admin'
import { adminClient } from '@/lib/supabase/admin'

const VALID_PROVIDERS = ['apify', 'resend', 'anthropic', 'openai']

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const sa = await getSuperAdminContext()
  if (!sa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!sa.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { provider } = await ctx.params
  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Provider invalide' }, { status: 400 })
  }

  let body: { threshold_pct?: number; threshold_usd_remaining?: number | null; enabled?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body invalide' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (typeof body.threshold_pct === 'number' && body.threshold_pct >= 0 && body.threshold_pct <= 100) {
    patch.threshold_pct = body.threshold_pct
  }
  if (body.threshold_usd_remaining === null || (typeof body.threshold_usd_remaining === 'number' && body.threshold_usd_remaining >= 0)) {
    patch.threshold_usd_remaining = body.threshold_usd_remaining
  }
  if (typeof body.enabled === 'boolean') {
    patch.enabled = body.enabled
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('api_alert_settings')
    .upsert({ provider, ...patch }, { onConflict: 'provider' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
