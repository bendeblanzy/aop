import { adminClient } from '@/lib/supabase/admin'
import { BugReportRow, type BugReport } from '@/components/admin/BugReportRow'
import { Bug } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const STATUS_TABS: { value: BugReport['status'] | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'new', label: 'Nouveaux' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'resolved', label: 'Résolus' },
  { value: 'wontfix', label: 'Won\'t fix' },
]

interface PageProps {
  searchParams: Promise<{ status?: BugReport['status'] | 'all' }>
}

export default async function BugsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const filter: BugReport['status'] | 'all' = (sp.status as BugReport['status'] | 'all' | undefined) ?? 'new'

  let query = adminClient
    .from('bug_reports')
    .select('id, reporter_email, reporter_user_id, title, description, url, user_agent, status, severity, notes, created_at, updated_at, resolved_at, metadata')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filter !== 'all') {
    query = query.eq('status', filter)
  }

  const { data: bugs, error } = await query
  if (error) console.error('[admin/bugs] read error:', error.message)

  const list = (bugs ?? []) as BugReport[]

  // Compteurs par statut (sans filtre)
  const { data: countsRaw } = await adminClient
    .from('bug_reports')
    .select('status')
  const counts: Record<string, number> = {}
  for (const row of countsRaw ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-900">
        <p>
          Signalements remontés par les utilisateurs via le bouton flottant <strong>« Signaler un bug »</strong>.
          Une notification email est envoyée à chaque nouveau signalement.
        </p>
      </div>

      {/* Tabs filtres */}
      <nav className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {STATUS_TABS.map(tab => {
          const isActive = (filter as string) === tab.value || (tab.value === 'all' && !STATUS_TABS.slice(1).some(t => t.value === filter))
          const count = tab.value === 'all'
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : counts[tab.value] ?? 0
          return (
            <a
              key={tab.value}
              href={tab.value === 'all' ? '?status=all' : `?status=${tab.value}`}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-[#0000FF] border-[#0000FF]'
                  : 'text-gray-500 border-transparent hover:text-[#0000FF]'
              }`}
            >
              {tab.label}
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                isActive ? 'bg-[#0000FF] text-white' : 'bg-gray-100 text-gray-500'
              }`}>{count}</span>
            </a>
          )
        })}
      </nav>

      {list.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-500">
          <Bug className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          Aucun bug dans cette catégorie.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {list.map(bug => <BugReportRow key={bug.id} bug={bug} />)}
        </div>
      )}
    </div>
  )
}
