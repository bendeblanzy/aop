import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MODEL = 'text-embedding-3-small' // 1536 dimensions, très rapide, ~$0.02/1M tokens

// ── Constantes de normalisation du score ─────────────────────────────────────
// La similarité cosinus entre embeddings text-embedding-3-small en français
// se distribue typiquement entre 0.10 (hors sujet) et 0.65 (très proche).
// On normalise sur la plage [SIMILARITY_MIN, SIMILARITY_MAX] puis on applique
// une courbe de puissance pour être SÉVÈRE sur les scores moyens et réserver
// les scores ≥ 80 aux correspondances vraiment fortes.
export const SIMILARITY_MIN = 0.22
export const SIMILARITY_MAX = 0.72

// Exposant de la courbe de scoring.
// > 1 → plus sévère (creuse les scores moyens). 1.0 = linéaire.
// Avec 1.6 : sim=0.40 (50% normalisé) → score ~33 (au lieu de 50).
export const SCORE_CURVE_EXPONENT = 1.6

/**
 * Convertit une similarité cosinus (0-1) en score 0-100.
 * Mapping non-linéaire (courbe puissance) : durcit le scoring au milieu
 * pour éviter les faux "60-80%" sur des correspondances tièdes.
 *
 * Exemples :
 *   sim=0.22 → 0   (seuil plancher)
 *   sim=0.35 → 11
 *   sim=0.45 → 29
 *   sim=0.55 → 51
 *   sim=0.65 → 77
 *   sim=0.72 → 100 (seuil plafond, correspondance forte)
 */
export function simToScore(sim: number): number {
  const normalized = (sim - SIMILARITY_MIN) / (SIMILARITY_MAX - SIMILARITY_MIN)
  const clamped = Math.max(0, Math.min(1, normalized))
  const curved = Math.pow(clamped, SCORE_CURVE_EXPONENT)
  return Math.max(0, Math.min(100, Math.round(curved * 100)))
}

/**
 * Calcul de similarité cosinus entre deux vecteurs.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dotProduct = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dotProduct / denom
}

/**
 * Génère un embedding pour un texte donné.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  // Nettoyer et tronquer à ~8000 tokens (~32000 chars)
  const clean = text.replace(/\n+/g, ' ').trim().slice(0, 32000)
  if (!clean) return []

  const response = await openai.embeddings.create({
    model: MODEL,
    input: clean,
  })

  return response.data[0].embedding
}

/**
 * Génère des embeddings en batch (max 2048 inputs par appel OpenAI).
 * Retourne un tableau d'embeddings dans le même ordre que les inputs.
 */
export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  // Nettoyer
  const cleaned = texts.map(t => t.replace(/\n+/g, ' ').trim().slice(0, 32000))

  // OpenAI accepte jusqu'à 2048 inputs par batch
  const BATCH_SIZE = 2048
  const results: number[][] = []

  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    const batch = cleaned.slice(i, i + BATCH_SIZE)
    const response = await openai.embeddings.create({
      model: MODEL,
      input: batch,
    })
    // Les résultats sont triés par index
    const sorted = response.data.sort((a, b) => a.index - b.index)
    results.push(...sorted.map(d => d.embedding))
  }

  return results
}

/**
 * Construit le texte à embedder pour un tender.
 * Combine les champs pertinents pour un matching sémantique optimal.
 */
export function buildTenderText(tender: {
  objet?: string | null
  description_detail?: string | null
  short_summary?: string | null
  nomacheteur?: string | null
  descripteur_libelles?: string[] | null
  nature_libelle?: string | null
  type_marche?: string | null
  cpv_codes?: string[] | null
  lots_titres?: string[] | null
}): string {
  const parts: string[] = []

  if (tender.objet) parts.push(`Objet: ${tender.objet}`)
  if (tender.nature_libelle) parts.push(`Nature: ${tender.nature_libelle}`)
  if (tender.type_marche) parts.push(`Type: ${tender.type_marche}`)
  if (tender.nomacheteur) parts.push(`Acheteur: ${tender.nomacheteur}`)
  if (tender.description_detail) parts.push(`Description: ${tender.description_detail.slice(0, 2000)}`)
  else if (tender.short_summary) parts.push(`Résumé: ${tender.short_summary}`)
  if (tender.descripteur_libelles?.length) parts.push(`Domaines: ${tender.descripteur_libelles.join(', ')}`)
  if (tender.cpv_codes?.length) parts.push(`CPV: ${tender.cpv_codes.join(', ')}`)
  if (tender.lots_titres?.length) parts.push(`Lots: ${tender.lots_titres.join(', ')}`)

  return parts.join('\n')
}

/**
 * Construit le texte à embedder pour un profil organisation.
 */
export function buildProfileText(profile: {
  activite_metier?: string | null
  raison_sociale?: string | null
  domaines_competence?: string[] | null
  certifications?: string[] | null
  positionnement?: string | null
  atouts_differenciants?: string | null
  moyens_techniques?: string | null
}): string {
  const parts: string[] = []

  if (profile.raison_sociale) parts.push(`Entreprise: ${profile.raison_sociale}`)
  if (profile.activite_metier) parts.push(`Activité: ${profile.activite_metier}`)
  if (profile.positionnement) parts.push(`Positionnement: ${profile.positionnement}`)
  if (profile.atouts_differenciants) parts.push(`Atouts: ${profile.atouts_differenciants}`)
  if (profile.domaines_competence?.length) parts.push(`Domaines: ${profile.domaines_competence.join(', ')}`)
  if (profile.certifications?.length) parts.push(`Certifications: ${profile.certifications.join(', ')}`)
  if (profile.moyens_techniques) parts.push(`Moyens: ${profile.moyens_techniques.slice(0, 500)}`)

  return parts.join('\n')
}

/**
 * Construit le texte à embedder pour un collaborateur.
 * Utilisé pour le matching avec les AO et la génération de réponses.
 */
export function buildCollaborateurText(collab: {
  prenom?: string | null
  nom?: string | null
  poste?: string | null
  role_metier?: string | null
  bio?: string | null
  competences_cles?: string[] | null
  diplomes?: string[] | null
  certifications?: string[] | null
  experience_annees?: number | null
}): string {
  const parts: string[] = []

  if (collab.prenom && collab.nom) parts.push(`Nom: ${collab.prenom} ${collab.nom}`)
  if (collab.poste) parts.push(`Poste: ${collab.poste}`)
  if (collab.role_metier) parts.push(`Rôle: ${collab.role_metier}`)
  if (collab.experience_annees) parts.push(`Expérience: ${collab.experience_annees} ans`)
  if (collab.bio) parts.push(`Profil: ${collab.bio}`)
  if (collab.competences_cles?.length) parts.push(`Compétences: ${collab.competences_cles.join(', ')}`)
  if (collab.diplomes?.length) parts.push(`Diplômes: ${collab.diplomes.join(', ')}`)
  if (collab.certifications?.length) parts.push(`Certifications: ${collab.certifications.join(', ')}`)

  return parts.join('\n')
}
