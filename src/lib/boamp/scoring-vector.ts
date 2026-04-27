import { adminClient } from '@/lib/supabase/admin'
import { getEmbedding, buildProfileText, cosineSimilarity, simToScore, type PrestationDetail } from '@/lib/ai/embeddings'
import { callClaude } from '@/lib/ai/claude-client'

export interface VectorScoreResult {
  idweb: string
  score: number          // 0-100
  similarity: number     // 0-1 cosine similarity
  raison: string
}

/**
 * Construit le contexte profil enrichi pour le Tier 2 Claude.
 * Utilise les sections synthétisées par l'onboarding + le détail
 * spécificité/exclusions par prestation si disponible.
 */
function buildRichProfileContext(profile: {
  raison_sociale?: string | null
  activite_metier?: string | null
  positionnement?: string | null
  atouts_differenciants?: string | null
  profile_methodology?: string | null
  zone_intervention?: string | null
  prestations_types?: string[] | null
  prestations_detail?: PrestationDetail[] | null
  exclusions_globales?: string[] | null
  clients_types?: string[] | null
}): string {
  const parts: string[] = []
  if (profile.raison_sociale) parts.push(`Société : ${profile.raison_sociale}`)
  if (profile.activite_metier) parts.push(`Cœur de métier : ${profile.activite_metier}`)
  if (profile.atouts_differenciants) parts.push(`Atouts différenciants : ${profile.atouts_differenciants}`)
  if (profile.positionnement) parts.push(`Philosophie & valeurs : ${profile.positionnement}`)
  if (profile.profile_methodology) parts.push(`Méthodologie : ${profile.profile_methodology}`)

  if (profile.prestations_detail?.length) {
    const lines: string[] = []
    for (const p of profile.prestations_detail) {
      if (!p.type) continue
      const positive = p.specificity?.trim()
        ? `${p.type} (spécifiquement : ${p.specificity.trim()})`
        : p.type
      const negative = p.exclusions && p.exclusions.length > 0
        ? ` — ne fait PAS : ${p.exclusions.join(', ')}`
        : ''
      lines.push(`  - ${positive}${negative}`)
    }
    if (lines.length > 0) parts.push(`Prestations détaillées :\n${lines.join('\n')}`)
  } else if (profile.prestations_types?.length) {
    parts.push(`Types de prestations : ${profile.prestations_types.join(', ')}`)
  }

  if (profile.exclusions_globales?.length) {
    parts.push(`SECTEURS / SUJETS REFUSÉS : ${profile.exclusions_globales.join(', ')}`)
  }

  if (profile.clients_types?.length) parts.push(`Clients habituels : ${profile.clients_types.join(', ')}`)
  if (profile.zone_intervention) parts.push(`Zone d'intervention : ${profile.zone_intervention}`)
  return parts.join('\n')
}

/**
 * Scoring hybride Tier 1 + Tier 2
 *
 * Tier 1 (vectoriel, instantané) :
 *   Compare l'embedding du profil avec les embeddings des tenders.
 *   Retourne un score de similarité normalisé 0-100.
 *
 * Tier 2 (Claude Sonnet 4.6, seulement pour les top résultats) :
 *   Pour les tenders avec un score vectoriel >= seuil,
 *   Claude affine le score et génère une explication qualitative.
 *   Utilise le profil synthétisé complet (4 sections onboarding).
 */
export async function scoreWithVectors(
  orgId: string,
  idwebs: string[],
  options: { claudeThreshold?: number; activiteMetier?: string } = {}
): Promise<VectorScoreResult[]> {
  const claudeThreshold = options.claudeThreshold ?? 40

  // 1. Récupérer le profil complet (toutes les sections synthétisées + détail prestations)
  const { data: profile } = await adminClient
    .from('profiles')
    .select('embedding, activite_metier, raison_sociale, domaines_competence, certifications, positionnement, atouts_differenciants, moyens_techniques, profile_methodology, zone_intervention, prestations_types, prestations_detail, exclusions_globales, clients_types')
    .eq('organization_id', orgId)
    .maybeSingle()

  const activiteMetier = options.activiteMetier || profile?.activite_metier || ''

  // Si pas de profil métier, score neutre
  if (!activiteMetier.trim()) {
    return idwebs.map(id => ({ idweb: id, score: 50, similarity: 0.5, raison: 'Profil métier non renseigné.' }))
  }

  // 2. Obtenir ou calculer l'embedding du profil
  let profileEmbedding: number[]
  if (profile?.embedding) {
    profileEmbedding = typeof profile.embedding === 'string'
      ? JSON.parse(profile.embedding)
      : profile.embedding
  } else {
    // Fallback : recalcul à partir du profil enrichi
    const profileText = buildProfileText(profile || { activite_metier: activiteMetier })
    profileEmbedding = await getEmbedding(profileText)
    if (profileEmbedding.length > 0) {
      await adminClient
        .from('profiles')
        .update({
          embedding: JSON.stringify(profileEmbedding),
          embedding_updated_at: new Date().toISOString(),
        })
        .eq('organization_id', orgId)
    }
  }

  if (profileEmbedding.length === 0) {
    return idwebs.map(id => ({ idweb: id, score: 50, similarity: 0.5, raison: 'Erreur calcul embedding profil.' }))
  }

  // 3. Tier 1 — Scoring vectoriel côté JS
  const { data: tenders } = await adminClient
    .from('tenders')
    .select('idweb, objet, embedding, description_detail, short_summary, nomacheteur, descripteur_libelles, valeur_estimee, duree_mois')
    .in('idweb', idwebs)

  if (!tenders || tenders.length === 0) {
    return idwebs.map(id => ({ idweb: id, score: 50, similarity: 0.5, raison: 'Tender introuvable.' }))
  }

  const results: VectorScoreResult[] = tenders.map(t => {
    if (!t.embedding) {
      return { idweb: t.idweb, score: 50, similarity: 0.5, raison: 'Embedding en cours de calcul.' }
    }
    const tenderEmb: number[] = typeof t.embedding === 'string'
      ? JSON.parse(t.embedding)
      : t.embedding
    const sim = cosineSimilarity(profileEmbedding, tenderEmb)
    const score = simToScore(sim)
    return {
      idweb: t.idweb,
      score,
      similarity: Math.round(sim * 1000) / 1000,
      raison: '',
    }
  })

  // Ajouter les tenders manquants
  const foundIdwebs = new Set(results.map(r => r.idweb))
  for (const id of idwebs) {
    if (!foundIdwebs.has(id)) {
      results.push({ idweb: id, score: 50, similarity: 0.5, raison: 'Tender introuvable.' })
    }
  }

  // 4. Tier 2 — Claude Sonnet 4.6 : score affiné + explication qualitative
  //    Toujours appliqué aux top 20 par score vectoriel, sans seuil minimum.
  //    Le Tier 1 est un pré-filtre de tri, pas un filtre d'exclusion.
  //    (~$0.06/appel max pour 20 tenders)
  const TOP_TIER2 = 20
  const needsReason = results
    .filter(r => !r.raison)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_TIER2)

  if (needsReason.length > 0) {
    const richContext = buildRichProfileContext(profile || { activite_metier: activiteMetier })

    const tendersForClaude = needsReason.map(r => {
      const t = tenders.find(x => x.idweb === r.idweb)
      return {
        idweb: r.idweb,
        score_vectoriel: r.score,
        objet: t?.objet ?? '',
        description: (t?.description_detail || t?.short_summary || '').slice(0, 600),
        acheteur: t?.nomacheteur ?? '',
        descripteurs: (t?.descripteur_libelles || []).join(', '),
        valeur: t?.valeur_estimee ? `${t.valeur_estimee.toLocaleString('fr-FR')} €` : '',
        duree: t?.duree_mois ? `${t.duree_mois} mois` : '',
      }
    })

    try {
      const raw = await callClaude(
        `Tu es votre spécialiste Appels d'Offre, expert en marchés publics français.
Ta mission : évaluer la pertinence de chaque appel d'offres pour cette société spécifique.

Pour chaque annonce :
- Affine le score vectoriel (0-100) en tenant compte du profil complet de la société
- Rédige UNE phrase courte (max 130 caractères) expliquant concrètement pourquoi ça matche ou non

Critères :
- 80-100 : Cœur de métier exact (spécificité respectée), la société peut clairement gagner
- 60-79  : Bonne correspondance, candidature pertinente
- 40-59  : Correspondance partielle, à étudier
- 20-39  : En dehors du périmètre habituel
- 0-19   : Hors sujet OU appartient aux EXCLUSIONS du profil (refus explicite)

RÈGLES IMPÉRATIVES :
- Si l'AO porte sur une "exclusion" déclarée du profil (ex: vidéo classique alors que la société fait
  uniquement vidéo IA), le score MAX est 25, peu importe le score vectoriel.
- Si l'AO porte sur un "secteur refusé" global (exclusions_globales), le score MAX est 15.
- Si l'AO matche la SPÉCIFICITÉ exacte de la prestation (ex: vidéo IA alors que la société est sur
  vidéo IA), boost minimum de +10 points par rapport au score vectoriel.

Réponds UNIQUEMENT en JSON valide : [{"idweb":"...", "score": 75, "raison": "..."}]`,
        `PROFIL DE LA SOCIÉTÉ :\n${richContext}\n\nAPPELS D'OFFRES À ÉVALUER :\n${JSON.stringify(tendersForClaude)}`,
        'sonnet'
      )

      const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
      const parsed = JSON.parse(cleaned) as { idweb: string; score: number; raison: string }[]

      for (const p of parsed) {
        const r = results.find(x => x.idweb === p.idweb)
        if (r) {
          // Le score Claude affine le score vectoriel
          r.score = Math.max(0, Math.min(100, Math.round(Number(p.score) || r.score)))
          r.raison = String(p.raison || '').slice(0, 200)
        }
      }
    } catch (e) {
      console.error('[scoring-vector] Tier 2 Claude Sonnet error:', e)
    }
  }

  // Raisons par défaut pour les tenders non traités par Tier 2
  for (const r of results) {
    if (!r.raison) {
      if (r.score >= 70) r.raison = 'Forte correspondance avec votre activité.'
      else if (r.score >= 40) r.raison = 'Correspondance partielle, à étudier.'
      else r.raison = 'Faible correspondance avec votre profil.'
    }
  }

  return results
}
