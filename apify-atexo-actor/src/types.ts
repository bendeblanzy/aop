// Types — duplique partiellement src/lib/atexo/types.ts du Next.js, mais en
// "local" pour que l'actor reste indépendant. Le contrat de sortie (AtexoApifyItem)
// DOIT rester en miroir avec celui consommé côté Next.

export type AtexoProviderId =
  | 'place'      // marches-publics.gouv.fr (PLACE)
  | 'mxm'        // marches.maximilien.fr
  | 'grandest'   // marchespublics.grandest.fr (disabled — moteur ColdFusion, ≠ PRADO)
  | 'pdl'        // marchespublics.paysdelaloire.fr
  | 'alsace'     // plateforme.alsacemarchespublics.eu (PRADO — baseUrl corrigé P2)
  | 'adullact'   // webmarche.adullact.org (centrale collectivités)
  | 'bdr'        // marches.departement13.fr (Bouches-du-Rhône)
  | 'mtp3m'      // marches.montpellier3m.fr (Montpellier Métropole, disabled — 0 AO)
  // Note : 'lenord' retiré le 2026-04-28 — domaine mort (ERR_NAME_NOT_RESOLVED)

export interface AtexoProviderInput {
  id: AtexoProviderId
  baseUrl: string
}

export interface AtexoActorInput {
  providers: AtexoProviderInput[]
  filters?: {
    /** Catégorie marché : 'services' (défaut) | 'travaux' | 'fournitures' | null = tous */
    categorie?: 'services' | 'travaux' | 'fournitures' | null
    /** [Legacy, ignoré côté actor] */
    maxAgeDays?: number
    /**
     * Mots-clés à rechercher (recherche métier).
     * Si présent : on POST sur le formulaire de recherche avancée Atexo
     * (un sub-run par keyword), au lieu du listing /AllCons par défaut.
     * Important : pas d'accents (PRADO ne supporte pas l'UTF-8 dans ce champ).
     */
    keywords?: string[]
    /**
     * Nombre minimum de jours avant date limite de remise pour qu'un AO soit
     * pushé. Défaut 21j (= ne push que les AO laissant ≥ 3 semaines).
     * Mettre 0 pour désactiver le filtre fraîcheur.
     */
    minDaysUntilDeadline?: number
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
