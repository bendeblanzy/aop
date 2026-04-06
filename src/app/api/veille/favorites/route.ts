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

  // Si la table n'existe pas encore (migration non appliquée), on retourne un tableau vide
  if (error) {
    const isMissingTable = error.message.includes('relation') || error.message.includes('does not exist') || error.code === '42P01'
    if (isMissingTable) return NextResponse.json({ favorites: [], migrationPending: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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

  if (error) {
    // Ignore "already exists" (unique constraint)
    if (error.message.includes('duplicate') || error.code === '23505') {
      return NextResponse.json({ ok: true })
    }
    // Table manquante — migration non appliquée
    if (error.message.includes('relation') || error.message.includes('does not exist') || error.code === '42P01') {
      return NextResponse.json({ error: 'Migration 003 non appliquée — exécutez supabase/migrations/003_add_favorites.sql dans Supabase' }, { status: 503 })
    }
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

  if (error) {
    if (error.message.includes('relation') || error.code === '42P01') {
      return NextResponse.json({ ok: true }) // Table absente = rien à supprimer
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
