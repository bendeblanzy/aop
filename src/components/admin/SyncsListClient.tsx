'use client'

import { SyncSourceCard } from './SyncSourceCard'
import { useActiveRuns } from './LiveRunProgress'
import type { CronPreset } from './CronScheduleEditor'

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

interface SourceConfig {
  id: string
  label: string
  description?: string
}

interface CronSetting {
  source: string
  preset: CronPreset
  daily_hour_utc: number | null
  enabled: boolean
}

interface Props {
  sources: SourceConfig[]
  runsBySource: Record<string, SyncRunRow[]>
  cronSettings: CronSetting[]
}

export function SyncsListClient({ sources, runsBySource, cronSettings }: Props) {
  const { bySource: activeBySource } = useActiveRuns(3000)
  const cronBySource = new Map(cronSettings.map(c => [c.source, c]))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {sources.map(source => {
        const cron = cronBySource.get(source.id)
        return (
          <SyncSourceCard
            key={source.id}
            sourceId={source.id}
            sourceLabel={source.label}
            description={source.description}
            runs={runsBySource[source.id] ?? []}
            cronSettings={cron ? { preset: cron.preset, daily_hour_utc: cron.daily_hour_utc, enabled: cron.enabled } : null}
            activeRun={activeBySource.get(source.id) ?? null}
          />
        )
      })}
    </div>
  )
}
