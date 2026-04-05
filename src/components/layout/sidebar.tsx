'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Building2, BookMarked, Users,
  FileText, Settings, LogOut, ChevronRight, Radar,
  Menu, X
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
  const [mobileOpen, setMobileOpen] = useState(false)

  // Fermer le menu mobile lors d'un changement de route
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg text-primary">AOP</span>
        </div>
        {/* Bouton fermer (mobile uniquement) */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 text-text-secondary hover:text-text-primary"
        >
          <X className="w-5 h-5" />
        </button>
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
    </>
  )

  return (
    <>
      {/* Bouton hamburger (mobile) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-border rounded-lg shadow-sm"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5 text-text-primary" />
      </button>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar mobile (drawer) */}
      <div className={cn(
        'lg:hidden fixed left-0 top-0 h-full w-72 bg-surface border-r border-border flex flex-col z-50 transition-transform duration-200',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {sidebarContent}
      </div>

      {/* Sidebar desktop (fixe) */}
      <div className="hidden lg:flex fixed left-0 top-0 h-full w-60 bg-surface border-r border-border flex-col z-40">
        {sidebarContent}
      </div>
    </>
  )
}
