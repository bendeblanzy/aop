import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { getEmbedding, buildProfileText } from '@/lib/ai/embeddings'

/**
 * POST /api/veille/embed-profile
 * Recalcule l'embedding du profil organisation.
 * Appelé automatiquement après modification du profil.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { data: profile } = await adminClient
    .from('profiles')
    .select('activite_metier, raison_sociale, domaines_competence, certifications, positionnement, atouts_differenciants, moyens_techniques')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!profile?.activite_metier?.trim()) {
    return NextResponse.json({ error: 'Activité métier non renseignée' }, { status: 400 })
  }

  const text = buildProfileText(profile)
  const embedding = await getEmbedding(text)

  if (embedding.length === 0) {
    return NextResponse.json({ error: 'Embedding generation failed' }, { status: 500 })
  }

  const { error } = await adminClient
    .from('profiles')
    .update({
      embedding: JSON.stringify(embedding),
      embedding_updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, dimensions: embedding.length })
}
