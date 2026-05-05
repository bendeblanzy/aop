import { adminClient } from '@/lib/supabase/admin'
import { SYNC_SOURCES, type SyncSource } from '@/lib/monitoring/sync-run'
import { SyncsListClient } from '@/components/admin/SyncsListClient'

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

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  boamp: 'Récupère la liste des annonces BOAMP. Auto-chaîne sur l\'enrichissement à la fin pour combler les détails.',
  ted: 'Tenders Electronic Daily — annonces UE limitées à la France.',
  atexo: 'Atexo MPE — scraping PLACE + Maximilien.',
  aws: 'AWS Marchés Publics — scraping via Apify.',
  dedup: 'Marque les notices TED qui sont des doublons d\'avis BOAMP (cosine similarity ≥ 0.95).',
  'embed-tenders': 'Génère les embeddings OpenAI pour les tenders sans embedding (matching profil).',
  'enrich-tenders': 'Enrichit les anciens AO BOAMP avec leur détail complet (description, montant, lots). Auto-déclenché par sync-boamp pour les nouveaux.',
}

async function loadRuns(): Promise<Record<SyncSource, SyncRunRow[]>> {
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
  const [runsBySource, cronSettingsRes] = await Promise.all([
    loadRuns(),
    adminClient.from('cron_settings').select('source, preset, daily_hour_utc, enabled'),
  ])

  const cronSettings = (cronSettingsRes.data ?? []) as Array<{
    source: string
    preset: 'disabled' | 'daily' | 'every_2h' | 'every_4h' | 'every_8h' | 'every_12h' | 'hourly'
    daily_hour_utc: number | null
    enabled: boolean
  }>

  const sources = SYNC_SOURCES.map(s => ({
    id: s.id,
    label: s.label,
    description: SOURCE_DESCRIPTIONS[s.id],
  }))

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-900">
        <p>
          Chaque carte représente une source de données. Cliques sur l'icône <strong>horloge</strong> pour modifier la fréquence.
          Le bouton <strong>Relancer</strong> déclenche une exécution immédiate (verrou anti-doublon de 5 min).
          Si un run est en cours, sa progression s'affiche en bleu et se rafraîchit toutes les 3s.
        </p>
      </div>

      <SyncsListClient
        sources={sources}
        runsBySource={runsBySource}
        cronSettings={cronSettings}
      />
    </div>
  )
}
