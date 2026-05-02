/**
 * Types de l'actor Apify aws-mpi-scraper.
 *
 * Contrat de sortie (AwsMpiApifyItem) IMMUTABLE depuis V1 — doit rester en
 * miroir avec celui consommé côté Next.js (src/lib/aws/types.ts).
 */

// ─── Input ───────────────────────────────────────────────────────────────────

export interface AwsMpiActorInput {
  /**
   * Mots-clés de recherche. Si absent ou vide, utilise les 22 keywords métier
   * par défaut (communication, événementiel, audiovisuel...).
   * Important : pas d'accents dans les mots-clés — l'encodage HTTP sur
   * marches-publics.info supporte UTF-8 mais les résultats de recherche
   * sont souvent plus stables sans accents.
   */
  keywords?: string[]

  filters?: {
    /**
     * Délai minimum (en jours) avant date limite de remise. Défaut 15.
     * Les AO avec deadline < NOW+N jours sont ignorés.
     * Mettre 0 pour désactiver le filtre.
     */
    minDaysUntilDeadline?: number

    /**
     * Nombre max de pages à scraper par mot-clé (10 items/page). Défaut 10.
     */
    maxPagesPerKeyword?: number
  }

  /**
   * Nombre max de fiches de détail à fetcher pour enrichir CPV/SIRET/valeur.
   * Défaut 100. À 0 : on désactive l'enrichissement (listing seulement).
   */
  maxDetailFetches?: number
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface AwsMpiLot {
  numero?: string | null
  intitule?: string | null
  cpv?: string | null
}

/**
 * Item normalisé en sortie du dataset Apify.
 *
 * Convention idweb côté Next.js : `aws-mpi-{reference}`
 * Le champ `reference` est le numéro MPI public extrait de l'URL
 * `/Annonces/MPI-pub-{reference}.htm` (ex: "20260871430").
 */
export interface AwsMpiApifyItem {
  /** Numéro de publication MPI (de l'URL /Annonces/MPI-pub-XXXXXXXX.htm) */
  reference: string

  /** Référence acheteur (ex: "2026-07") */
  reference_acheteur: string | null

  /** Titre de la consultation (de la page listing) */
  intitule: string | null

  /** Description longue (objet du marché, de la fiche de détail) */
  objet: string | null

  /** Nom de l'organisme acheteur */
  organisme: string | null

  /** SIRET de l'organisme (14 chiffres, de la fiche de détail) */
  siret: string | null

  /** Procédure (ex: "Procédure ouverte", "MAPA", etc.) */
  procedure_type: string | null

  /** Type de marché (ex: "Services", "Travaux", "Fournitures") */
  type_marche: string | null

  /** Date de publication au format YYYY-MM-DD */
  date_publication: string | null

  /**
   * Date limite de remise au format ISO (YYYY-MM-DDTHH:MM:00+00:00).
   * Heure locale acheteur convertie naïvement (UTC).
   */
  date_limite_remise: string | null

  /** Lieu d'exécution (de la fiche de détail si disponible) */
  lieu_execution: string | null

  /** Codes département (ex: ["23"]) extraits du code postal de l'organisme */
  code_departement: string[]

  /** Codes CPV (principal + lots) */
  cpv_codes: string[]

  /** Valeur estimée hors TVA en euros */
  valeur_estimee: number | null

  /** URL de la fiche de consultation */
  url_consultation: string

  /** Lots du marché */
  lots: AwsMpiLot[]

  /** Nombre de lots (null si marché simple) */
  nb_lots: number | null

  /** Timestamp ISO du scrape */
  scraped_at: string
}
