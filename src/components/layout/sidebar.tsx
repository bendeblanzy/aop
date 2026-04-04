'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Building2, BookMarked, Users,
  FileText, Settings, LogOut, ChevronRight, Radar
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const navigation = [
  { name: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Veille BOAMP', href: '/veille', icon: Radar },
  { name: "Appels d'offres", href: '/appels-offres', icon: FileText },
  { name: 'Mon profil', href: '/profil', icon: Building2 },
  { name: 'Références', href: '/references', icon: BookMarked },
  { name: 'Équipe', href: '/equipe', icon: Users },
  { name: 'Paramètres', href: '/parametres', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="fixed left-0 top-0 h-full w-60 bg-surface border-r border-border flex flex-col z-40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <FileText className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-lg text-primary">AOP</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                isActive
                  ? 'bg-primary-light text-primary'
                  : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
              )}
            >
              <item.icon className={cn('w-4 h-4', isActive ? 'text-primary' : 'text-text-secondary group-hover:text-text-primary')} />
              {item.name}
              {isActive && <ChevronRight className="w-3 h-3 ml-auto text-primary" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-red-50 hover:text-danger w-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </div>
  )
}
