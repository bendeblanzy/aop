import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { getEmbedding, buildProfileText, buildCollaborateurText } from '@/lib/ai/embeddings'

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
    .select('activite_metier, raison_sociale, domaines_competence, certifications, positionnement, atouts_differenciants, moyens_techniques, profile_methodology')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!profile?.activite_metier?.trim()) {
    return NextResponse.json({ error: 'Activité métier non renseignée' }, { status: 400 })
  }

  // Enrichir le profil avec les compétences des collaborateurs
  const { data: collabs } = await adminClient
    .from('collaborateurs')
    .select('prenom, nom, poste, role_metier, bio, competences_cles, diplomes, certifications, experience_annees')
    .eq('organization_id', orgId)

  let text = buildProfileText(profile)

  // Ajouter la méthodologie si disponible
  if ((profile as any).profile_methodology) {
    text += `\nMéthodologie: ${(profile as any).profile_methodology}`
  }

  // Ajouter un résumé des compétences de l'équipe au texte du profil
  if (collabs && collabs.length > 0) {
    const collabTexts = collabs
      .map(c => buildCollaborateurText(c))
      .filter(t => t.length > 20)
    if (collabTexts.length > 0) {
      text += '\n\nÉquipe:\n' + collabTexts.join('\n---\n')
    }
  }

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

  // Invalider le cache des scores — ils seront recalculés dynamiquement
  // lors de la prochaine consultation (fix BUG-1 : cache jamais invalidé)
  await adminClient
    .from('tender_scores')
    .delete()
    .eq('organization_id', orgId)

  return NextResponse.json({ success: true, dimensions: embedding.length })
}
