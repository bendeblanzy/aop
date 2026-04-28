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
}

export const ATEXO_PROVIDERS: ReadonlyArray<AtexoProviderConfig> = [
  // ─── Plateformes nationales ────────────────────────────────────────────
  {
    id: 'place',
    name: "PLACE — Plateforme des Achats de l'État",
    baseUrl: 'https://www.marches-publics.gouv.fr',
    enabled: true,
  },
  {
    id: 'adullact',
    name: 'Adullact — Centrale d\'achat collectivités',
    baseUrl: 'https://webmarche.adullact.org',
    enabled: true,
  },

  // ─── Régionales ────────────────────────────────────────────────────────
  {
    id: 'mxm',
    name: 'Maximilien — Marchés franciliens (Île-de-France)',
    baseUrl: 'https://marches.maximilien.fr',
    enabled: true,
  },
  {
    id: 'grandest',
    name: 'Marchés publics Grand Est',
    baseUrl: 'https://marchespublics.grandest.fr',
    enabled: true,
  },
  {
    id: 'pdl',
    name: 'Marchés publics Pays de la Loire',
    baseUrl: 'https://marchespublics.paysdelaloire.fr',
    enabled: true,
  },
  {
    id: 'alsace',
    name: 'Alsace Marchés Publics',
    baseUrl: 'https://alsacemarchespublics.eu',
    enabled: true,
  },

  // ─── Départementales ───────────────────────────────────────────────────
  {
    id: 'bdr',
    name: 'Marchés du département des Bouches-du-Rhône (13)',
    baseUrl: 'https://marches.departement13.fr',
    enabled: true,
  },
  {
    id: 'lenord',
    name: 'Marchés publics Département du Nord (59)',
    baseUrl: 'https://marchespublics.lenord.fr',
    enabled: true,
  },

  // ─── Métropoles ────────────────────────────────────────────────────────
  {
    id: 'mtp3m',
    name: 'Marchés Montpellier Méditerranée Métropole',
    baseUrl: 'https://marches.montpellier3m.fr',
    enabled: true,
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
 */
export const ATEXO_KEYWORDS_COMM: ReadonlyArray<string> = [
  'communication',
  'evenementiel',
  'audiovisuel',
  'video',
  'graphisme',
  'design',
  'publicite',
  'marketing',
  'media',
  'imprimerie',
  'edition',
  'seminaire',
  'salon',
  'campagne',
  'identite visuelle',
  'relations publiques',
] as const
