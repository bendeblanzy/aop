'use client'

import { useEffect, useState } from 'react'

export interface ActiveRun {
  id: string
  source: string
  status: string
  started_at: string
  triggered_by: string
  progress: { current?: number; total?: number; step?: string } | null
}

/**
 * Poll /api/admin/monitoring/sync-runs/active toutes les 3s et fournit la liste
 * des runs en cours via un context-like state.
 *
 * Utilisé par la page Syncs : `useActiveRuns()` retourne {activeRuns, byUuid, bySource}
 */
export function useActiveRuns(intervalMs = 3000) {
  const [activeRuns, setActiveRuns] = useState<ActiveRun[]>([])

  useEffect(() => {
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      try {
        const res = await fetch('/api/admin/monitoring/sync-runs/active')
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setActiveRuns(json.runs ?? [])
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          timeout = setTimeout(poll, intervalMs)
        }
      }
    }
    poll()

    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
    }
  }, [intervalMs])

  const bySource = new Map<string, ActiveRun>()
  for (const r of activeRuns) bySource.set(r.source, r)

  return { activeRuns, bySource }
}
