/**
 * Matching lot ↔ profil agence
 *
 * Logique 100% client-side : construit un index de mots-clés depuis le profil
 * et teste si un titre de lot contient au moins un de ces mots-clés.
 *
 * Intentionnellement simple (pas d'IA) pour être instantané sur les cartes.
 */

/** Mots-clés sectoriels fixes pour les agences de communication */
const BASE_COMM_KEYWORDS = [
  'communication', 'numérique', 'numerique', 'digital', 'web', 'site',
  'campagne', 'publicité', 'publicite', 'média', 'medias', 'médias',
  'audiovisuel', 'événementiel', 'evenementiel', 'graphisme', 'graphique',
  'réseaux sociaux', 'identité visuelle', 'print', 'affichage', 'marketing',
  'branding', 'stratégie', 'strategie', 'presse', 'relations publiques',
  'influence', 'contenu', 'rédaction', 'redaction', 'vidéo', 'video',
  'photo', 'design', 'animation', 'brand', 'édition', 'edition',
  'événement', 'evenement', 'conception', 'créatif', 'creatif',
  'institutionnel', 'corporate', 'promotion', 'visibilité', 'visibilite',
  'sensibilisation', 'communication digitale', 'community', 'social media',
]

/** Interface minimale du profil pour construire les keywords */
export interface ProfileForMatching {
  activite_metier?: string | null
  domaines_competence?: string[] | null
  positionnement?: string | null
  atouts_differenciants?: string | null
}

/**
 * Construit la liste dédupliquée de mots-clés depuis le profil.
 * Inclut toujours les mots-clés sectoriels fixes.
 */
export function buildProfileKeywords(profile: ProfileForMatching | null): string[] {
  if (!profile) return BASE_COMM_KEYWORDS

  const keywords = new Set<string>(BASE_COMM_KEYWORDS)

  // Mots significatifs de l'activité métier (> 4 caractères)
  const textSources = [profile.activite_metier, profile.positionnement, profile.atouts_differenciants]
  for (const src of textSources) {
    if (!src) continue
    const words = src
      .toLowerCase()
      .replace(/[^a-z0-9àâäéèêëîïôöùûüÿçœæ\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4)
    for (const w of words) keywords.add(w)
  }

  // Domaines de compétence (texte entier + mots > 3 chars)
  for (const d of profile.domaines_competence ?? []) {
    const lower = d.toLowerCase()
    keywords.add(lower)
    lower.split(/\s+/).filter(w => w.length > 3).forEach(w => keywords.add(w))
  }

  return [...keywords]
}

/**
 * Retourne true si le titre du lot est pertinent pour les mots-clés donnés.
 */
export function isLotRelevant(lotTitle: string, keywords: string[]): boolean {
  const lower = lotTitle.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

/**
 * Retourne la liste des lots pertinents parmi `lotTitres`.
 * Compatible avec `lots_titres[]` et `lots_details[].titre`.
 */
export function getMatchingLots(
  lotTitres: string[],
  keywords: string[],
): { index: number; titre: string; relevant: boolean }[] {
  return lotTitres.map((titre, index) => ({
    index,
    titre,
    relevant: isLotRelevant(titre, keywords),
  }))
}

/**
 * Compte combien de lots sont pertinents.
 * Retourne null si pas de lots ou pas de keywords.
 */
export function countMatchingLots(
  lotTitres: string[],
  keywords: string[],
): { matching: number; total: number } | null {
  if (lotTitres.length === 0 || keywords.length === 0) return null
  const matching = lotTitres.filter(t => isLotRelevant(t, keywords)).length
  return { matching, total: lotTitres.length }
}
