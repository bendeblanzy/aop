/**
 * Types partagés pour la source AWS / Marchés Publics Info.
 *
 * AwsMpiApifyItem : contrat de sortie de l'actor Apify (miroir de
 * apify-aws-actor/src/types.ts — à garder synchronisé).
 */

// ─── Item Apify (sortie dataset) ──────────────────────────────────────────────

export interface AwsMpiLot {
  numero?: string | null
  intitule?: string | null
  cpv?: string | null
}

export interface AwsMpiApifyItem {
  reference: string
  reference_acheteur: string | null
  intitule: string | null
  objet: string | null
  organisme: string | null
  siret: string | null
  procedure_type: string | null
  type_marche: string | null
  date_publication: string | null
  date_limite_remise: string | null
  lieu_execution: string | null
  code_departement: string[]
  cpv_codes: string[]
  valeur_estimee: number | null
  url_consultation: string
  lots: AwsMpiLot[]
  nb_lots: number | null
  scraped_at: string
}

// ─── Types Apify run management ───────────────────────────────────────────────

export type ApifyRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TIMED-OUT'
  | 'ABORTED'

export interface ApifyRun {
  id: string
  status: ApifyRunStatus
  defaultDatasetId: string
  stats?: {
    runTimeSecs?: number
  }
}

// ─── Sync result ──────────────────────────────────────────────────────────────

export interface AwsMpiActorInput {
  keywords?: string[]
  filters?: {
    minDaysUntilDeadline?: number
    maxPagesPerKeyword?: number
  }
  maxDetailFetches?: number
}

export interface AwsMpiSyncResult {
  apifyRunId: string
  fetched: number
  inserted: number
  skipped: number
  errors: number
  apifyRunDurationSecs: number
}
