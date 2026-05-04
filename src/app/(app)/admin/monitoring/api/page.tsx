import { adminClient } from '@/lib/supabase/admin'
import { PROVIDER_LABELS, PROVIDER_DASHBOARDS } from '@/lib/monitoring/api-usage'
import { ExternalLink, BarChart3, AlertTriangle, RefreshCw } from 'lucide-react'
import { TriggerApiCheckButton } from '@/components/admin/TriggerApiCheckButton'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface SnapshotRow {
  provider: 'apify' | 'resend' | 'anthropic' | 'openai'
  snapshot_date: string
  usage_value: number | null
  usage_unit: string | null
  limit_value: number | null
  usage_pct: number | null
  period_start: string | null
  period_end: string | null
  created_at: string
}

const PROVIDERS: SnapshotRow['provider'][] = ['apify', 'resend', 'anthropic', 'openai']

function formatUsage(value: number | null, unit: string | null): string {
  if (value == null) return '—'
  if (unit === 'usd') return `$${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`
  if (unit === 'tokens') return value.toLocaleString('fr-FR')
  if (unit === 'emails') return `${value.toLocaleString('fr-FR')} email${value > 1 ? 's' : ''}`
  return value.toLocaleString('fr-FR')
}

export default async function ApiUsagePage() {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const { data, error } = await adminClient
    .from('api_usage_snapshots')
    .select('provider, snapshot_date, usage_value, usage_unit, limit_value, usage_pct, period_start, period_end, created_at')
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: false })
    .limit(500)

  if (error) console.error('[admin/api] read error:', error.message)
  const allSnapshots = (data ?? []) as SnapshotRow[]

  // Group by provider
  const byProvider: Record<string, SnapshotRow[]> = {}
  for (const p of PROVIDERS) byProvider[p] = []
  for (const s of allSnapshots) {
    if (byProvider[s.provider]) byProvider[s.provider].push(s)
  }

  const threshold = Number(process.env.API_USAGE_ALERT_THRESHOLD ?? '80')

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-900 flex items-start gap-3">
        <BarChart3 className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p>
            Snapshot quotidien de l'usage des APIs tierces. Le cron tourne tous les jours à 11h Europe/Paris.
            Email d'alerte envoyé si un provider dépasse <strong>{threshold}%</strong> du quota.
          </p>
          <p className="text-xs text-blue-700 mt-1">
            Pour activer le tracking Anthropic et OpenAI, ajouter <code className="bg-white px-1 rounded">ANTHROPIC_ADMIN_KEY</code> et <code className="bg-white px-1 rounded">OPENAI_ADMIN_KEY</code> dans les variables d'environnement Vercel.
          </p>
        </div>
        <TriggerApiCheckButton />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDERS.map(provider => (
          <ProviderCard
            key={provider}
            provider={provider}
            snapshots={byProvider[provider] ?? []}
            threshold={threshold}
          />
        ))}
      </div>
    </div>
  )
}

function ProviderCard({ provider, snapshots, threshold }: { provider: SnapshotRow['provider']; snapshots: SnapshotRow[]; threshold: number }) {
  const latest = snapshots[0]
  const label = PROVIDER_LABELS[provider]
  const dashboardUrl = PROVIDER_DASHBOARDS[provider]

  if (!latest) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-semibold text-gray-900">{label}</h3>
          <a href={dashboardUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0000FF] hover:underline inline-flex items-center gap-1">
            Dashboard <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <p className="text-sm text-gray-500 italic mt-3">
          Aucune donnée pour le moment. Le cron crée un snapshot quotidien à 11h —
          ou clique <strong>Lancer le check</strong> pour le déclencher maintenant.
        </p>
      </div>
    )
  }

  const pct = latest.usage_pct ?? 0
  const overThreshold = pct >= threshold
  const barColor = pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : pct >= 50 ? 'bg-blue-500' : 'bg-green-500'

  // Mini-graph 30 jours : dots
  const trend = [...snapshots].reverse() // chronologique

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">{label}</h3>
          <p className="text-xs text-gray-500">
            Snapshot du {new Date(latest.snapshot_date).toLocaleDateString('fr-FR')}
            {latest.period_end && ` · cycle jusqu'au ${new Date(latest.period_end).toLocaleDateString('fr-FR')}`}
          </p>
        </div>
        {overThreshold && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700">
            <AlertTriangle className="w-3 h-3" />
            &gt;{threshold}%
          </span>
        )}
      </div>

      {/* Usage bar */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-2xl font-bold text-gray-900 tabular-nums">{pct.toFixed(1)}<span className="text-base text-gray-400">%</span></span>
          <span className="text-xs text-gray-500 tabular-nums">{formatUsage(latest.usage_value, latest.usage_unit)}{latest.limit_value != null && ` / ${formatUsage(latest.limit_value, latest.usage_unit)}`}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${barColor}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      {/* Mini sparkline 30j */}
      {trend.length > 1 && (
        <div className="pt-2">
          <div className="text-[10px] uppercase font-semibold text-gray-400 mb-1">30 derniers jours</div>
          <div className="flex items-end gap-0.5 h-10">
            {trend.map(s => {
              const h = s.usage_pct != null ? Math.max(2, Math.min(100, s.usage_pct)) : 2
              const c = (s.usage_pct ?? 0) >= threshold ? 'bg-red-300' : 'bg-blue-300'
              return (
                <div
                  key={s.snapshot_date}
                  className={`flex-1 ${c} rounded-sm`}
                  style={{ height: `${h}%` }}
                  title={`${s.snapshot_date} — ${s.usage_pct?.toFixed(1) ?? '?'}%`}
                />
              )
            })}
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
        <a href={dashboardUrl} target="_blank" rel="noopener noreferrer" className="text-[#0000FF] hover:underline inline-flex items-center gap-1">
          Dashboard {label} <ExternalLink className="w-3 h-3" />
        </a>
        <span className="text-gray-400 inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          Maj quotidienne
        </span>
      </div>
    </div>
  )
}
