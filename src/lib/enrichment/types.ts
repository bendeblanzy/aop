/**
 * Enrichment service — schéma de l'identité numérique structurée d'une entreprise.
 *
 * Cet objet est produit par `enrichmentService.enrichOrganization()` en agrégeant
 * 3 sources : LinkedIn (via Apify), site web officiel (via Cheerio), recherche web
 * tierce (via Anthropic Web Search). Il est stocké en DB sur `profiles.enrichment_context`
 * et consommé par tous les autres modules : pré-remplissage onboarding, scoring veille,
 * suggestion codes BOAMP, génération mémoire technique.
 *
 * **Schéma versionné** : si tu modifies la structure, incrémente
 * `ENRICHMENT_SCHEMA_VERSION` ci-dessous pour invalider les contextes en cache.
 */

export const ENRICHMENT_SCHEMA_VERSION = 1

/** TTL du cache d'enrichissement (en jours). Au-delà, recalcul recommandé. */
export const ENRICHMENT_CACHE_TTL_DAYS = 30

/**
 * Statut par source pour scoring de confiance.
 * - `ok` : source récupérée et exploitable
 * - `fail` : tentative effectuée mais échec (LinkedIn ban, site down, etc.)
 * - `skip` : source non sollicitée (URL non fournie par l'utilisateur)
 */
export type SourceStatus = 'ok' | 'fail' | 'skip'

export interface EnrichmentSources {
  linkedin: SourceStatus
  website: SourceStatus
  web_search: SourceStatus
  /** Message d'erreur lisible si l'une des sources a `fail`. */
  errors?: { linkedin?: string; website?: string; web_search?: string }
}

/** Référence publique repérée (étude de cas, projet, marché gagné…). */
export interface PublicReference {
  /** Intitulé court du projet/marché. */
  titre: string
  /** Donneur d'ordre / client si identifié. */
  client?: string
  /** Année si datable. */
  annee?: number
  /** URL source (étude de cas, communiqué…). */
  url?: string
  /** Phrase descriptive 1 ligne. */
  description?: string
}

/**
 * Structure principale — l'identité numérique inférée.
 *
 * Tous les champs sont optionnels car selon les sources disponibles certains ne
 * peuvent être inférés. Les consumers doivent gérer l'absence proprement.
 */
export interface EnrichmentContext {
  /** Activité principale, formulée en 1 phrase claire ("Nous concevons et déployons…"). */
  specialite_principale?: string
  /** Sous-spécialités, expertises secondaires concrètes. */
  sous_specialites?: string[]
  /** Types de clients servis ("Mairies", "Régions", "Hôpitaux publics", "Universités"…). */
  clients_types?: string[]
  /** Taille d'équipe approximative (libellé : "5-10", "20-50", "100+"…). */
  taille_equipe?: string
  /** Ancienneté de l'entreprise en années (depuis création). */
  anciennete_annees?: number
  /** Zone d'intervention principale ("National", "Île-de-France", "Sud-Ouest"…). */
  zone_intervention?: string
  /** Activités déclarées comme NON pratiquées (utile pour anti-matching scoring). */
  exclusions_metier?: string[]
  /** Outils, technologies, méthodologies signature ("Figma", "Notion", "SCRUM"…). */
  outils_technologies?: string[]
  /** Références publiques repérées (max 10 plus récentes/notables). */
  references_publiques?: PublicReference[]
  /** Tone of voice de la marque ("formel/expert", "engagé/militant", "moderne/start-up"…). */
  tone_of_voice?: string
  /** Certifications / labels mentionnés sur le site ou LinkedIn. */
  certifications_inferees?: string[]
  /** Résumé du positionnement en 1 paragraphe (200-400 caractères). */
  positionnement_resume?: string
  /** Signaux concrets de différenciation ("12 ans d'ancienneté", "équipe 100% bilingue"…). */
  signaux_specificite?: string[]

  // ── Métadonnées générées par le synthesizer ─────────────────────────────────

  /** Score de confiance global 0-100 (basé sur richesse + cohérence des sources). */
  confidence?: number
  /** Notes / warnings internes du synthesizer (ex: "site web inaccessible, données partielles"). */
  notes?: string
}

/**
 * Données brutes d'une source avant synthèse. Pas stockées en DB — éphémère.
 * Le synthesizer les agrège pour produire l'EnrichmentContext final.
 */
export interface RawLinkedInData {
  name?: string
  description?: string
  industries?: string[]
  specialties?: string[]
  employee_count_range?: string
  founded_year?: number
  headquarters?: { city?: string; country?: string }
  website?: string
  /** Posts récents (titre + extrait) si disponibles via le scraper. */
  recent_posts?: { title?: string; excerpt?: string }[]
}

export interface RawWebsiteData {
  /** URL canonique récupérée. */
  url: string
  /** Titre de la home (<title>). */
  title?: string
  /** Meta description. */
  description?: string
  /** Texte concaténé de la home + page about (~5000 chars max). */
  text_content?: string
  /** Liens internes pertinents trouvés (about, méthodologie, etc.). */
  pages_explored?: string[]
}

export interface RawWebSearchData {
  /** Résumé textuel brut produit par Claude après ses recherches. */
  summary: string
  /** Sources citées (titre + URL). */
  citations: { title: string; url: string }[]
}
