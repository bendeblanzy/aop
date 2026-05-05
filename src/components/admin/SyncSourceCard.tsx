'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Clock, Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { CronScheduleEditor, type CronPreset } from './CronScheduleEditor'
import type { ActiveRun } from './LiveRunProgress'

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

interface Props {
  sourceId: string
  sourceLabel: string
  runs: SyncRunRow[]
  cronSettings?: { preset: CronPreset; daily_hour_utc: number | null; enabled: boolean } | null
  activeRun?: ActiveRun | null
  description?: string
}

const STATUS_STYLES: Record<SyncRunRow['status'], { bg: string; text: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  running: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'En cours', Icon: Loader2 },
  success: { bg: 'bg-green-100', text: 'text-green-700', label: 'OK', Icon: CheckCircle2 },
  partial: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Partiel', Icon: AlertTriangle },
  failed:  { bg: 'bg-red-100',   text: 'text-red-700',   label: 'Échec', Icon: AlertCircle },
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'à l\'instant'
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`
  const days = Math.floor(diff / 86_400_000)
  return `il y a ${days} j`
}

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function SyncSourceCard({ sourceId, sourceLabel, runs, cronSettings, activeRun, description }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [triggering, setTriggering] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const lastRun = runs[0]
  const lastSuccess = runs.find(r => r.status === 'success' || r.status === 'partial')
  const visibleRuns = showAll ? runs : runs.slice(0, 5)

  // État dégradé global : aucun run < 24h, ou dernier run failed
  const noRecentRun = !lastRun || (Date.now() - new Date(lastRun.started_at).getTime() > 24 * 3600 * 1000)
  const lastFailed = lastRun?.status === 'failed'
  const healthBadge = lastFailed
    ? { bg: 'bg-red-50', text: 'text-red-700', label: 'Dernier run en échec' }
    : noRecentRun
      ? { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Aucun run récent' }
      : { bg: 'bg-green-50', text: 'text-green-700', label: 'Sain' }

  async function trigger() {
    setTriggering(true)
    try {
      const res = await fetch('/api/admin/monitoring/trigger-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourceId }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success(`Sync ${sourceLabel} lancée — résultat dans quelques minutes.`)
      // Recharge les runs au bout de 2s
      setTimeout(() => startTransition(() => router.refresh()), 2000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setTriggering(false)
    }
  }

  // Live progress (si run en cours dans cette card)
  const liveProgress = activeRun?.progress
  const livePct = liveProgress?.current != null && liveProgress?.total
    ? Math.min(100, Math.round((liveProgress.current / liveProgress.total) * 100))
    : null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-3">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            {sourceLabel}
            {description && (
              <span className="inline-flex items-center gap-1 text-[10px] font-normal text-gray-500" title={description}>
                <LinkIcon className="w-3 h-3" />
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Source <code className="font-mono">{sourceId}</code>
          </p>
          {description && (
            <p className="text-[11px] text-gray-500 mt-1 italic">{description}</p>
          )}
        </div>
        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${healthBadge.bg} ${healthBadge.text} shrink-0`}>
          {healthBadge.label}
        </span>
      </div>

      {/* Live progress bar (si run actif) */}
      {activeRun && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-blue-700 inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              En cours…
            </span>
            <span className="text-blue-600 tabular-nums">{livePct != null ? `${livePct}%` : ''}</span>
          </div>
          {livePct != null && (
            <div className="h-1.5 bg-white rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${livePct}%` }} />
            </div>
          )}
          {liveProgress?.step && (
            <p className="text-[11px] text-blue-700">{liveProgress.step}</p>
          )}
        </div>
      )}

      {/* Dernier run + bouton */}
      <div className="flex items-center justify-between gap-2 border-t border-b border-gray-100 py-2.5">
        <div className="text-xs text-gray-600">
          {lastRun ? (
            <>
              <div>Dernier run : <strong>{formatRelative(lastRun.started_at)}</strong></div>
              {lastSuccess && lastSuccess.id !== lastRun.id && (
                <div className="text-gray-400 mt-0.5">Dernier OK : {formatRelative(lastSuccess.started_at)}</div>
              )}
            </>
          ) : (
            <span className="text-gray-400">Aucun run enregistré</span>
          )}
        </div>
        <button
          onClick={trigger}
          disabled={triggering || isPending || !!activeRun}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#0000FF] text-white hover:bg-[#0000CC] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {triggering ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Lancement…
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              Relancer
            </>
          )}
        </button>
      </div>

      {/* Cron schedule editor */}
      {cronSettings && (
        <div className="border-b border-gray-100 pb-2">
          <CronScheduleEditor
            source={sourceId}
            preset={cronSettings.preset}
            dailyHourUtc={cronSettings.daily_hour_utc}
            enabled={cronSettings.enabled}
          />
        </div>
      )}

      {/* Liste des runs */}
      <div className="space-y-1.5">
        {visibleRuns.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">Aucun run — le cron tournera automatiquement à son prochain horaire programmé.</p>
        ) : (
          visibleRuns.map(run => <RunRow key={run.id} run={run} />)
        )}
        {runs.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-[#0000FF] hover:underline w-full text-left pt-1"
          >
            {showAll ? 'Masquer' : `Voir tous les ${runs.length} runs`}
          </button>
        )}
      </div>
    </div>
  )
}

function RunRow({ run }: { run: SyncRunRow }) {
  const style = STATUS_STYLES[run.status]
  const Icon = style.Icon
  const errorMessages = run.error_messages?.messages ?? []

  return (
    <details className="group">
      <summary className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded">
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
          <Icon className={`w-3 h-3 ${run.status === 'running' ? 'animate-spin' : ''}`} />
          {style.label}
        </span>
        <span className="text-gray-500 tabular-nums">{formatDateFr(run.started_at)}</span>
        <span className="text-gray-400 ml-auto inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDuration(run.duration_ms)}
        </span>
      </summary>
      <div className="px-2 pb-2 pt-1 text-[11px] text-gray-600 space-y-0.5">
        <div>
          <strong>Récupérés:</strong> {run.fetched} ·
          <strong className="ml-2">Insérés:</strong> {run.inserted} ·
          <strong className="ml-2">MAJ:</strong> {run.updated} ·
          <strong className="ml-2">Erreurs:</strong> {run.errors}
        </div>
        <div className="text-gray-400">
          Déclenché par <code className="font-mono">{run.triggered_by}</code>
        </div>
        {errorMessages.length > 0 && (
          <ul className="mt-1 list-disc list-inside text-red-600 space-y-0.5">
            {errorMessages.slice(0, 3).map((msg, i) => (
              <li key={i} className="break-all">{msg}</li>
            ))}
            {errorMessages.length > 3 && (
              <li className="text-gray-400 list-none">… et {errorMessages.length - 3} autres</li>
            )}
          </ul>
        )}
      </div>
    </details>
  )
}
