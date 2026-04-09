import { getEmbedding } from '@/lib/ai/embeddings'

/**
 * Texte de référence décrivant le domaine "communication & services associés".
 *
 * Ce texte est embedé une fois et utilisé pour biaiser le matching vectoriel
 * vers les appels d'offres de type prestation de services en communication,
 * numérique, événementiel et éditorial.
 */
export const COMMUNICATION_DOMAIN_TEXT = `
Agence de communication et services numériques spécialisée dans les marchés publics.

Services de communication institutionnelle et marketing :
stratégie de communication, plan de communication, communication externe, communication interne,
communication corporate, campagnes publicitaires, publicité print et digitale, achat d'espaces médias,
médias planning, relations presse, relations médias, relations publiques, attaché de presse,
communication de crise, notoriété de marque, identité de marque.

Services de création graphique et audiovisuelle :
identité visuelle, charte graphique, logo, design graphique, conception graphique, PAO,
mise en page, création de supports de communication, brochures, plaquettes, affiches, flyers,
signalétique, habillage véhicule, goodies, objets publicitaires, production vidéo,
réalisation film institutionnel, photographie, motion design, animation 2D/3D, podcast.

Services événementiels :
organisation d'événements, événementiel d'entreprise, séminaires, conférences, conventions,
salons professionnels, expositions, inaugurations, cérémonies, lancements de produit,
soirées d'entreprise, team building, accueil congressiste, logistique événementielle,
gestion de la relation client, animation.

Services éditoriaux et contenus :
rédaction de contenu, journalisme, éditorial, copywriting, traduction, interprétariat,
création de contenu web, blog, newsletter, livre blanc, rapport annuel, discours,
documentation technique, conception-rédaction.

Services numériques et informatiques :
développement web, création de sites internet, refonte de site web, applications mobiles,
développement logiciel sur mesure, intégration numérique, maintenance informatique,
hébergement web, infogérance, UX design, UI design, webdesign, accessibilité numérique,
gestion de contenu CMS, e-commerce.

Services digitaux et marketing en ligne :
community management, gestion des réseaux sociaux, social media, stratégie digitale,
SEO, référencement naturel, SEA, Google Ads, e-mailing, marketing automation,
marketing digital, CRM, outil de gestion de la relation client, influence marketing.
`

/**
 * Seuil de similarité cosinus utilisé pour le filtre soft du domaine communication.
 * Valeur empirique : 0.18 est suffisamment permissif pour capturer tous les AO pertinents
 * tout en écartant les marchés de travaux/fournitures sans rapport.
 */
export const COMMUNICATION_SIMILARITY_THRESHOLD = 0.18

// ── Cache module-level ────────────────────────────────────────────────────────
// Fonctionne entre requêtes chaudes en serverless (Vercel warm instances).
// En cold start, l'embedding est recalculé (coût négligeable : ~1 appel OpenAI).
let _cachedEmbedding: number[] | null = null

/**
 * Retourne l'embedding du domaine communication (avec cache module-level).
 */
export async function getCommunicationEmbedding(): Promise<number[]> {
  if (_cachedEmbedding && _cachedEmbedding.length > 0) return _cachedEmbedding
  const embedding = await getEmbedding(COMMUNICATION_DOMAIN_TEXT)
  _cachedEmbedding = embedding
  return embedding
}

/**
 * Mélange deux embeddings avec un coefficient alpha pour le premier vecteur.
 *
 * @param a  Premier embedding (ex: profil ou requête utilisateur)
 * @param b  Second embedding (ex: domaine communication)
 * @param alpha  Poids de `a` : 1.0 → 100% a, 0.0 → 100% b
 *
 * Note : la normalisation n'est pas nécessaire ici car la similarité cosinus
 * normalise implicitement lors du calcul.
 */
export function blendEmbeddings(a: number[], b: number[], alpha: number): number[] {
  if (a.length !== b.length || a.length === 0) return a
  return a.map((v, i) => alpha * v + (1 - alpha) * b[i])
}
