// Types pour l'API BOAMP v2.1 et la base de données tenders

export interface BoampRecord {
  idweb: string
  objet: string | null
  famille: string | null
  nature: string | null
  dateparution: string | null
  datelimitereponse: string | null
  nomacheteur: string | null
  descripteur_code: string[] | null  // Array from API: ["285","22"]
  descripteur_libelle: string[] | null  // Array from API: ["Publicité","Conseil"]
  url_avis: string | null
  donnees: string | null  // JSON string eForms
}

export interface BoampApiResponse {
  total_count: number
  results: BoampRecord[]
}

export interface ParsedEforms {
  description?: string
  valeur_estimee?: number
  duree_mois?: number
  type_marche?: string
  url_profil_acheteur?: string
}

/** Annonce BOAMP en base de données */
export interface Tender {
  id: string
  idweb: string
  objet: string | null
  nomacheteur: string | null
  famille: string | null
  nature: string | null
  dateparution: string | null
  datelimitereponse: string | null
  descripteur_codes: string[]
  descripteur_libelles: string[]
  type_marche: string | null
  url_avis: string | null
  url_profil_acheteur: string | null
  description_detail: string | null
  valeur_estimee: number | null
  duree_mois: number | null
  short_summary: string | null
  created_at: string
  updated_at: string
}

/** Score de pertinence par organisation */
export interface TenderScore {
  id: string
  tender_idweb: string
  organization_id: string
  score: number
  reason: string | null
  scored_at: string
}

/** Tender enrichi avec son score (pour l'affichage) */
export interface TenderWithScore extends Tender {
  score?: number
  reason?: string
}

export interface SyncResult {
  fetched: number
  inserted: number
  updated: number
  skipped: number
  errors: number
}
