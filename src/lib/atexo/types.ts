// Types pour la 3e source de tenders : Atexo MPE (PLACE + Maximilien)
//
// Atexo MPE est le profil acheteur PHP/PRADO sous-jacent à plusieurs plateformes
// publiques françaises. On scrape via un actor Apify dédié (`atexo-mpe-scraper`)
// qui gère PRADO_PAGESTATE et expose un dataset normalisé.
//
// Documentation interne : `apify-atexo-actor/README.md`
// Pattern de référence côté Next : `src/lib/ted/sync.ts`

/**
 * Identifiants des plateformes Atexo MPE supportées.
 * À étendre quand on couvre de nouvelles plateformes (PROvigueur, etc.).
 */
export type AtexoProviderId =
  | 'place'      // marches-publics.gouv.fr (PLACE)
  | 'mxm'        // marches.maximilien.fr
  | 'grandest'   // marchespublics.grandest.fr (désactivé — formulaire variant V4)
  | 'pdl'        // marchespublics.paysdelaloire.fr
  | 'alsace'     // alsacemarchespublics.eu (désactivé — formulaire variant V4)
  | 'adullact'   // webmarche.adullact.org
  | 'bdr'        // marches.departement13.fr
  | 'mtp3m'      // marches.montpellier3m.fr (désactivé — 0 AO services actifs)

/**
 * Item produit par l'actor Apify `atexo-mpe-scraper` dans son dataset.
 * Contrat de sortie stable — toute évolution doit incrémenter la version
 * de l'actor et rester rétro-compatible (champs optionnels).
 */
export interface AtexoApifyItem {
  // Identification
  provider: AtexoProviderId
  reference: string                    // ex "2025-0154-00-00-MPF" (PLACE) ou "26U044" (Maximilien)

  // Métadonnées listing + détail
  intitule: string | null              // titre court de la consultation
  objet: string | null                 // description longue (souvent identique à intitulé)
  organisme: string | null             // nom de l'acheteur
  reference_acheteur: string | null    // référence interne de l'acheteur (optionnelle)

  // Procédure
  procedure_type: string | null        // ex "Procédure adaptée ouverte", "Appel d'offres ouvert"
  type_marche: string | null           // 'SERVICES' | 'TRAVAUX' | 'FOURNITURES' (mappé par l'actor)

  // Dates (ISO 8601)
  date_publication: string | null      // YYYY-MM-DD
  date_limite_remise: string | null    // YYYY-MM-DDTHH:MM:SS+02:00

  // Localisation
  lieu_execution: string | null        // texte libre (région, département, code postal…)
  code_departement: string[]           // codes département extraits (best-effort)

  // Classification
  cpv_codes: string[]                  // ex ['72500000', '79420000']

  // Valeur
  valeur_estimee: number | null        // en EUR, entier

  // URLs
  url_consultation: string             // URL canonique de la fiche
  url_dce: string | null               // URL de téléchargement du DCE (si publique)

  // Lots
  lots: AtexoLot[]

  // Méta scraping
  scraped_at: string                   // ISO timestamp
}

export interface AtexoLot {
  numero?: string | null
  intitule?: string | null
  description?: string | null
}

/**
 * Statut d'un run Apify — modèle officiel de l'API Apify v2.
 * Référence : https://docs.apify.com/api/v2#/reference/actors/run-collection/run-actor
 */
export type ApifyRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TIMING-OUT'
  | 'TIMED-OUT'
  | 'ABORTING'
  | 'ABORTED'

export interface ApifyRun {
  id: string
  actId: string
  status: ApifyRunStatus
  startedAt: string
  finishedAt: string | null
  defaultDatasetId: string
  defaultKeyValueStoreId: string
  stats?: {
    inputBodyLen?: number
    runTimeSecs?: number
    [key: string]: unknown
  }
  // … (plus de champs disponibles, on en n'utilise qu'une fraction)
}

/**
 * Input passé à l'actor Apify `atexo-mpe-scraper`.
 */
export interface AtexoActorInput {
  providers: Array<{
    id: AtexoProviderId
    baseUrl: string
  }>
  filters: {
    /** 'services' | 'travaux' | 'fournitures' | null (= tous) */
    categorie: 'services' | 'travaux' | 'fournitures' | null
    /** [legacy, ignoré côté actor] */
    maxAgeDays: number
    /** Mots-clés métier à scraper (un sub-run par keyword). Sans accents. */
    keywords?: string[]
    /** Délai minimum avant date limite de remise pour push (défaut 21j). */
    minDaysUntilDeadline?: number
  }
  /** Limite la quantité de pages scrapées par plateforme/keyword (sécurité) */
  maxPagesPerProvider?: number
}

/**
 * Résultat agrégé d'un run de sync Atexo (côté Next.js).
 */
export interface AtexoSyncResult {
  /** Run Apify déclenché */
  apifyRunId: string
  /** Items récupérés depuis le dataset Apify */
  fetched: number
  /** Records inserted/upserted dans la table `tenders` */
  inserted: number
  /** Items filtrés (non SERVICES, doublons, etc.) */
  skipped: number
  /** Erreurs d'upsert */
  errors: number
  /** Durée totale du run Apify en secondes */
  apifyRunDurationSecs: number | null
}
