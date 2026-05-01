import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { getEmbedding } from '@/lib/ai/embeddings'

/**
 * POST /api/onboarding/finalize
 * Appelé à la dernière étape du wizard.
 * - Génère l'embedding vectoriel du profil complet
 * - Invalide les scores en cache
 * - Marque onboarding_completed = true dans les métadonnées utilisateur
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // Récupérer le profil complet pour construire le texte d'embedding
  const { data: profile } = await adminClient
    .from('profiles')
    .select('raison_sociale, activite_metier, positionnement, atouts_differenciants, methodologie_type, domaines_competence, certifications, exclusions_globales, prestations_types, clients_types, zone_intervention')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })
  }

  // Construire le texte pour l'embedding (même logique que onboarding/complete)
  const parts: string[] = []
  if (profile.raison_sociale) parts.push(`Société : ${profile.raison_sociale}`)
  if (profile.activite_metier) parts.push(`Cœur de métier : ${profile.activite_metier}`)
  if (profile.atouts_differenciants) parts.push(`Atouts : ${profile.atouts_differenciants}`)
  if (profile.positionnement) parts.push(`Positionnement : ${profile.positionnement}`)
  if (profile.methodologie_type) parts.push(`Méthodologie : ${profile.methodologie_type}`)
  if (Array.isArray(profile.domaines_competence) && profile.domaines_competence.length > 0) {
    parts.push(`Domaines : ${profile.domaines_competence.join(', ')}`)
  }
  if (Array.isArray(profile.certifications) && profile.certifications.length > 0) {
    parts.push(`Certifications : ${profile.certifications.join(', ')}`)
  }
  if (Array.isArray(profile.exclusions_globales) && profile.exclusions_globales.length > 0) {
    parts.push(`Hors-périmètre : ${profile.exclusions_globales.join(', ')}`)
  }
  if (Array.isArray(profile.prestations_types) && profile.prestations_types.length > 0) {
    parts.push(`Prestations : ${profile.prestations_types.join(', ')}`)
  }
  if (Array.isArray(profile.clients_types) && profile.clients_types.length > 0) {
    parts.push(`Clients : ${profile.clients_types.join(', ')}`)
  }
  if (profile.zone_intervention) parts.push(`Zone : ${profile.zone_intervention}`)

  const profileText = parts.join('\n')

  // Générer l'embedding
  let embedding: number[] = []
  try {
    embedding = await getEmbedding(profileText)
  } catch (e) {
    console.error('[finalize] embedding error:', e)
  }

  // Mettre à jour le profil avec l'embedding
  const updatePayload: Record<string, unknown> = {
    onboarding_completed_at: new Date().toISOString(),
  }
  if (embedding.length > 0) {
    updatePayload.embedding = JSON.stringify(embedding)
    updatePayload.embedding_updated_at = new Date().toISOString()
  }

  await adminClient
    .from('profiles')
    .update(updatePayload)
    .eq('organization_id', orgId)

  // Invalider les scores en cache
  await adminClient.from('tender_scores').delete().eq('organization_id', orgId)

  // Marquer onboarding complété dans les métadonnées auth
  await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, onboarding_completed: true },
  })

  return NextResponse.json({ success: true })
}
