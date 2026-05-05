'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ChevronDown, ChevronRight, ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export interface BugReport {
  id: string
  reporter_email: string
  reporter_user_id: string | null
  title: string | null
  description: string
  url: string | null
  user_agent: string | null
  status: 'new' | 'in_progress' | 'resolved' | 'wontfix'
  severity: 'low' | 'medium' | 'high' | 'critical'
  notes: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  metadata: Record<string, unknown> | null
}

const SEVERITY_STYLES: Record<BugReport['severity'], { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Mineur' },
  medium: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Moyen' },
  high: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Important' },
  critical: { bg: 'bg-red-100', text: 'text-red-700', label: 'Bloquant' },
}

const STATUS_STYLES: Record<BugReport['status'], { bg: string; text: string; label: string }> = {
  new: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Nouveau' },
  in_progress: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'En cours' },
  resolved: { bg: 'bg-green-50', text: 'text-green-700', label: 'Résolu' },
  wontfix: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Won\'t fix' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function BugReportRow({ bug }: { bug: BugReport }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [updating, setUpdating] = useState(false)
  const [notes, setNotes] = useState(bug.notes ?? '')
  const sevStyle = SEVERITY_STYLES[bug.severity]
  const statusStyle = STATUS_STYLES[bug.status]

  async function update(patch: Partial<Pick<BugReport, 'status' | 'notes'>>) {
    setUpdating(true)
    try {
      const res = await fetch(`/api/admin/monitoring/bug-reports/${bug.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success('Mis à jour.')
      startTransition(() => router.refresh())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setUpdating(false)
    }
  }

  async function deleteBug() {
    if (!confirm('Supprimer définitivement ce bug ?')) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/admin/monitoring/bug-reports/${bug.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success('Supprimé.')
      startTransition(() => router.refresh())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="px-4 py-3 hover:bg-gray-50/50">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600 shrink-0"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded shrink-0 ${sevStyle.bg} ${sevStyle.text}`}>
          {sevStyle.label}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {bug.title || bug.description.slice(0, 80) + (bug.description.length > 80 ? '…' : '')}
          </div>
          <div className="text-xs text-gray-500 truncate">
            <code className="font-mono">{bug.reporter_email}</code> · {formatDate(bug.created_at)}
          </div>
        </div>

        <select
          value={bug.status}
          onChange={e => update({ status: e.target.value as BugReport['status'] })}
          disabled={updating || isPending}
          className={`text-xs font-semibold px-2 py-1 rounded border-0 focus:ring-2 focus:ring-[#0000FF]/20 ${statusStyle.bg} ${statusStyle.text}`}
        >
          <option value="new">Nouveau</option>
          <option value="in_progress">En cours</option>
          <option value="resolved">Résolu</option>
          <option value="wontfix">Won't fix</option>
        </select>

        <button
          onClick={deleteBug}
          disabled={updating || isPending}
          className="text-gray-300 hover:text-red-500 shrink-0 disabled:cursor-not-allowed"
          title="Supprimer définitivement"
        >
          {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 ml-7 space-y-2 text-sm">
          {bug.title && (
            <p className="text-gray-700 whitespace-pre-wrap">{bug.description}</p>
          )}
          {bug.url && (
            <div className="text-xs text-gray-500">
              <strong>URL :</strong>{' '}
              <a href={bug.url} target="_blank" rel="noopener noreferrer" className="text-[#0000FF] hover:underline inline-flex items-center gap-1 break-all">
                {bug.url}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          )}
          {bug.user_agent && (
            <div className="text-xs text-gray-500">
              <strong>UA :</strong> <code className="font-mono break-all">{bug.user_agent}</code>
            </div>
          )}
          {bug.metadata && Object.keys(bug.metadata).length > 0 && (
            <div className="text-xs text-gray-500">
              <strong>Metadata :</strong>{' '}
              <code className="font-mono">{JSON.stringify(bug.metadata)}</code>
            </div>
          )}

          <div className="pt-2">
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Notes admin (privées)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (bug.notes ?? '')) update({ notes }) }}
              rows={2}
              placeholder="Diagnostic, lien commit, ETA…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0000FF]/20"
            />
          </div>
        </div>
      )}
    </div>
  )
}
