'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard, Building2, BookMarked, Users,
  FileText, Settings, LogOut, Radar,
  Menu, X, Star, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
  activeWhen?: (pathname: string, search: string) => boolean
}

const navigation: NavItem[] = [
  { name: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Veille marchés', href: '/veille', icon: Radar, exact: true },
  { name: 'Mes favoris', href: '/veille?tab=favorites', icon: Star, activeWhen: (p, s) => p === '/veille' && s.includes('tab=favorites') },
  { name: "Appels d'offres", href: '/appels-offres', icon: FileText },
  { name: 'Mon profil', href: '/profil', icon: Building2 },
  { name: 'Références', href: '/references', icon: BookMarked },
  { name: 'Équipe', href: '/equipe', icon: Users },
  { name: 'Paramètres', href: '/parametres', icon: Settings },
  { name: 'Gestion DCE', href: '/admin/dce', icon: FolderOpen },
]

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
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
      <div className="flex items-center justify-between px-5 py-5 border-b border-border">
        <Link href="/dashboard">
          <Image
            src="/logo-ladn.svg"
            alt="L'ADN DATA"
            width={160}
            height={56}
            priority
          />
        </Link>
        {/* Bouton fermer (mobile uniquement) */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 text-text-secondary hover:text-text-primary"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navigation.map((item) => {
          const searchString = searchParams.toString()
          const isActive = item.activeWhen
            ? item.activeWhen(pathname, searchString)
            : item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group',
                isActive
                  ? 'bg-[#0000FF] text-white font-semibold'
                  : 'text-gray-600 font-medium hover:bg-[#E6E6FF] hover:text-[#0000FF]'
              )}
            >
              <item.icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#0000FF]')} />
              {item.name}
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
