import { adminClient } from '@/lib/supabase/admin'
import { Users, Activity, CheckCircle2, Building2, Mail } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface AuthUserRow {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  raw_user_meta_data: Record<string, unknown> | null
}

interface MembershipRow {
  user_id: string
  organization_id: string
  role: 'admin' | 'member'
}

interface OrgRow { id: string; name: string }
interface FavRow { organization_id: string }

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Jamais'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function relTime(iso: string | null): string {
  if (!iso) return 'Jamais'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'à l\'instant'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`
  if (diff < 86_400_000 * 30) return `${Math.floor(diff / 86_400_000)} j`
  return fmtDate(iso)
}

export default async function UsersAdminPage() {
  // 1. Tous les users via Supabase admin auth API (pas dispo via SQL public direct,
  //    mais admin.listUsers() oui).
  const { data: usersData, error: usersErr } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (usersErr) console.error('[admin/users] listUsers error:', usersErr.message)
  const users: AuthUserRow[] = (usersData?.users ?? []).map(u => ({
    id: u.id,
    email: u.email ?? null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    raw_user_meta_data: u.user_metadata ?? null,
  }))

  // 2. Memberships
  const { data: members } = await adminClient
    .from('organization_members')
    .select('user_id, organization_id, role')
  const membersByUser = new Map<string, MembershipRow>()
  for (const m of (members ?? []) as MembershipRow[]) membersByUser.set(m.user_id, m)

  // 3. Orgs
  const orgIds = Array.from(new Set((members ?? []).map((m: MembershipRow) => m.organization_id)))
  let orgsByid: Map<string, string> = new Map()
  if (orgIds.length > 0) {
    const { data: orgs } = await adminClient
      .from('organizations')
      .select('id, name')
      .in('id', orgIds)
    orgsByid = new Map(((orgs ?? []) as OrgRow[]).map(o => [o.id, o.name]))
  }

  // 4. Favoris par org (proxy "AOP suivis")
  const { data: favs } = await adminClient.from('tender_favorites').select('organization_id')
  const favCountByOrg = new Map<string, number>()
  for (const f of (favs ?? []) as FavRow[]) {
    favCountByOrg.set(f.organization_id, (favCountByOrg.get(f.organization_id) ?? 0) + 1)
  }

  // KPIs
  const now = Date.now()
  const dau = users.filter(u => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 86400_000).length
  const mau = users.filter(u => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 30 * 86400_000).length
  const onboardedUsers = users.filter(u =>
    (u.raw_user_meta_data as { onboarding_completed?: boolean })?.onboarding_completed === true
  ).length
  const onboardingRate = users.length > 0 ? Math.round((onboardedUsers / users.length) * 1000) / 10 : 0
  const orgsCount = orgIds.length
  const favCounts = Array.from(favCountByOrg.values())
  const medianFavs = median(favCounts)

  // Sort users: les plus actifs récemment d'abord
  const sortedUsers = [...users].sort((a, b) => {
    const aTime = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
    const bTime = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
    return bTime - aTime
  })

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-900">
        Vue d'ensemble de l'activité utilisateurs sur la plateforme.
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi Icon={Users} label="Utilisateurs" value={users.length} sub={`${orgsCount} organisations`} />
        <Kpi Icon={Activity} label="DAU (24h)" value={dau} sub={users.length > 0 ? `${Math.round(dau / users.length * 100)}% du total` : ''} accent="blue" />
        <Kpi Icon={Activity} label="MAU (30j)" value={mau} sub={users.length > 0 ? `${Math.round(mau / users.length * 100)}% du total` : ''} accent="blue" />
        <Kpi Icon={CheckCircle2} label="Onboarding" value={`${onboardingRate}%`} sub={`${onboardedUsers}/${users.length} terminé`} accent={onboardingRate >= 70 ? 'green' : 'amber'} />
        <Kpi Icon={Building2} label="Favoris/org (méd.)" value={medianFavs} sub="AO suivis médian" />
      </div>

      {/* Table users */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{users.length} utilisateurs</h3>
          <span className="text-xs text-gray-500">Triés par activité récente</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                <th className="text-left px-4 py-2 font-semibold">Utilisateur</th>
                <th className="text-left px-4 py-2 font-semibold">Organisation</th>
                <th className="text-left px-4 py-2 font-semibold">Rôle</th>
                <th className="text-left px-4 py-2 font-semibold">Onboarding</th>
                <th className="text-left px-4 py-2 font-semibold">Inscription</th>
                <th className="text-left px-4 py-2 font-semibold">Dernière connexion</th>
                <th className="text-right px-4 py-2 font-semibold">Favoris org</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedUsers.map(u => {
                const m = membersByUser.get(u.id)
                const orgName = m ? orgsByid.get(m.organization_id) : null
                const onboarded = (u.raw_user_meta_data as { onboarding_completed?: boolean })?.onboarding_completed === true
                const isSuper = (u.raw_user_meta_data as { is_super_admin?: boolean })?.is_super_admin === true
                const favs = m ? favCountByOrg.get(m.organization_id) ?? 0 : 0
                const recentlyActive = u.last_sign_in_at && (now - new Date(u.last_sign_in_at).getTime() < 7 * 86400_000)

                return (
                  <tr key={u.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        <code className="font-mono text-xs">{u.email}</code>
                        {isSuper && <span className="text-[9px] font-semibold uppercase bg-[#E6E6FF] text-[#0000FF] px-1.5 py-0.5 rounded">super-admin</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-700 max-w-xs truncate">
                      {orgName ?? <span className="text-gray-400 italic">Aucune</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {m ? (
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${m.role === 'admin' ? 'bg-[#E6E6FF] text-[#0000FF]' : 'bg-gray-100 text-gray-500'}`}>
                          {m.role}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {onboarded ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700"><CheckCircle2 className="w-3 h-3" /> OK</span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-600">En cours</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 tabular-nums">{fmtDate(u.created_at)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {u.last_sign_in_at ? (
                        <span className={recentlyActive ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                          {relTime(u.last_sign_in_at)}
                        </span>
                      ) : <span className="text-gray-300">Jamais</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right tabular-nums text-gray-700">{favs > 0 ? favs : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Kpi({ Icon, label, value, sub, accent = 'gray' }: {
  Icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  sub?: string
  accent?: 'gray' | 'blue' | 'green' | 'amber' | 'red'
}) {
  const colors = {
    gray: 'bg-gray-100 text-gray-500',
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-red-100 text-red-600',
  }[accent]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
