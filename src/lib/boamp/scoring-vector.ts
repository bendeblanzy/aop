import { adminClient } from '@/lib/supabase/admin'
import { getEmbedding, buildProfileText, cosineSimilarity, simToScore } from '@/lib/ai/embeddings'
import { callClaude } from '@/lib/ai/claude-client'

export interface VectorScoreResult {
  idweb: string
  score: number          // 0-100
  similarity: number     // 0-1 cosine similarity
  raison: string
}

// simToScore et cosineSimilarity sont importés depuis @/lib/ai/embeddings (shared)

/**
 * Scoring hybride Tier 1 + Tier 2
 *
 * Tier 1 (vectoriel, instantané) :
 *   Compare l'embedding du profil avec les embeddings des tenders.
 *   Retourne un score de similarité normalisé 0-100.
 *
 * Tier 2 (Claude Haiku, seulement pour les top résultats) :
 *   Pour les tenders avec un score vectoriel >= seuil,
 *   demande à Claude une raison textuelle détaillée.
 */
export async function scoreWithVectors(
  orgId: string,
  idwebs: string[],
  options: { claudeThreshold?: number; activiteMetier?: string } = {}
): Promise<VectorScoreResult[]> {
  const claudeThreshold = options.claudeThreshold ?? 40

  // 1. Récupérer le profil et son embedding
  const { data: profile } = await adminClient
    .from('profiles')
    .select('embedding, activite_metier, raison_sociale, domaines_competence, certifications, positionnement, atouts_differenciants, moyens_techniques')
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
    // Parsing du vector Supabase (format string "[0.1,0.2,...]")
    profileEmbedding = typeof profile.embedding === 'string'
      ? JSON.parse(profile.embedding)
      : profile.embedding
  } else {
    // Calculer et persister l'embedding du profil
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

  // 3. Tier 1 — Scoring vectoriel via la fonction SQL match_tenders_by_embedding
  //    ou bien calcul côté JS si les tenders n'ont pas tous d'embedding
  const { data: tenders } = await adminClient
    .from('tenders')
    .select('idweb, objet, embedding, description_detail, short_summary, nomacheteur, descripteur_libelles')
    .in('idweb', idwebs)

  if (!tenders || tenders.length === 0) {
    return idwebs.map(id => ({ idweb: id, score: 50, similarity: 0.5, raison: 'Tender introuvable.' }))
  }

  // Calcul de similarité cosinus côté JS
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
      raison: '', // sera rempli par Tier 2 si score >= seuil
    }
  })

  // Ajouter les tenders manquants (pas en DB)
  const foundIdwebs = new Set(results.map(r => r.idweb))
  for (const id of idwebs) {
    if (!foundIdwebs.has(id)) {
      results.push({ idweb: id, score: 50, similarity: 0.5, raison: 'Tender introuvable.' })
    }
  }

  // 4. Tier 2 — Claude Haiku pour les raisons des top résultats
  const needsReason = results.filter(r => r.score >= claudeThreshold && !r.raison)
  if (needsReason.length > 0 && activiteMetier.trim()) {
    const tendersForClaude = needsReason.map(r => {
      const t = tenders.find(x => x.idweb === r.idweb)
      return {
        idweb: r.idweb,
        score_vectoriel: r.score,
        objet: t?.objet ?? '',
        description: (t?.description_detail || t?.short_summary || '').slice(0, 400),
        acheteur: t?.nomacheteur ?? '',
        descripteurs: (t?.descripteur_libelles || []).join(', '),
      }
    })

    try {
      const raw = await callClaude(
        `Tu es un expert en marchés publics. Pour chaque annonce, rédige UNE phrase (max 120 caractères) expliquant pourquoi elle correspond (ou pas) au profil de l'entreprise. Le score vectoriel est déjà calculé, concentre-toi sur la raison qualitative.
Réponds UNIQUEMENT en JSON valide : [{"idweb":"...", "raison": "..."}]`,
        `Profil : ${activiteMetier}\n\nAnnonces :\n${JSON.stringify(tendersForClaude)}`,
        'haiku'
      )

      const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
      const parsed = JSON.parse(cleaned) as { idweb: string; raison: string }[]

      for (const p of parsed) {
        const r = results.find(x => x.idweb === p.idweb)
        if (r) r.raison = String(p.raison || '').slice(0, 200)
      }
    } catch (e) {
      console.error('[scoring-vector] Tier 2 Claude error:', e)
    }
  }

  // Raisons par défaut pour ceux qui n'en ont pas
  for (const r of results) {
    if (!r.raison) {
      if (r.score >= 70) r.raison = 'Forte correspondance avec votre activité.'
      else if (r.score >= 40) r.raison = 'Correspondance partielle.'
      else r.raison = 'Faible correspondance avec votre profil.'
    }
  }

  return results
}

// cosineSimilarity est importé depuis @/lib/ai/embeddings
