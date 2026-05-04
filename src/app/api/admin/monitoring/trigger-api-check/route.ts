import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminContext } from '@/lib/auth/super-admin'

/**
 * Déclenche manuellement le cron check-api-usage depuis le backoffice.
 * Réservé aux super_admins.
 */
export async function POST(request: NextRequest) {
  const sa = await getSuperAdminContext()
  if (!sa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!sa.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 })

  const url = new URL('/api/cron/check-api-usage', request.nextUrl.origin).toString()

  // Wait for the cron to complete this time (≤ ~30s) so the page refresh montre les données.
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
        'x-triggered-by': `manual:${sa.email ?? sa.userId}`,
      },
    })
    const json = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: json?.error ?? `HTTP ${res.status}` }, { status: 500 })
    }
    return NextResponse.json({ success: true, result: json })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur fetch' }, { status: 500 })
  }
}
