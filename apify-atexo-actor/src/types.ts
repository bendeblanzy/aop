// Types — duplique partiellement src/lib/atexo/types.ts du Next.js, mais en
// "local" pour que l'actor reste indépendant. Le contrat de sortie (AtexoApifyItem)
// DOIT rester en miroir avec celui consommé côté Next.

export type AtexoProviderId = 'place' | 'mxm'

export interface AtexoProviderInput {
  id: AtexoProviderId
  baseUrl: string
}

export interface AtexoActorInput {
  providers: AtexoProviderInput[]
  filters?: {
    categorie?: 'services' | 'travaux' | 'fournitures' | null
    maxAgeDays?: number
  }
  maxPagesPerProvider?: number
}

export interface AtexoLot {
  numero?: string | null
  intitule?: string | null
  description?: string | null
}

export interface AtexoApifyItem {
  provider: AtexoProviderId
  reference: string

  intitule: string | null
  objet: string | null
  organisme: string | null
  reference_acheteur: string | null

  procedure_type: string | null
  type_marche: string | null

  date_publication: string | null
  date_limite_remise: string | null

  lieu_execution: string | null
  code_departement: string[]

  cpv_codes: string[]

  valeur_estimee: number | null

  url_consultation: string
  url_dce: string | null

  lots: AtexoLot[]

  scraped_at: string
}
