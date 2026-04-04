import { callClaude } from '@/lib/ai/claude-client'
import type { Tender } from './types'

export interface ScoreResult {
  idweb: string
  score: number
  raison: string
}

/**
 * Score un lot de tenders (max 20) contre le profil métier de l'organisation.
 * Utilise Claude Haiku en un seul appel pour tout le lot.
 */
export async function scoreTenders(
  tenders: Tender[],
  activiteMetier: string
): Promise<ScoreResult[]> {
  if (tenders.length === 0) return []
  if (!activiteMetier.trim()) {
    // Sans profil métier, on ne peut pas scorer → score neutre
    return tenders.map(t => ({ idweb: t.idweb, score: 50, raison: 'Profil métier non renseigné.' }))
  }

  const tendersPayload = tenders.map(t => ({
    idweb: t.idweb,
    objet: t.objet ?? '(sans titre)',
    acheteur: t.nomacheteur ?? '',
    descripteurs: t.descripteur_libelles.join(', '),
    description: t.description_detail ? t.description_detail.slice(0, 500) : '',
    valeur: t.valeur_estimee ? `${t.valeur_estimee.toLocaleString('fr-FR')} €` : '',
    duree: t.duree_mois ? `${t.duree_mois} mois` : '',
  }))

  const systemPrompt = `Tu es un expert en marchés publics français.
Ta mission : évaluer la pertinence d'annonces BOAMP pour une entreprise donnée.

Critères de scoring (0-100) :
- 80-100 : L'annonce est clairement dans le cœur de métier de l'entreprise
- 60-79  : L'annonce est pertinente, l'entreprise peut candidater
- 40-59  : L'annonce est tangentielle, réponse possible mais pas optimale
- 20-39  : L'annonce est en dehors du périmètre habituel
- 0-19   : Hors sujet, l'entreprise n'a aucun intérêt à répondre

Réponds UNIQUEMENT en JSON valide, sans commentaire ni markdown, avec ce format exact :
[{"idweb":"...", "score": 75, "raison": "Phrase courte (max 120 caractères) expliquant le score"}]`

  const userMessage = `Profil métier de l'entreprise :
${activiteMetier}

Annonces BOAMP à évaluer :
${JSON.stringify(tendersPayload, null, 2)}`

  let raw: string
  try {
    raw = await callClaude(systemPrompt, userMessage, 'haiku')
  } catch (e) {
    console.error('[scoring] callClaude error:', e)
    return tenders.map(t => ({ idweb: t.idweb, score: 50, raison: 'Erreur lors du scoring IA.' }))
  }

  // Parser le JSON — Claude peut parfois entourer de backticks
  let parsed: ScoreResult[]
  try {
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) throw new Error('Not an array')
  } catch (e) {
    console.error('[scoring] JSON parse error:', e, 'raw:', raw.slice(0, 200))
    return tenders.map(t => ({ idweb: t.idweb, score: 50, raison: 'Réponse IA invalide.' }))
  }

  // Valider et nettoyer chaque résultat
  return tenders.map(t => {
    const found = parsed.find(r => r.idweb === t.idweb)
    if (!found) return { idweb: t.idweb, score: 50, raison: 'Non évalué.' }
    return {
      idweb: t.idweb,
      score: Math.max(0, Math.min(100, Math.round(Number(found.score) || 50))),
      raison: String(found.raison ?? '').slice(0, 200),
    }
  })
}
