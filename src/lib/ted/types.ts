// Types pour l'API TED (Tenders Electronic Daily) v3
// Documentation officielle : https://docs.ted.europa.eu/api/latest/
//
// Cible : récupérer les avis de marché publiés au JOUE qui concernent la
// France (PoP country = FRA) et les ingérer dans la table `tenders` avec
// `source = 'ted'`.

/**
 * Champs retournés par /v3/notices/search.
 * Le contenu exact dépend du paramètre `fields` envoyé dans la requête.
 * Tous les champs sont optionnels — TED ne garantit pas leur présence.
 */
export interface TedNotice {
  // Identification
  'publication-number'?: string                    // ex "00012345-2026"
  'publication-date'?: string                      // ISO 8601
  'notice-type'?: string                           // ex "cn-standard"
  'notice-title'?: { fra?: string; eng?: string } | string
  'description-lot'?: { fra?: string; eng?: string } | string

  // Acheteur
  'buyer-name'?: { fra?: string; eng?: string } | string | string[]
  'buyer-country'?: string

  // Localisation prestation
  'place-of-performance-country'?: string[] | string
  'place-of-performance-nuts'?: string[] | string

  // Procédure / type marché
  'procedure-type'?: string
  'contract-nature'?: string                       // 'works' | 'services' | 'supplies'

  // Dates clés
  'deadline-date-lot'?: string                     // ISO 8601 — date limite réponse
  'deadline-receipt-tender'?: string               // alias possible

  // Valeur estimée
  'estimated-value-glo'?: { amount?: number; currency?: string } | number
  'estimated-value-cur-glo'?: string

  // Durée
  'duration-period'?: { months?: number; days?: number; years?: number } | number
  'duration-month-glo'?: number

  // Classification CPV
  'classification-cpv'?: string[] | string
  'main-classification-cpv'?: string

  // URLs
  'url-document'?: string                          // lien profil acheteur (DCE)
  'links'?: { 'pdf'?: { fra?: string; eng?: string } | string; html?: string }

  // Lots
  'notice-lot'?: unknown[]

  // Version brute (au cas où on voudrait stocker plus tard)
  [key: string]: unknown
}

export interface TedSearchResponse {
  notices?: TedNotice[]
  iterationNextToken?: string | null
  totalNoticeCount?: number
}

export interface TedSyncResult {
  fetched: number
  inserted: number
  errors: number
  pages: number
  errorMessages?: string[]
}
