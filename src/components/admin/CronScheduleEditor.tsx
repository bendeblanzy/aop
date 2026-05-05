'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Clock } from 'lucide-react'
import { toast } from 'sonner'

export type CronPreset = 'disabled' | 'daily' | 'every_2h' | 'every_4h' | 'every_8h' | 'every_12h' | 'hourly'

interface Props {
  source: string
  preset: CronPreset
  dailyHourUtc: number | null
  enabled: boolean
}

const PRESETS: { value: CronPreset; label: string }[] = [
  { value: 'disabled', label: 'Désactivé' },
  { value: 'daily', label: 'Quotidien' },
  { value: 'every_2h', label: 'Toutes les 2h' },
  { value: 'every_4h', label: 'Toutes les 4h' },
  { value: 'every_8h', label: 'Toutes les 8h' },
  { value: 'every_12h', label: 'Toutes les 12h' },
  { value: 'hourly', label: 'Toutes les heures' },
]

export function CronScheduleEditor({ source, preset: initialPreset, dailyHourUtc, enabled: initialEnabled }: Props) {
  const router = useRouter()
  const [_isPending, startTransition] = useTransition()
  const [preset, setPreset] = useState<CronPreset>(initialPreset)
  const [hourUtc, setHourUtc] = useState<number>(dailyHourUtc ?? 5)
  const [enabled, setEnabled] = useState<boolean>(initialEnabled)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/monitoring/cron-settings/${source}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset, daily_hour_utc: hourUtc, enabled }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success('Planning mis à jour.')
      setOpen(false)
      startTransition(() => router.refresh())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  // Description courte affichée par défaut
  const summary = !enabled || preset === 'disabled'
    ? 'Désactivé'
    : preset === 'daily'
      ? `Quotidien à ${formatHourLocal(hourUtc)}`
      : PRESETS.find(p => p.value === preset)?.label ?? preset

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] font-medium text-gray-500 hover:text-[#0000FF] inline-flex items-center gap-1"
      >
        <Clock className="w-3 h-3" />
        {summary}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-700">
              Fréquence
              <select
                value={preset}
                onChange={e => setPreset(e.target.value as CronPreset)}
                className="block w-full mt-0.5 text-sm border border-gray-200 rounded px-2 py-1"
              >
                {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            {preset === 'daily' && (
              <label className="text-xs text-gray-700">
                Heure (Paris)
                <select
                  value={hourUtc}
                  onChange={e => setHourUtc(Number(e.target.value))}
                  className="block w-full mt-0.5 text-sm border border-gray-200 rounded px-2 py-1"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{formatHourLocal(h)} ({h}h UTC)</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="rounded" />
            Activé
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-900 px-2">Annuler</button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded bg-[#0000FF] text-white hover:bg-[#0000CC] disabled:bg-gray-300"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Sauvegarder
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Convertit une heure UTC en local Europe/Paris (CET=UTC+1, CEST=UTC+2).
 * On utilise toLocaleString pour avoir la bonne offset DST automatiquement.
 */
function formatHourLocal(hourUtc: number): string {
  const d = new Date()
  d.setUTCHours(hourUtc, 0, 0, 0)
  return d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
}
