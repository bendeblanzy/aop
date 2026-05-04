import { adminClient } from '@/lib/supabase/admin'
import { SYNC_SOURCES, type SyncSource } from '@/lib/monitoring/sync-run'
import { SyncSourceCard } from '@/components/admin/SyncSourceCard'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface SyncRunRow {
  id: string
  source: string
  status: 'running' | 'success' | 'partial' | 'failed'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  fetched: number
  inserted: number
  updated: number
  errors: number
  error_messages: { messages?: string[] } | null
  triggered_by: string
  metadata: Record<string, unknown> | null
}

async function loadRuns(): Promise<Record<SyncSource, SyncRunRow[]>> {
  // Lit les 30 derniers runs par source. Une seule requête, on regroupe en mémoire
  // (les sources sont peu nombreuses → ~210 lignes max, négligeable).
  const { data, error } = await adminClient
    .from('sync_runs')
    .select('id, source, status, started_at, finished_at, duration_ms, fetched, inserted, updated, errors, error_messages, triggered_by, metadata')
    .order('started_at', { ascending: false })
    .limit(500)

  const grouped = {} as Record<SyncSource, SyncRunRow[]>
  for (const source of SYNC_SOURCES) grouped[source.id] = []

  if (error) {
    console.error('[admin/monitoring/syncs] read error:', error.message)
    return grouped
  }

  for (const row of data ?? []) {
    const sourceKey = row.source as SyncSource
    if (grouped[sourceKey] && grouped[sourceKey].length < 30) {
      grouped[sourceKey].push(row as SyncRunRow)
    }
  }
  return grouped
}

export default async function SyncsPage() {
  const runsBySource = await loadRuns()

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-900">
        <p>
          Chaque carte représente une source de données. Les 30 derniers runs sont conservés
          pour repérer les anomalies (statut, durée, volume). Le bouton <strong>Relancer maintenant</strong>
          re-déclenche un cron à la demande (verrou anti-doublon de 5 minutes).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SYNC_SOURCES.map(source => (
          <SyncSourceCard
            key={source.id}
            sourceId={source.id}
            sourceLabel={source.label}
            runs={runsBySource[source.id] ?? []}
          />
        ))}
      </div>
    </div>
  )
}
