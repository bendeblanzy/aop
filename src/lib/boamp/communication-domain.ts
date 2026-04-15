import { getEmbedding } from '@/lib/ai/embeddings'

/**
 * Texte de référence décrivant le domaine "communication & services associés".
 *
 * Ce texte est embedé une fois et utilisé pour biaiser le matching vectoriel
 * vers les appels d'offres de type prestation de services en communication,
 * numérique, événementiel et éditorial.
 */
export const COMMUNICATION_DOMAIN_TEXT = `
Agence de communication et de création spécialisée dans les marchés publics de prestation de services.

Communication institutionnelle et marketing :
stratégie de communication, plan de communication, communication externe, communication interne,
communication corporate, campagnes publicitaires, publicité print et digitale,
relations presse, relations médias, attaché de presse, communication de crise,
notoriété de marque, identité de marque, storytelling.

Création graphique et audiovisuelle :
identité visuelle, charte graphique, logo, design graphique, conception graphique, PAO,
mise en page, édition, supports de communication, brochures, plaquettes, affiches, flyers,
signalétique, habillage véhicule, objets publicitaires, production vidéo, réalisation film
institutionnel, photographie, motion design, animation 2D/3D, podcast, scénographie.

Événementiel :
organisation d'événements, événementiel d'entreprise, séminaires, conférences, conventions,
salons professionnels, expositions, inaugurations, cérémonies, lancements de produit,
logistique événementielle, scénographie événementielle, animation événementielle.

Contenus éditoriaux :
rédaction de contenu, copywriting, conception-rédaction, création de contenu web,
blog, newsletter, livre blanc, rapport annuel, traduction éditoriale.

Web design et création numérique (prestation créative uniquement) :
création de sites internet, refonte de site web, webdesign, UX design, UI design,
accessibilité numérique, expérience utilisateur sur supports digitaux.

Médias sociaux et contenus digitaux :
community management, gestion éditoriale des réseaux sociaux, création de contenus
pour réseaux sociaux, stratégie éditoriale digitale.
`

/**
 * Texte de référence anti-domaine : prestations qui ne relèvent PAS d'une agence
 * de communication/création. Utilisé (optionnel) pour pénaliser les faux positifs.
 * Fournitures, travaux BTP, infogérance pure, développement logiciel métier,
 * services RH, conseil non-communication, maintenance technique.
 */
export const NON_COMMUNICATION_DOMAIN_TEXT = `
Marchés publics qui ne relèvent pas d'une agence de communication ni de création.

Fournitures et équipements : mobilier de bureau, fournitures de bureau, matériel
informatique, consommables, véhicules, vêtements de travail, équipements de protection.

Travaux et BTP : construction, rénovation, voirie, bâtiment, génie civil,
chauffage, plomberie, électricité bâtiment, peinture bâtiment, couverture, étanchéité.

Prestations techniques non créatives : infogérance, maintenance informatique,
hébergement, tierce maintenance applicative, support technique, helpdesk,
développement logiciel métier, intégration de progiciels, ERP, CRM,
marketing automation, SEO/SEA pur sans création, audit technique, cybersécurité.

Services métiers : recrutement, conseil RH, paie, SIRH, formation professionnelle
hors communication, audit financier, conseil juridique, comptabilité, assurance,
nettoyage, sécurité gardiennage, restauration collective, transport.
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
let _cachedAntiEmbedding: number[] | null = null

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
 * Retourne l'embedding de l'anti-domaine (hors communication/création).
 * Utilisé pour pénaliser les AO qui ressemblent à des fournitures/travaux/
 * infogérance pure, même s'ils matchent partiellement le profil.
 */
export async function getNonCommunicationEmbedding(): Promise<number[]> {
  if (_cachedAntiEmbedding && _cachedAntiEmbedding.length > 0) return _cachedAntiEmbedding
  const embedding = await getEmbedding(NON_COMMUNICATION_DOMAIN_TEXT)
  _cachedAntiEmbedding = embedding
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
