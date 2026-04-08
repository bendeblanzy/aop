import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgIdForUser } from '@/lib/supabase/admin'
import { adminClient } from '@/lib/supabase/admin'
import { getEmbedding, buildCollaborateurText } from '@/lib/ai/embeddings'

/**
 * POST /api/collaborateurs/embed
 * Recalcule les embeddings de tous les collaborateurs de l'organisation.
 * Appelé automatiquement après sauvegarde d'un collaborateur.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  try {
    // Charger tous les collaborateurs de l'org
    const { data: collabs, error } = await adminClient
      .from('collaborateurs')
      .select('id, prenom, nom, poste, role_metier, bio, competences_cles, diplomes, certifications, experience_annees')
      .eq('organization_id', orgId)

    if (error) throw error
    if (!collabs || collabs.length === 0) {
      return NextResponse.json({ embedded: 0 })
    }

    let embedded = 0
    for (const collab of collabs) {
      const text = buildCollaborateurText(collab)
      if (!text || text.length < 20) continue // Pas assez de contenu

      const embedding = await getEmbedding(text)
      if (embedding.length === 0) continue

      const { error: updateErr } = await adminClient
        .from('collaborateurs')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', collab.id)

      if (!updateErr) embedded++
    }

    return NextResponse.json({ embedded, total: collabs.length })
  } catch (e) {
    console.error('[embed-collabs] error:', e)
    return NextResponse.json({ error: 'Erreur lors de la vectorisation' }, { status: 500 })
  }
}
