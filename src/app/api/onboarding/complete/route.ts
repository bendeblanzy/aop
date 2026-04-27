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
  /** Précisions par prestation (ex: "vidéo IA générative uniquement"). */
  prestations_specificites?: string
  /** Sujets/secteurs explicitement refusés (texte libre). */
  exclusions_libres?: string
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

POINT CRITIQUE — La spécificité métier est ce qui distingue cette société d'un concurrent générique.
Tu dois IMPÉRATIVEMENT inférer, pour chaque prestation cochée :
- la spécificité (ce qui rend cette société unique sur cette prestation, ex: "vidéo générée par IA" plutôt que juste "vidéo")
- les exclusions (ce que cette société NE FAIT PAS dans cette catégorie, ex: pour une boîte vidéo IA = "captation événementielle, tournage classique, mariage")

Sans spécificité ni exclusions, le matching ramènera des AO trop génériques.

Réponds UNIQUEMENT en JSON valide avec EXACTEMENT les clés demandées.`

  // Champs explicites optionnels (étape 7 de l'onboarding) — quand fournis, ils
  // priment sur l'inférence de Claude pour spécificités et exclusions.
  const specificitesUser = (answers.prestations_specificites || '').trim()
  const exclusionsUser = (answers.exclusions_libres || '').trim()

  const userMessage = `Société : ${answers.raison_sociale}
Prestations cochées : ${prestationsText}
Types de clients : ${clientsText}
Modes d'intervention : ${modesText}
Zone géographique : ${answers.zone || 'Non précisée'}
Ce qui les différencie : ${answers.differentiants}
Valeurs / façon de travailler : ${answers.valeurs}
${specificitesUser ? `\nSPÉCIFICITÉS DÉCLARÉES PAR L'UTILISATEUR (à utiliser tel quel pour produire prestations_detail.specificity) :\n${specificitesUser}` : ''}
${exclusionsUser ? `\nEXCLUSIONS DÉCLARÉES PAR L'UTILISATEUR (à utiliser tel quel pour exclusions_globales et prestations_detail.exclusions) :\n${exclusionsUser}` : ''}

Génère ce JSON (toutes les clés sont OBLIGATOIRES) :
{
  "coeur_metier": "Paragraphe de 3-4 phrases décrivant précisément l'activité, les prestations et les clients cibles. Doit permettre à un algorithme de matching de trouver les bons appels d'offres.",
  "philosophie_valeurs": "1-2 phrases sur les valeurs et la façon de travailler qui différencient cette société sur le plan humain.",
  "atouts_differenciants": "2-3 phrases sur les vrais atouts compétitifs — ce qui fait que cette société gagne des marchés plutôt qu'une autre.",
  "methodologie_type": "1-2 phrases sur la méthodologie d'intervention type : comment ils s'organisent, leur approche, leurs livrables habituels.",
  "prestations_detail": [
    {
      "type": "<id de la prestation, identique à ceux cochés ci-dessus>",
      "specificity": "Ce qui distingue cette société sur cette prestation. PAS générique. Si pas inférable, mets une chaîne vide.",
      "exclusions": ["liste de prestations apparentées que la société NE FAIT PAS dans ce domaine. Ex: si vidéo+IA, alors exclusions: ['captation événementielle','tournage classique','mariage']. Si rien ne ressort clairement, mets un tableau vide."]
    }
  ],
  "exclusions_globales": ["liste plate des secteurs/sujets que la société refuse transversalement (ex: 'BTP', 'armement', 'religieux'). Tableau vide si rien ne ressort."]
}`

  interface SynthesizedProfile {
    coeur_metier: string
    philosophie_valeurs: string
    atouts_differenciants: string
    methodologie_type: string
    prestations_detail: { type: string; specificity?: string; exclusions?: string[] }[]
    exclusions_globales: string[]
  }

  let synthesized: SynthesizedProfile

  try {
    const raw = await callClaude(systemPrompt, userMessage, 'sonnet')
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    synthesized = {
      coeur_metier: String(parsed.coeur_metier ?? ''),
      philosophie_valeurs: String(parsed.philosophie_valeurs ?? ''),
      atouts_differenciants: String(parsed.atouts_differenciants ?? ''),
      methodologie_type: String(parsed.methodologie_type ?? ''),
      prestations_detail: Array.isArray(parsed.prestations_detail)
        ? parsed.prestations_detail
            .filter((p: any) => p && typeof p.type === 'string')
            .map((p: any) => ({
              type: p.type,
              specificity: typeof p.specificity === 'string' ? p.specificity : '',
              exclusions: Array.isArray(p.exclusions)
                ? p.exclusions.filter((e: any) => typeof e === 'string')
                : [],
            }))
        : [],
      exclusions_globales: Array.isArray(parsed.exclusions_globales)
        ? parsed.exclusions_globales.filter((e: any) => typeof e === 'string')
        : [],
    }
  } catch (e) {
    console.error('[onboarding] Claude synthesis error:', e)
    // Fallback : utiliser les réponses brutes (sans spécificité/exclusions)
    synthesized = {
      coeur_metier: `${answers.raison_sociale} — ${prestationsText}. Clients : ${clientsText}.`,
      philosophie_valeurs: answers.valeurs,
      atouts_differenciants: answers.differentiants,
      methodologie_type: `Interventions ${modesText}.`,
      prestations_detail: answers.prestations.map(t => ({ type: t, specificity: '', exclusions: [] })),
      exclusions_globales: [],
    }
  }

  // 3. Générer l'embedding du profil enrichi
  // IMPORTANT : on inclut le DÉTAIL prestations (specificity + exclusions) en
  // contraste positif/négatif. C'est ce qui rapproche les bons AO et éloigne
  // les mauvais ("vidéo IA" plutôt que "vidéo en général").
  const prestationsDetailText = synthesized.prestations_detail.map(p => {
    const positive = p.specificity?.trim() ? `${p.type} — ${p.specificity.trim()}` : p.type
    const negative = p.exclusions && p.exclusions.length > 0
      ? `. Refuse : ${p.exclusions.join(', ')}`
      : ''
    return `• Spécialiste de : ${positive}${negative}`
  }).join('\n')

  const exclusionsText = synthesized.exclusions_globales.length > 0
    ? `Hors-périmètre (refusé) : ${synthesized.exclusions_globales.join(', ')}`
    : ''

  const profileTextForEmbedding = [
    `Société : ${answers.raison_sociale}`,
    `Cœur de métier : ${synthesized.coeur_metier}`,
    `Atouts : ${synthesized.atouts_differenciants}`,
    `Philosophie : ${synthesized.philosophie_valeurs}`,
    `Méthodologie : ${synthesized.methodologie_type}`,
    prestationsDetailText ? `Prestations détaillées :\n${prestationsDetailText}` :
      (prestationsText ? `Prestations : ${prestationsText}` : ''),
    exclusionsText,
    clientsText ? `Clients : ${clientsText}` : '',
    modesText ? `Modes : ${modesText}` : '',
    answers.zone ? `Zone : ${answers.zone}` : '',
  ].filter(Boolean).join('\n')

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
    prestations_detail: synthesized.prestations_detail,
    exclusions_globales: synthesized.exclusions_globales,
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
