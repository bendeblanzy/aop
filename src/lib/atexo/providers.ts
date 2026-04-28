import type { AtexoProviderId } from './types'

/**
 * Configuration des plateformes Atexo MPE supportées par notre scraper.
 *
 * Le moteur PRADO d'Atexo est partagé entre toutes ces plateformes : seuls
 * `baseUrl` et la regex de référence changent. L'actor itère sur cette liste.
 *
 * Liste de plateformes additionnelles disponibles :
 *   cf. plateformes.csv de github.com/ColinMaudry/atexo-decp-scraper
 */
export interface AtexoProviderConfig {
  id: AtexoProviderId
  name: string
  baseUrl: string
  /** Activé par défaut dans le run quotidien */
  enabled: boolean
  /**
   * Mode de scraping :
   *   - 'keyword' : 1 sub-run par mot-clé (ATEXO_KEYWORDS_COMM). Ciblé,
   *     adapté aux plateformes à gros volume (PLACE = 2000+ AO actifs)
   *     où on doit filtrer côté actor.
   *   - 'listing' : 1 sub-run unique sur /AllCons (tous les services).
   *     Adapté aux petites plateformes régionales où le keyword loop
   *     prend trop de temps (~50s/keyword × 22 = 1100s) sans gain de
   *     filtrage. Le scoring vectoriel filtre côté Next.js.
   */
  mode: 'keyword' | 'listing'
}

// V3 (Playwright, 2026-04-28) : grâce au scraper navigateur, le hard-cap
// PRADO 3 pages est levé et on peut couvrir toute la résultset. Bilan des
// plateformes Atexo testées :
//
//   ✅ Actives (formulaire avancé OK + résultats) :
//      - PLACE, Maximilien, Bouches-du-Rhône, Pays de la Loire (PdL),
//        Adullact, Montpellier Métropole (mtp3m).
//   ⛔ Désactivées (formulaire variant — champ keywordSearch absent du DOM,
//      à reverse-engineer en V4 pour adapter les sélecteurs) :
//      - Grand Est, Alsace.
//   🪦 Domaine mort (ERR_NAME_NOT_RESOLVED, plateforme migrée ou retirée) :
//      - Le Nord.
export const ATEXO_PROVIDERS: ReadonlyArray<AtexoProviderConfig> = [
  // ─── Plateformes actives — mode keyword (gros volume, filtrage utile) ─
  {
    id: 'place',
    name: "PLACE — Plateforme des Achats de l'État",
    baseUrl: 'https://www.marches-publics.gouv.fr',
    enabled: true,
    mode: 'keyword', // 2000+ AO actifs : filtrage par keyword obligatoire
  },
  {
    id: 'mxm',
    name: 'Maximilien — Marchés franciliens (Île-de-France)',
    baseUrl: 'https://marches.maximilien.fr',
    enabled: true,
    mode: 'keyword', // 500+ AO actifs : filtrage utile
  },

  // ─── Plateformes actives — mode listing (petit volume, keyword trop lent) ─
  {
    id: 'bdr',
    name: 'Marchés du département des Bouches-du-Rhône (13)',
    baseUrl: 'https://marches.departement13.fr',
    enabled: true,
    mode: 'listing', // V3 : keyword loop timeout sans push — listing mode plus pertinent
  },
  {
    id: 'pdl',
    name: 'Marchés publics Pays de la Loire',
    baseUrl: 'https://marchespublics.paysdelaloire.fr',
    enabled: true,
    mode: 'listing', // ~50s/keyword × 22 = 1100s : trop, listing global plus rapide
  },
  {
    id: 'adullact',
    name: "Adullact — Centrale d'achat collectivités",
    baseUrl: 'https://webmarche.adullact.org',
    enabled: true,
    mode: 'listing',
  },
  {
    id: 'mtp3m',
    name: 'Marchés Montpellier Méditerranée Métropole',
    baseUrl: 'https://marches.montpellier3m.fr',
    enabled: true,
    mode: 'listing',
  },

  // ─── Désactivées : formulaire avancé variant — V4 pour adapter sélecteurs ─
  {
    id: 'grandest',
    name: 'Marchés publics Grand Est',
    baseUrl: 'https://marchespublics.grandest.fr',
    enabled: false,
    mode: 'keyword',
  },
  {
    id: 'alsace',
    name: 'Alsace Marchés Publics',
    baseUrl: 'https://alsacemarchespublics.eu',
    enabled: false,
    mode: 'keyword',
  },

  // ─── Désactivée : domaine inaccessible (DNS) ─────────────────────────
  {
    id: 'lenord',
    name: 'Marchés publics Département du Nord (59) — DOMAINE MORT',
    baseUrl: 'https://marchespublics.lenord.fr',
    enabled: false,
    mode: 'keyword',
  },
] as const

/** Helper : retourne uniquement les providers actifs. */
export function activeProviders(): ReadonlyArray<AtexoProviderConfig> {
  return ATEXO_PROVIDERS.filter(p => p.enabled)
}

/**
 * Mots-clés métier ciblant les AO d'agences de communication / événementiel /
 * audiovisuel / design. Sans accents (PRADO Atexo ne supporte pas UTF-8 dans
 * le champ keywordSearch).
 *
 * Chaque keyword génère un sub-run sur le formulaire de recherche avancée
 * Atexo. La déduplication par idweb absorbe les recouvrements entre keywords.
 *
 * Le champ keywordSearch Atexo cherche dans : référence + intitulé + objet
 * de la consultation (placeholder du formulaire le confirme). On capture donc
 * les AO qui mentionnent ces termes dans leur description courte aussi, pas
 * seulement le titre.
 *
 * V3 (2026-04-28) : 22 keywords élargis couvrant les 8 axes métier :
 * communication/marketing, événementiel, audiovisuel, design, identité
 * visuelle, scénographie, édition, web/RS. Couverture pertinente vs noise
 * absorbé par scoring vectoriel pgvector côté Next.js.
 */
export const ATEXO_KEYWORDS_COMM: ReadonlyArray<string> = [
  // ─── Communication & marketing ───────────────────────────────────────
  'communication',
  'publicite',
  'marketing',
  'relations publiques',
  // ─── Événementiel ────────────────────────────────────────────────────
  'evenementiel',
  'salon',
  'seminaire',
  'festival',
  'exposition',
  // ─── Audiovisuel & vidéo ─────────────────────────────────────────────
  'audiovisuel',
  'video',
  'film',
  'podcast',
  // ─── Design & graphisme ──────────────────────────────────────────────
  'design',
  'graphisme',
  'identite visuelle',
  'signaletique',
  // ─── Scénographie ────────────────────────────────────────────────────
  'scenographie',
  // ─── Édition / Print ─────────────────────────────────────────────────
  'edition',
  'magazine',
  // ─── Web / Réseaux sociaux ───────────────────────────────────────────
  'site internet',
  'reseaux sociaux',
] as const
