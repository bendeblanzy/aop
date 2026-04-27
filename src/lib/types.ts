export interface Organization {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: 'admin' | 'member'
  created_at: string
  email?: string
}

export interface Profile {
  organization_id: string
  created_at: string
  updated_at: string
  raison_sociale: string
  forme_juridique?: string
  siret: string
  siren?: string
  code_naf?: string
  numero_tva?: string
  date_creation_entreprise?: string
  capital_social?: number
  adresse_siege?: string
  code_postal?: string
  ville?: string
  pays: string
  civilite_representant?: string
  nom_representant: string
  prenom_representant: string
  qualite_representant?: string
  email_representant?: string
  telephone_representant?: string
  ca_annee_n1?: number
  ca_annee_n2?: number
  ca_annee_n3?: number
  marge_brute?: number
  effectif_moyen?: number
  certifications?: string[]
  domaines_competence?: string[]
  moyens_techniques?: string
  assurance_rc_numero?: string
  assurance_rc_compagnie?: string
  assurance_rc_expiration?: string
  assurance_decennale_numero?: string
  assurance_decennale_compagnie?: string
  assurance_decennale_expiration?: string
  declaration_non_interdiction: boolean
  declaration_a_jour_fiscal: boolean
  declaration_a_jour_social: boolean
  sous_traitants?: SousTraitant[]
  positionnement?: string
  atouts_differenciants?: string
  methodologie_type?: string
  cv_plaquette_url?: string
  dossier_capacites_url?: string
  // Veille BOAMP
  boamp_codes?: string[]
  activite_metier?: string
  types_marche_filtres?: string[]
  // Géolocalisation
  region?: string
}

export interface SousTraitant {
  nom: string
  siret: string
  adresse: string
  specialite: string
  montant_habituel?: number
}

export interface Reference {
  id: string
  organization_id: string
  created_at: string
  titre: string
  client: string
  annee?: number
  montant?: number
  description?: string
  domaine?: string
  lot?: string
  attestation_bonne_execution: boolean
  contact_reference?: string
  telephone_reference?: string
}

export interface Collaborateur {
  id: string
  organization_id: string
  created_at: string
  nom: string
  prenom: string
  poste?: string
  experience_annees?: number
  diplomes?: string[]
  certifications?: string[]
  competences_cles?: string[]
  email?: string
  role_metier?: string
  cv_url?: string
  linkedin_url?: string
  bio?: string
}

/**
 * Suivi d'un appel d'offres en cours.
 * NB : la fonctionnalité "réponse aux AO" (génération DC1/DC2/DUME/mémoire,
 * upload DCE, analyses RC/CCTP/BPU) a été retirée. Seuls les champs liés au
 * suivi pur (titre, acheteur, dates, sources) restent utiles.
 * Les anciens champs (analyse_*, documents_generes, fichiers_source...) ont
 * été dropés par la migration 018.
 */
export interface AppelOffre {
  id: string
  organization_id: string
  created_at: string
  updated_at: string
  titre: string
  reference_marche?: string
  acheteur?: string
  date_limite_reponse?: string
  statut: 'brouillon' | 'en_cours' | 'analyse' | 'genere' | 'soumis' | 'archive'
  notes_utilisateur?: string
  team_members?: string[]
  // Lien vers le tender BOAMP/TED source
  tender_idweb?: string
  url_avis?: string
  url_profil_acheteur?: string
}
