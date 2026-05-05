import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminContext } from '@/lib/auth/super-admin'
import { adminClient } from '@/lib/supabase/admin'

const VALID_PRESETS = ['disabled', 'daily', 'every_2h', 'every_4h', 'every_8h', 'every_12h', 'hourly']

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ source: string }> }) {
  const sa = await getSuperAdminContext()
  if (!sa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!sa.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { source } = await ctx.params

  let body: { preset?: string; daily_hour_utc?: number; enabled?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body invalide' }, { status: 400 }) }

  const patch: Record<string, unknown> = { source, updated_by: sa.userId }
  if (body.preset !== undefined) {
    if (!VALID_PRESETS.includes(body.preset)) {
      return NextResponse.json({ error: `Preset invalide: ${body.preset}` }, { status: 400 })
    }
    patch.preset = body.preset
  }
  if (typeof body.daily_hour_utc === 'number' && body.daily_hour_utc >= 0 && body.daily_hour_utc <= 23) {
    patch.daily_hour_utc = body.daily_hour_utc
  }
  if (typeof body.enabled === 'boolean') {
    patch.enabled = body.enabled
  }

  const { error } = await adminClient.from('cron_settings').upsert(patch, { onConflict: 'source' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
