import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'

/** GET /api/veille/favorites — Liste les idwebs favoris de l'organisation */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { data, error } = await adminClient
    .from('tender_favorites')
    .select('tender_idweb, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ favorites: (data ?? []).map(f => f.tender_idweb) })
}

/** POST /api/veille/favorites — Ajoute un favori */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { idweb } = body
  if (!idweb || typeof idweb !== 'string') {
    return NextResponse.json({ error: 'idweb required' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('tender_favorites')
    .insert({ tender_idweb: idweb, organization_id: orgId })

  // Ignore "already exists" error (unique constraint)
  if (error && !error.message.includes('duplicate')) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/** DELETE /api/veille/favorites — Retire un favori */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { idweb } = body
  if (!idweb || typeof idweb !== 'string') {
    return NextResponse.json({ error: 'idweb required' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('tender_favorites')
    .delete()
    .eq('tender_idweb', idweb)
    .eq('organization_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
