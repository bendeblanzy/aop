import { adminClient } from '@/lib/supabase/admin'
import { AlertTriangle, AlertCircle, XCircle, Server } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ErrorLogRow {
  id: string
  level: 'warn' | 'error' | 'fatal'
  message: string
  stack: string | null
  source: string | null
  user_id: string | null
  url: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const LEVEL_STYLES = {
  warn: { Icon: AlertTriangle, bg: 'bg-amber-100', text: 'text-amber-700', label: 'Warn' },
  error: { Icon: AlertCircle, bg: 'bg-red-100', text: 'text-red-700', label: 'Error' },
  fatal: { Icon: XCircle, bg: 'bg-red-200', text: 'text-red-900', label: 'Fatal' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default async function ErrorsPage() {
  const { data, error } = await adminClient
    .from('error_logs')
    .select('id, level, message, stack, source, user_id, url, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) console.error('[admin/errors] read error:', error.message)
  const errors = (data ?? []) as ErrorLogRow[]

  // Stats simples
  const last24h = errors.filter(e => Date.now() - new Date(e.created_at).getTime() < 86400_000).length
  const fatalCount = errors.filter(e => e.level === 'fatal').length

  const sentryDsn = !!process.env.SENTRY_DSN

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-900 space-y-2">
        <p>
          Erreurs serveur loggées via le helper interne <code className="bg-white px-1 rounded">logError()</code>.
          Affiche les 100 dernières.
        </p>
        {!sentryDsn && (
          <p className="text-xs text-blue-700">
            💡 Pour aller plus loin, créer un projet Sentry gratuit (<a href="https://sentry.io/signup/" target="_blank" rel="noopener noreferrer" className="underline">sentry.io</a>),
            puis ajouter <code className="bg-white px-1 rounded">SENTRY_DSN</code> dans les variables d'environnement Vercel.
            Le code @sentry/nextjs sera ajouté dans une PR ultérieure.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Total (100 derniers)" value={errors.length} Icon={Server} />
        <KpiCard label="Dernières 24h" value={last24h} Icon={AlertCircle} accent={last24h > 5 ? 'red' : 'gray'} />
        <KpiCard label="Fatales" value={fatalCount} Icon={XCircle} accent={fatalCount > 0 ? 'red' : 'gray'} />
      </div>

      {errors.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-500">
          <AlertCircle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          Aucune erreur loggée — c'est plutôt bon signe.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {errors.map(err => <ErrorRow key={err.id} error={err} />)}
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, Icon, accent = 'gray' }: { label: string; value: number; Icon: React.ComponentType<{ className?: string }>; accent?: 'gray' | 'red' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent === 'red' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  )
}

function ErrorRow({ error }: { error: ErrorLogRow }) {
  const style = LEVEL_STYLES[error.level]
  const Icon = style.Icon

  return (
    <details className="px-4 py-3 hover:bg-gray-50/50 group">
      <summary className="flex items-center gap-3 cursor-pointer">
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded shrink-0 ${style.bg} ${style.text}`}>
          <Icon className="w-3 h-3" />
          {style.label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate font-mono">{error.message}</div>
          <div className="text-xs text-gray-500 truncate">
            {error.source && <code className="font-mono mr-2">{error.source}</code>}
            {formatDate(error.created_at)}
          </div>
        </div>
      </summary>
      <div className="mt-3 ml-3 space-y-2 text-xs text-gray-600">
        {error.url && <div><strong>URL :</strong> <code className="font-mono break-all">{error.url}</code></div>}
        {error.stack && (
          <div>
            <strong>Stack :</strong>
            <pre className="mt-1 bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto text-[11px] font-mono whitespace-pre-wrap">{error.stack}</pre>
          </div>
        )}
        {error.metadata && Object.keys(error.metadata).length > 0 && (
          <div><strong>Metadata :</strong> <code className="font-mono">{JSON.stringify(error.metadata)}</code></div>
        )}
      </div>
    </details>
  )
}
