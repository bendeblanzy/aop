import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Check if user already belongs to an organization
    const { data: existing } = await adminClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Vous appartenez déjà à une organisation' },
        { status: 409 }
      )
    }

    const body = await request.json()
    const { name } = body as { name: string }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Le nom de l\'organisation est requis' }, { status: 400 })
    }

    // Create the organization
    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .insert({ name: name.trim() })
      .select('id, name')
      .single()

    if (orgError || !org) {
      return NextResponse.json(
        { error: orgError?.message ?? 'Erreur lors de la création de l\'organisation' },
        { status: 500 }
      )
    }

    // Add the creating user as admin
    const { error: memberError } = await adminClient
      .from('organization_members')
      .insert({
        organization_id: org.id,
        user_id: user.id,
        role: 'admin',
      })

    if (memberError) {
      // Rollback: delete the organization we just created
      await adminClient.from('organizations').delete().eq('id', org.id)
      return NextResponse.json(
        { error: memberError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ id: org.id, name: org.name }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
