import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

/**
 * Migration 007 — Promote benjamindeblanzy@gmail.com to admin
 *
 * Fix: le compte gmail.com avait le rôle 'member' au lieu de 'admin'
 */
export async function GET() {
  try {
    // Find the user by email
    const { data: users, error: listError } = await adminClient.auth.admin.listUsers()

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 })
    }

    const gmailUser = users.users.find(u => u.email === 'benjamindeblanzy@gmail.com')

    if (!gmailUser) {
      return NextResponse.json({ error: 'Utilisateur gmail.com non trouvé' }, { status: 404 })
    }

    // Update role to admin
    const { data: updated, error: updateError } = await adminClient
      .from('organization_members')
      .update({ role: 'admin' })
      .eq('user_id', gmailUser.id)
      .select()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      status: 'done',
      message: 'benjamindeblanzy@gmail.com promu admin',
      updated,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
