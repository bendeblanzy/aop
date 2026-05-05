import { adminClient } from '@/lib/supabase/admin'
import { PROVIDER_LABELS, PROVIDER_DASHBOARDS } from '@/lib/monitoring/api-usage'
import { listCredentialsStatus, isMasterSecretConfigured } from '@/lib/monitoring/api-credentials'
import { BarChart3, Lock, AlertTriangle } from 'lucide-react'
import { TriggerApiCheckButton } from '@/components/admin/TriggerApiCheckButton'
import { ApiProviderCard } from '@/components/admin/ApiProviderCard'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface SnapshotRow {
  provider: 'apify' | 'resend' | 'anthropic' | 'openai'
  snapshot_date: string
  usage_value: number | null
  usage_unit: string | null
  limit_value: number | null
  usage_pct: number | null
  credits_remaining_usd: number | null
  spent_30d_usd: number | null
}

const PROVIDERS: SnapshotRow['provider'][] = ['apify', 'resend', 'anthropic', 'openai']

export default async function ApiUsagePage() {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const [snapshotsRes, alertsRes, credStatuses] = await Promise.all([
    adminClient.from('api_usage_snapshots')
      .select('provider, snapshot_date, usage_value, usage_unit, limit_value, usage_pct, credits_remaining_usd, spent_30d_usd')
      .gte('snapshot_date', since)
      .order('snapshot_date', { ascending: false })
      .limit(500),
    adminClient.from('api_alert_settings').select('provider, threshold_pct, threshold_usd_remaining, enabled'),
    listCredentialsStatus(),
  ])

  const snapshots = (snapshotsRes.data ?? []) as SnapshotRow[]
  const latestByProvider = new Map<string, SnapshotRow>()
  for (const s of snapshots) {
    if (!latestByProvider.has(s.provider)) latestByProvider.set(s.provider, s)
  }
  const alertsByProvider = new Map<string, { provider: string; threshold_pct: number; threshold_usd_remaining: number | null; enabled: boolean }>()
  for (const a of (alertsRes.data ?? []) as Array<{ provider: string; threshold_pct: number; threshold_usd_remaining: number | null; enabled: boolean }>) {
    alertsByProvider.set(a.provider, a)
  }
  const credByProvider = new Map(credStatuses.map(c => [c.provider, c]))

  const masterSecretOk = isMasterSecretConfigured()

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-900 flex items-start gap-3">
        <BarChart3 className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p>
            Snapshot quotidien de l'usage des APIs tierces. Le cron tourne tous les jours à 11 h Europe/Paris.
            Les seuils d'alerte sont éditables par provider via l'icône <strong>réglages</strong> de chaque card.
          </p>
        </div>
        <TriggerApiCheckButton />
      </div>

      {!masterSecretOk && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <strong>Stockage des clés en clair.</strong> Pour activer le chiffrement des clés API en base, ajoute la variable d'env Vercel <code className="bg-white px-1 rounded">API_KEY_ENCRYPTION_SECRET</code> (32+ caractères aléatoires). Les clés actuellement saisies seront automatiquement migrées au prochain save.
          </div>
        </div>
      )}

      {masterSecretOk && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Clés chiffrées via pgcrypto (clé maître stockée dans Vercel).
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PROVIDERS.map(provider => {
          const snap = latestByProvider.get(provider) ?? null
          const alert = alertsByProvider.get(provider) ?? { provider, threshold_pct: 80, threshold_usd_remaining: null, enabled: true }
          const apiCred = credByProvider.get(provider) ?? {
            provider, hasDbValue: false, hasEnvFallback: false,
            lastValidatedAt: null, lastValidationOk: null, lastValidationError: null,
          }
          const adminCred = (provider === 'anthropic' || provider === 'openai')
            ? credByProvider.get(`${provider}_admin`) ?? {
                provider: `${provider}_admin`, hasDbValue: false, hasEnvFallback: false,
                lastValidatedAt: null, lastValidationOk: null, lastValidationError: null,
              }
            : undefined

          return (
            <ApiProviderCard
              key={provider}
              provider={provider}
              label={PROVIDER_LABELS[provider]}
              dashboardUrl={PROVIDER_DASHBOARDS[provider]}
              apiKeyStatus={apiCred}
              adminKeyStatus={adminCred}
              alert={alert}
              snapshot={snap}
              threshold={alert.threshold_pct}
            />
          )
        })}
      </div>
    </div>
  )
}
