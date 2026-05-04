'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard, Building2, Users,
  Settings, LogOut, Search,
  Menu, X, Star, Lock, UserCog, FileText, Activity,
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
  disabled?: boolean
  badge?: string
  section?: 'main' | 'account' | 'admin'
}

const navigation: NavItem[] = [
  // ── Veille & Recherche ──
  { name: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard, section: 'main' },
  { name: 'Recherche', href: '/veille', icon: Search, activeWhen: (p, s) => p === '/veille' && !s.includes('tab=favorites'), section: 'main' },
  { name: 'Favoris', href: '/veille?tab=favorites', icon: Star, activeWhen: (p, s) => p === '/veille' && s.includes('tab=favorites'), section: 'main' },
  { name: 'Mes AO suivis', href: '/appels-offres', icon: FileText, section: 'main' },
  // ── Compte ──
  { name: 'Mon profil', href: '/profil', icon: Building2, section: 'account' },
  { name: 'Mon équipe', href: '/equipe', icon: Users, section: 'account' },
  { name: 'Paramètres', href: '/parametres', icon: Settings, section: 'account' },
]

// Admin items (shown separately)
const adminNavigation: NavItem[] = [
  { name: 'Utilisateurs', href: '/admin/users', icon: UserCog, section: 'admin' },
]

// Super-admin items (plateforme — visible si is_super_admin)
const superAdminNavigation: NavItem[] = [
  { name: 'Monitoring', href: '/admin/monitoring/syncs', icon: Activity, section: 'admin' },
]

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [forceMode, setForceMode] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Détecte si l'utilisateur doit changer son mdp à la première connexion.
  // Tant que c'est le cas, on désactive la navigation et on masque la déconnexion
  // (le middleware redirige déjà vers /parametres?force=1, mais autant éviter
  // les clics inutiles côté UI).
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      setForceMode(data.user?.user_metadata?.force_password_change === true)
      setIsSuperAdmin(data.user?.user_metadata?.is_super_admin === true)
      if (data.user) {
        // Vérifier le rôle dans organization_members
        const { data: member } = await supabase
          .from('organization_members')
          .select('role')
          .eq('user_id', data.user.id)
          .maybeSingle()
        setIsAdmin(member?.role === 'admin')
      }
    })
  }, [pathname])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  function renderNavItem(item: NavItem) {
    const searchString = searchParams.toString()
    const isActive = item.activeWhen
      ? item.activeWhen(pathname, searchString)
      : item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(item.href + '/')

    // En mode force_password_change, tout est désactivé sauf /parametres
    const isLockedByForce = forceMode && !item.href.startsWith('/parametres')

    if (item.disabled || isLockedByForce) {
      return (
        <div
          key={item.name}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 cursor-not-allowed"
        >
          <item.icon className="w-4 h-4 shrink-0 text-gray-300" />
          <span className="flex-1">{item.name}</span>
          {item.badge && (
            <span className="text-[10px] font-semibold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full border border-gray-200 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              {item.badge}
            </span>
          )}
        </div>
      )
    }

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
        <item.icon className={cn(
          'w-4 h-4 shrink-0',
          isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#0000FF]',
          !isActive && item.name === 'Favoris' && 'text-amber-400 fill-amber-400 group-hover:text-amber-500 group-hover:fill-amber-500',
        )} />
        {item.name}
      </Link>
    )
  }

  const mainItems = navigation.filter(i => i.section === 'main')
  const accountItems = navigation.filter(i => i.section === 'account')

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-[#E0E0F0]">
        <Link href="/dashboard">
          <Image
            src="/logo-ladn.svg"
            alt="L'ADN DATA"
            width={140}
            height={50}
            priority
          />
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col">
        {/* Section principale : Veille & Recherche */}
        <div className="space-y-0.5">
          {mainItems.map(item => renderNavItem(item))}
        </div>

        {/* Séparateur */}
        <div className="my-4 border-t border-[#E0E0F0]" />

        {/* Section compte */}
        <div className="space-y-0.5">
          {accountItems.map(item => renderNavItem(item))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Admin section — visible uniquement pour les admins */}
        {isAdmin && adminNavigation.length > 0 && (
          <>
            <div className="my-3 border-t border-[#E0E0F0]" />
            <div className="mb-1">
              <span className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Administration</span>
            </div>
            <div className="space-y-0.5">
              {adminNavigation.map(item => renderNavItem(item))}
            </div>
          </>
        )}

        {/* Super-admin section — plateforme, visible si is_super_admin */}
        {isSuperAdmin && superAdminNavigation.length > 0 && (
          <>
            <div className="my-3 border-t border-[#E0E0F0]" />
            <div className="mb-1">
              <span className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Plateforme</span>
            </div>
            <div className="space-y-0.5">
              {superAdminNavigation.map(item => renderNavItem(item))}
            </div>
          </>
        )}
      </nav>

      {/* Footer: Logout — masqué en mode force_password_change pour empêcher
          l'utilisateur de se déconnecter et se reconnecter avec le mdp initial */}
      {!forceMode && (
        <div className="px-3 py-4 border-t border-[#E0E0F0]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      {/* Hamburger button (mobile) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-[#E0E0F0] rounded-lg shadow-sm"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5 text-gray-700" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar mobile (drawer) */}
      <div className={cn(
        'lg:hidden fixed left-0 top-0 h-full w-72 bg-white border-r border-[#E0E0F0] flex flex-col z-50 transition-transform duration-200',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {sidebarContent}
      </div>

      {/* Sidebar desktop (fixed) */}
      <div className="hidden lg:flex fixed left-0 top-0 h-full w-60 bg-white border-r border-[#E0E0F0] flex-col z-40">
        {sidebarContent}
      </div>
    </>
  )
}
