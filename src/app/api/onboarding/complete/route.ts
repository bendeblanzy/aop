import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { callClaude } from '@/lib/ai/claude-client'
import { getEmbedding } from '@/lib/ai/embeddings'

export interface OnboardingAnswers {
  org_name: string
  raison_sociale: string
  prestations: string[]
  prestations_autre?: string
  clients: string[]
  clients_autre?: string
  modes: string[]
  modes_autre?: string
  zone: string
  differentiants: string
  valeurs: string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let answers: OnboardingAnswers
  try {
    answers = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 1. Vérifier si l'utilisateur a déjà une org
  const { data: existing } = await adminClient
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let orgId: string

  if (existing) {
    // Collaborateur d'une org existante — on met juste à jour le flag
    orgId = existing.organization_id
  } else {
    // Nouvelle org : créer l'organisation
    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .insert({ name: answers.org_name.trim() })
      .select('id')
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: orgError?.message ?? 'Erreur création org' }, { status: 500 })
    }

    orgId = org.id

    await adminClient.from('organization_members').insert({
      organization_id: orgId,
      user_id: user.id,
      role: 'admin',
    })
  }

  // 2. Synthèse Claude des 4 sections du profil
  const prestationsText = [
    ...answers.prestations,
    ...(answers.prestations_autre ? [answers.prestations_autre] : [])
  ].join(', ')

  const clientsText = [
    ...answers.clients,
    ...(answers.clients_autre ? [answers.clients_autre] : [])
  ].join(', ')

  const modesText = [
    ...answers.modes,
    ...(answers.modes_autre ? [answers.modes_autre] : [])
  ].join(', ')

  const systemPrompt = `Tu es un expert en marchés publics français.
À partir des informations fournies sur une société, tu génères une synthèse structurée de son profil pour optimiser le matching avec des appels d'offres publics.
Réponds UNIQUEMENT en JSON valide avec exactement ces 4 clés.`

  const userMessage = `Société : ${answers.raison_sociale}
Prestations : ${prestationsText}
Types de clients : ${clientsText}
Modes d'intervention : ${modesText}
Zone géographique : ${answers.zone || 'Non précisée'}
Ce qui les différencie : ${answers.differentiants}
Valeurs / façon de travailler : ${answers.valeurs}

Génère ce JSON :
{
  "coeur_metier": "Paragraphe de 3-4 phrases décrivant précisément l'activité, les prestations et les clients cibles de cette société. Doit permettre à un algorithme de matching de trouver les bons appels d'offres.",
  "philosophie_valeurs": "1-2 phrases sur les valeurs et la façon de travailler qui différencient cette société sur le plan humain.",
  "atouts_differenciants": "2-3 phrases sur les vrais atouts compétitifs — ce qui fait que cette société gagne des marchés plutôt qu'une autre.",
  "methodologie_type": "1-2 phrases sur la méthodologie d'intervention type : comment ils s'organisent, leur approche, leurs livrables habituels."
}`

  let synthesized: { coeur_metier: string; philosophie_valeurs: string; atouts_differenciants: string; methodologie_type: string }

  try {
    const raw = await callClaude(systemPrompt, userMessage, 'sonnet')
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    synthesized = JSON.parse(cleaned)
  } catch (e) {
    console.error('[onboarding] Claude synthesis error:', e)
    // Fallback : utiliser les réponses brutes
    synthesized = {
      coeur_metier: `${answers.raison_sociale} — ${prestationsText}. Clients : ${clientsText}.`,
      philosophie_valeurs: answers.valeurs,
      atouts_differenciants: answers.differentiants,
      methodologie_type: `Interventions ${modesText}.`,
    }
  }

  // 3. Générer l'embedding du profil enrichi
  const profileTextForEmbedding = [
    `Société : ${answers.raison_sociale}`,
    `Cœur de métier : ${synthesized.coeur_metier}`,
    `Atouts : ${synthesized.atouts_differenciants}`,
    `Philosophie : ${synthesized.philosophie_valeurs}`,
    `Méthodologie : ${synthesized.methodologie_type}`,
    `Zone : ${answers.zone}`,
  ].join('\n')

  let embedding: number[] = []
  try {
    embedding = await getEmbedding(profileTextForEmbedding)
  } catch (e) {
    console.error('[onboarding] embedding error:', e)
  }

  // 4. Upsert du profil
  const profilePayload: Record<string, unknown> = {
    organization_id: orgId,
    raison_sociale: answers.raison_sociale,
    activite_metier: synthesized.coeur_metier,
    positionnement: synthesized.philosophie_valeurs,
    atouts_differenciants: synthesized.atouts_differenciants,
    profile_methodology: synthesized.methodologie_type,
    prestations_types: answers.prestations,
    clients_types: answers.clients,
    intervention_modes: answers.modes,
    zone_intervention: answers.zone,
    onboarding_answers: answers,
    onboarding_completed_at: new Date().toISOString(),
    ...(embedding.length > 0 ? {
      embedding: JSON.stringify(embedding),
      embedding_updated_at: new Date().toISOString(),
    } : {}),
  }

  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'organization_id' })

  if (profileError) {
    console.error('[onboarding] profile upsert error:', profileError.message)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // 5. Invalider les scores cachés si existants
  await adminClient.from('tender_scores').delete().eq('organization_id', orgId)

  // 6. Marquer l'onboarding comme complété dans les métadonnées utilisateur
  await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, onboarding_completed: true },
  })

  return NextResponse.json({ success: true, org_id: orgId, synthesis: synthesized })
}
