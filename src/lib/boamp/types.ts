// Types pour l'API BOAMP v2.1 et la base de données tenders

export interface BoampRecord {
  idweb: string
  objet: string | null
  famille: string | null
  nature: string | null
  nature_libelle: string | null
  dateparution: string | null
  datelimitereponse: string | null
  datefindiffusion: string | null
  nomacheteur: string | null
  descripteur_code: string[] | null
  descripteur_libelle: string[] | null
  url_avis: string | null
  code_departement: string[] | null
  type_procedure: string | null
  procedure_libelle: string | null
  type_marche: string[] | string | null
  donnees: string | null  // JSON string eForms
}

export interface BoampApiResponse {
  total_count: number
  results: BoampRecord[]
}

export interface ParsedEforms {
  description?: string
  valeur_estimee?: number
  budget_estime?: number
  duree_mois?: number
  type_marche?: string
  url_profil_acheteur?: string
  cpv_codes?: string[]
  code_nuts?: string
  nb_lots?: number
  lots_titres?: string[]
}

/** Champs extraits d'un avis MAPA (format français legacy < 90k€) */
export interface ParsedMapa {
  description?: string
  url_profil_acheteur?: string
  duree_mois?: number
  date_debut_prestation?: string
  email_contact?: string
  contact_nom?: string
  contact_prenom?: string
  contact_fonction?: string
  contact_civilite?: string
  reference_acheteur?: string
}

/** Annonce BOAMP en base de données */
export interface Tender {
  id: string
  idweb: string
  objet: string | null
  nomacheteur: string | null
  famille: string | null
  nature: string | null
  nature_libelle: string | null
  dateparution: string | null
  datelimitereponse: string | null
  datefindiffusion: string | null
  descripteur_codes: string[]
  descripteur_libelles: string[]
  type_marche: string | null
  url_avis: string | null
  url_profil_acheteur: string | null
  description_detail: string | null
  valeur_estimee: number | null
  budget_estime: number | null
  duree_mois: number | null
  short_summary: string | null
  code_departement: string[]
  type_procedure: string | null
  procedure_libelle: string | null
  cpv_codes: string[]
  code_nuts: string | null
  nb_lots: number | null
  lots_titres: string[]
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
