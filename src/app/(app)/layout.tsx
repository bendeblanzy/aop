import { Sidebar } from '@/components/layout/sidebar'
import { BugReportButton } from '@/components/bug-report/BugReportButton'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { OrganizationProvider } from '@/context/OrganizationContext'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Check org membership
  const { data: membership } = await adminClient
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    // Si l'utilisateur doit changer son mot de passe, on le laisse accéder à /parametres d'abord
    const forcePasswordChange = user.user_metadata?.force_password_change === true
    if (!forcePasswordChange) redirect('/onboarding')
  }

  return (
    <OrganizationProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 lg:ml-60 p-4 pt-16 lg:pt-8 lg:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
        <BugReportButton />
      </div>
    </OrganizationProvider>
  )
}
