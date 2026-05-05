import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { callClaude } from '@/lib/ai/claude-client'

/**
 * POST /api/profil/deep-research
 * Deep Research : analyse le profil existant + le nom de l'entreprise
 * pour générer un positionnement structuré et détaillé.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // Récupérer le profil actuel
  const { data: profile } = await adminClient
    .from('profiles')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'Profil non trouvé' }, { status: 404 })

  // Récupérer les collaborateurs pour enrichir
  const { data: collabs } = await adminClient
    .from('collaborateurs')
    .select('nom, prenom, poste, role_metier, competences_cles, experience_annees')
    .eq('organization_id', orgId)

  // Récupérer les références existantes
  const { data: refs } = await adminClient
    .from('references')
    .select('titre, client, domaine, description, annee, montant')
    .eq('organization_id', orgId)
    .order('annee', { ascending: false })
    .limit(10)

  const contextParts: string[] = []
  contextParts.push(`Raison sociale : ${profile.raison_sociale || '(non renseigné)'}`)
  if (profile.code_naf) contextParts.push(`Code NAF : ${profile.code_naf}`)
  if (profile.forme_juridique) contextParts.push(`Forme juridique : ${profile.forme_juridique}`)
  if (profile.effectif_moyen) contextParts.push(`Effectif : ${profile.effectif_moyen} personnes`)
  if (profile.domaines_competence?.length) contextParts.push(`Domaines déclarés : ${profile.domaines_competence.join(', ')}`)
  if (profile.certifications?.length) contextParts.push(`Certifications : ${profile.certifications.join(', ')}`)
  if (profile.moyens_techniques) contextParts.push(`Moyens techniques : ${profile.moyens_techniques}`)
  if (profile.activite_metier) contextParts.push(`Activité métier actuelle : ${profile.activite_metier}`)
  if (profile.positionnement) contextParts.push(`Positionnement actuel : ${profile.positionnement}`)
  if (profile.atouts_differenciants) contextParts.push(`Atouts actuels : ${profile.atouts_differenciants}`)
  if (profile.methodologie_type) contextParts.push(`Méthodologie actuelle : ${profile.methodologie_type}`)

  if (collabs && collabs.length > 0) {
    contextParts.push(`\nÉquipe (${collabs.length} collaborateurs) :`)
    for (const c of collabs) {
      const parts = [`${c.prenom} ${c.nom}`]
      if (c.poste) parts.push(c.poste)
      if (c.role_metier) parts.push(`(${c.role_metier})`)
      if (c.experience_annees) parts.push(`${c.experience_annees} ans d'exp.`)
      if (c.competences_cles?.length) parts.push(`— ${c.competences_cles.join(', ')}`)
      contextParts.push(`  - ${parts.join(' ')}`)
    }
  }

  if (refs && refs.length > 0) {
    contextParts.push(`\nRéférences récentes (${refs.length}) :`)
    for (const r of refs) {
      contextParts.push(`  - ${r.titre} (${r.client}${r.annee ? `, ${r.annee}` : ''}${r.montant ? `, ${r.montant.toLocaleString('fr-FR')}€` : ''})${r.description ? ` — ${r.description.slice(0, 150)}` : ''}`)
    }
  }

  const systemPrompt = `Tu es un consultant expert en stratégie d'entreprise et en réponse aux appels d'offres publics français.

À partir des informations fournies sur une entreprise, tu dois produire un positionnement stratégique structuré, précis et différenciant.

IMPORTANT :
- Ne pas inventer de faits, te baser uniquement sur les informations fournies
- Si l'entreprise mentionne des activités, ne les élargir que si c'est cohérent
- Être très précis et concret, pas de phrases creuses ou génériques
- Écrire à la première personne du pluriel ("Nous...")
- Format : texte fluide, pas de listes à puces
- **Si les informations sont trop minces pour remplir un champ, mets une chaîne vide ("") plutôt qu'un commentaire ou une explication.**

**Tu DOIS répondre UNIQUEMENT par un objet JSON valide, sans aucun texte avant ni après, sans backticks markdown.** Pas de phrase d'intro ("Je n'ai pas...", "D'après les infos..."). Si tu manques d'info, renvoie quand même le JSON avec les champs vides.

Format JSON exact :
{
  "activite_metier": "Description précise de l'activité cœur de métier (200-400 caractères). Ne mentionner QUE les activités réellement exercées.",
  "positionnement": "Philosophie, valeurs et positionnement stratégique (300-500 caractères). Ce qui guide l'approche de l'entreprise.",
  "atouts_differenciants": "Ce qui distingue concrètement l'entreprise de ses concurrents (200-400 caractères). Expertise rare, ancienneté, réseau, méthodologie propre.",
  "methodologie_type": "Les grandes étapes de l'approche projet type (300-500 caractères). La trame méthodologique habituelle."
}`

  const userMessage = `Voici les informations sur l'entreprise :\n\n${contextParts.join('\n')}`

  try {
    const raw = await callClaude(systemPrompt, userMessage, 'sonnet')

    // Parser robuste : Claude peut renvoyer le JSON entouré de backticks markdown,
    // ou parfois précédé d'une phrase d'intro malgré la consigne. On tente :
    //   1. Extraire ```json … ``` ou ``` … ```
    //   2. Sinon extraire le premier objet { … } délimité
    //   3. Sinon parser le texte brut nettoyé
    function extractJsonBlock(text: string): string | null {
      const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i)
      if (fenced) return fenced[1].trim()
      const objStart = text.indexOf('{')
      const objEnd = text.lastIndexOf('}')
      if (objStart >= 0 && objEnd > objStart) return text.slice(objStart, objEnd + 1)
      return null
    }

    let result: Record<string, unknown> = {}
    try {
      const candidate = extractJsonBlock(raw) ?? raw.trim()
      result = JSON.parse(candidate)
    } catch (parseErr) {
      // Fallback gracieux : on retourne 200 avec champs vides + un warn pour
      // que l'utilisateur puisse continuer le wizard sans être bloqué.
      // Mieux vaut un wizard qui avance avec des champs vides à compléter à
      // la main qu'un 500 qui bloque tout (cf. cas d'un nouveau profil avec
      // peu d'info où Claude refuse de répondre en JSON).
      console.warn('[deep-research] JSON parse failed, returning empty fields. Raw:', raw.slice(0, 300))
      return NextResponse.json({
        activite_metier: '',
        positionnement: '',
        atouts_differenciants: '',
        methodologie_type: '',
        warning: "L'IA n'a pas pu générer un positionnement automatique (informations insuffisantes). Remplis les champs manuellement.",
      })
    }

    return NextResponse.json({
      activite_metier: typeof result.activite_metier === 'string' ? result.activite_metier : '',
      positionnement: typeof result.positionnement === 'string' ? result.positionnement : '',
      atouts_differenciants: typeof result.atouts_differenciants === 'string' ? result.atouts_differenciants : '',
      methodologie_type: typeof result.methodologie_type === 'string' ? result.methodologie_type : '',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[deep-research] error:', msg)
    return NextResponse.json({ error: `Erreur Deep Research : ${msg}` }, { status: 500 })
  }
}
