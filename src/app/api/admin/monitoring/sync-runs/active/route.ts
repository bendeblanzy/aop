import { NextResponse } from 'next/server'
import { getSuperAdminContext } from '@/lib/auth/super-admin'
import { adminClient } from '@/lib/supabase/admin'

/**
 * Renvoie la liste des runs actuellement en cours (status=running) avec leur progress.
 * Polled par le client Syncs pour l'état d'avancement live.
 */
export async function GET() {
  const sa = await getSuperAdminContext()
  if (!sa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!sa.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await adminClient
    .from('sync_runs')
    .select('id, source, status, started_at, progress, triggered_by')
    .eq('status', 'running')
    .order('started_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ runs: data ?? [] })
}
