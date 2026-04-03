import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { data, error } = await adminClient
      .from('organization_members')
      .select('role, organizations(id, name)')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || !data.organizations) {
      return NextResponse.json({ error: 'Aucune organisation trouvée' }, { status: 404 })
    }

    const org = (Array.isArray(data.organizations) ? data.organizations[0] : data.organizations) as { id: string; name: string }

    return NextResponse.json({
      id: org.id,
      name: org.name,
      role: data.role,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
