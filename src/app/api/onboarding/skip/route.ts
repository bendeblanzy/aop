import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

/**
 * POST /api/onboarding/skip
 * Marque l'onboarding comme complété pour un collaborateur rejoint par invitation.
 * L'organisation est déjà configurée, pas besoin de refaire le profil.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, onboarding_completed: true },
  })

  return NextResponse.json({ success: true })
}
