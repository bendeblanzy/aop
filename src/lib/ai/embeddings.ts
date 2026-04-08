import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MODEL = 'text-embedding-3-small' // 1536 dimensions, très rapide, ~$0.02/1M tokens

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
