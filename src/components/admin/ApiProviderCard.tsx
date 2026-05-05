'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, AlertTriangle, Eye, EyeOff, Loader2, Save, CheckCircle2, XCircle, Settings } from 'lucide-react'
import { toast } from 'sonner'

interface CredentialStatus {
  provider: string
  hasDbValue: boolean
  hasEnvFallback: boolean
  lastValidatedAt: string | null
  lastValidationOk: boolean | null
  lastValidationError: string | null
}

interface AlertSetting {
  provider: string
  threshold_pct: number
  threshold_usd_remaining: number | null
  enabled: boolean
}

interface SnapshotData {
  snapshot_date: string
  usage_value: number | null
  usage_unit: string | null
  limit_value: number | null
  usage_pct: number | null
  credits_remaining_usd: number | null
  spent_30d_usd: number | null
}

interface Props {
  provider: 'apify' | 'resend' | 'anthropic' | 'openai'
  label: string
  dashboardUrl: string
  // Provider key info (la clé "normale" utilisée par l'app)
  apiKeyStatus: CredentialStatus
  // Pour Anthropic/OpenAI : 2e clé "admin" pour interroger l'usage
  adminKeyStatus?: CredentialStatus
  alert: AlertSetting
  snapshot: SnapshotData | null
  threshold: number  // valeur effective utilisée
}

const STATUS_PILLS = {
  ok: { bg: 'bg-green-100', text: 'text-green-700', label: 'Configurée' },
  env: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Env Vercel' },
  missing: { bg: 'bg-red-100', text: 'text-red-700', label: 'Manquante' },
}

export function ApiProviderCard({ provider, label, dashboardUrl, apiKeyStatus, adminKeyStatus, alert, snapshot, threshold }: Props) {
  const [openSettings, setOpenSettings] = useState(false)

  const overThreshold = (snapshot?.usage_pct ?? 0) >= threshold
  const remainingLow = alert.threshold_usd_remaining != null && snapshot?.credits_remaining_usd != null && snapshot.credits_remaining_usd <= alert.threshold_usd_remaining
  const inAlert = overThreshold || remainingLow

  return (
    <div className={`bg-white border ${inAlert ? 'border-red-200' : 'border-gray-200'} rounded-xl p-5 space-y-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            {label}
            <KeyStatusPill status={apiKeyStatus} />
            {adminKeyStatus && <KeyStatusPill status={adminKeyStatus} suffix="admin" />}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Snapshot {snapshot?.snapshot_date ? new Date(snapshot.snapshot_date).toLocaleDateString('fr-FR') : '—'}
            {snapshot?.snapshot_date == null && <span className="italic"> · Lancer le check pour la 1ère fois</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inAlert && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700">
              <AlertTriangle className="w-3 h-3" />
              Alerte
            </span>
          )}
          <button
            onClick={() => setOpenSettings(!openSettings)}
            className="text-gray-400 hover:text-[#0000FF] p-1"
            title="Configurer clé et seuil"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Métriques principales */}
      {snapshot && snapshot.usage_pct != null ? (
        <>
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-2xl font-bold text-gray-900 tabular-nums">
                {snapshot.usage_pct.toFixed(1)}<span className="text-base text-gray-400">%</span>
              </span>
              <span className="text-xs text-gray-500 tabular-nums">
                {formatUsage(snapshot.usage_value, snapshot.usage_unit)}
                {snapshot.limit_value != null && ` / ${formatUsage(snapshot.limit_value, snapshot.usage_unit)}`}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${barColor(snapshot.usage_pct, threshold)}`}
                style={{ width: `${Math.min(100, snapshot.usage_pct)}%` }}
              />
            </div>
          </div>

          {/* Sub-stats : balance restante + dépensé 30j */}
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="bg-gray-50 rounded px-2.5 py-1.5">
              <div className="text-[10px] uppercase text-gray-500 mb-0.5">Restant</div>
              <div className="font-semibold text-gray-900">
                {snapshot.credits_remaining_usd != null
                  ? `$${snapshot.credits_remaining_usd.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`
                  : <span className="text-gray-400 font-normal">—</span>}
              </div>
            </div>
            <div className="bg-gray-50 rounded px-2.5 py-1.5">
              <div className="text-[10px] uppercase text-gray-500 mb-0.5">Dépensé 30j</div>
              <div className="font-semibold text-gray-900">
                {snapshot.spent_30d_usd != null
                  ? `$${snapshot.spent_30d_usd.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`
                  : <span className="text-gray-400 font-normal">—</span>}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-500 italic py-2">
          Aucune donnée — clique <strong>Lancer le check</strong> en haut de page.
        </p>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
        <a href={dashboardUrl} target="_blank" rel="noopener noreferrer" className="text-[#0000FF] hover:underline inline-flex items-center gap-1">
          Dashboard {label} <ExternalLink className="w-3 h-3" />
        </a>
        <span className="text-gray-400">
          Seuil <strong>{alert.threshold_pct}%</strong>
          {alert.threshold_usd_remaining != null && ` ou < $${alert.threshold_usd_remaining}`}
          {!alert.enabled && ' · alerte off'}
        </span>
      </div>

      {/* Panel settings (édition) */}
      {openSettings && (
        <SettingsPanel
          provider={provider}
          apiKeyStatus={apiKeyStatus}
          adminKeyStatus={adminKeyStatus}
          alert={alert}
          onClose={() => setOpenSettings(false)}
        />
      )}
    </div>
  )
}

function KeyStatusPill({ status, suffix }: { status: CredentialStatus; suffix?: string }) {
  const pill = status.hasDbValue
    ? STATUS_PILLS.ok
    : status.hasEnvFallback
      ? STATUS_PILLS.env
      : STATUS_PILLS.missing
  return (
    <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${pill.bg} ${pill.text}`}>
      {suffix ?? ''}{suffix ? ' ' : ''}{pill.label}
    </span>
  )
}

function SettingsPanel({ provider, apiKeyStatus, adminKeyStatus, alert, onClose }: {
  provider: 'apify' | 'resend' | 'anthropic' | 'openai'
  apiKeyStatus: CredentialStatus
  adminKeyStatus?: CredentialStatus
  alert: AlertSetting
  onClose: () => void
}) {
  return (
    <div className="border-t border-gray-100 pt-3 space-y-3">
      <ApiKeyEditor providerLabel="Clé d'API normale" providerKey={provider} status={apiKeyStatus} />
      {adminKeyStatus && (
        <ApiKeyEditor
          providerLabel={`Clé Admin ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} (pour usage report)`}
          providerKey={`${provider}_admin` as const}
          status={adminKeyStatus}
        />
      )}
      <AlertSettingsEditor provider={provider} initial={alert} />
      <div className="flex justify-end pt-1">
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-900">Fermer</button>
      </div>
    </div>
  )
}

function ApiKeyEditor({ providerLabel, providerKey, status }: {
  providerLabel: string
  providerKey: string
  status: CredentialStatus
}) {
  const router = useRouter()
  const [_isPending, startTransition] = useTransition()
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!value.trim()) {
      toast.error('Saisis une clé.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/monitoring/api-credentials/${providerKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value.trim(), validate: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success('Clé sauvegardée et validée.')
      setValue('')
      startTransition(() => router.refresh())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  const lastVal = status.lastValidatedAt
    ? `Dernière validation : ${new Date(status.lastValidatedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ${status.lastValidationOk ? '✓' : '✗'}`
    : null

  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-2">
      <label className="text-[11px] font-semibold uppercase text-gray-600">{providerLabel}</label>
      <div className="flex items-center gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={status.hasDbValue ? '••••••• (laisse vide pour ne pas changer)' : status.hasEnvFallback ? 'Valeur depuis env Vercel — saisis pour override' : 'Saisis la clé…'}
          className="flex-1 text-sm font-mono border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0000FF]/20"
        />
        <button onClick={() => setShow(!show)} className="text-gray-400 hover:text-gray-700 p-1.5">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button
          onClick={save}
          disabled={saving || !value.trim()}
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded bg-[#0000FF] text-white hover:bg-[#0000CC] disabled:bg-gray-300"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Sauvegarder
        </button>
      </div>
      {lastVal && (
        <div className={`text-[11px] flex items-center gap-1 ${status.lastValidationOk ? 'text-green-600' : 'text-red-600'}`}>
          {status.lastValidationOk ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {lastVal}
          {status.lastValidationError && <span className="text-gray-500"> — {status.lastValidationError.slice(0, 80)}</span>}
        </div>
      )}
    </div>
  )
}

function AlertSettingsEditor({ provider, initial }: { provider: string; initial: AlertSetting }) {
  const router = useRouter()
  const [_isPending, startTransition] = useTransition()
  const [pct, setPct] = useState<number>(initial.threshold_pct)
  const [usdRemaining, setUsdRemaining] = useState<string>(initial.threshold_usd_remaining?.toString() ?? '')
  const [enabled, setEnabled] = useState(initial.enabled)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/monitoring/api-alert-settings/${provider}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threshold_pct: pct,
          threshold_usd_remaining: usdRemaining.trim() === '' ? null : Number(usdRemaining),
          enabled,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success('Seuils mis à jour.')
      startTransition(() => router.refresh())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-2">
      <div className="text-[11px] font-semibold uppercase text-gray-600">Seuils d'alerte</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-700">
          Alerte si %  consommé ≥
          <input
            type="number" min="0" max="100" value={pct}
            onChange={e => setPct(Number(e.target.value))}
            className="block w-full mt-0.5 text-sm border border-gray-200 rounded px-2 py-1 tabular-nums"
          />
        </label>
        <label className="text-xs text-gray-700">
          Ou si $ restants ≤
          <input
            type="number" min="0" placeholder="(optionnel)"
            value={usdRemaining}
            onChange={e => setUsdRemaining(e.target.value)}
            className="block w-full mt-0.5 text-sm border border-gray-200 rounded px-2 py-1 tabular-nums"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="rounded" />
        Alerte activée
      </label>
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded bg-[#0000FF] text-white hover:bg-[#0000CC] disabled:bg-gray-300"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Sauver les seuils
        </button>
      </div>
    </div>
  )
}

function formatUsage(value: number | null, unit: string | null): string {
  if (value == null) return '—'
  if (unit === 'usd') return `$${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`
  if (unit === 'tokens') return value.toLocaleString('fr-FR')
  if (unit === 'emails') return `${value.toLocaleString('fr-FR')} email${value > 1 ? 's' : ''}`
  return value.toLocaleString('fr-FR')
}

function barColor(pct: number, threshold: number): string {
  if (pct >= 95) return 'bg-red-500'
  if (pct >= threshold) return 'bg-amber-500'
  if (pct >= 50) return 'bg-blue-500'
  return 'bg-green-500'
}
