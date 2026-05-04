import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/auth/super-admin'
import { Activity, Bug, BarChart3, Users, AlertTriangle } from 'lucide-react'

/**
 * Layout du backoffice super-admin `/admin/monitoring/*`.
 * Redirige vers /dashboard si l'utilisateur n'est pas super_admin.
 */
export default async function MonitoringLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSuperAdminContext()
  if (!ctx) redirect('/auth/login')
  if (!ctx.isSuperAdmin) redirect('/dashboard')

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-[#0000FF]" />
            Monitoring plateforme
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Vue d'ensemble des syncs, bugs et usages API. Visible uniquement par les super-admins.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0000FF] bg-[#E6E6FF] px-2.5 py-1 rounded-full">
          super-admin
        </span>
      </header>

      <nav className="flex items-center gap-1 border-b border-gray-200">
        <NavTab href="/admin/monitoring/syncs" icon={Activity}>État des syncs</NavTab>
        <NavTab href="/admin/monitoring/bugs" icon={Bug} disabled>Bug reports</NavTab>
        <NavTab href="/admin/monitoring/api" icon={BarChart3} disabled>Crédits API</NavTab>
        <NavTab href="/admin/monitoring/users" icon={Users} disabled>Activité users</NavTab>
        <NavTab href="/admin/monitoring/errors" icon={AlertTriangle} disabled>Erreurs</NavTab>
      </nav>

      <section>{children}</section>
    </div>
  )
}

function NavTab({
  href, icon: Icon, children, disabled,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  disabled?: boolean
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 cursor-not-allowed select-none">
        <Icon className="w-4 h-4" />
        {children}
        <span className="text-[10px] font-semibold uppercase text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded">Bientôt</span>
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-[#0000FF] border-b-2 border-transparent hover:border-[#0000FF] transition-colors"
    >
      <Icon className="w-4 h-4" />
      {children}
    </Link>
  )
}
