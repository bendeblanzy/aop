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
  fichiers_source?: FichierSource[]
  analyse_rc?: AnalyseRC
  analyse_cctp?: AnalyseCCTP
  analyse_bpu?: AnalyseBPU
  documents_generes?: DocumentGenere[]
  notes_utilisateur?: string
  references_selectionnees?: string[]
  collaborateurs_selectionnes?: string[]
  team_members?: string[]
  phase?: 'comprendre' | 'preparer' | 'deposer'
  checklist_conformite?: { item: string; fait: boolean }[]
  // Lien vers le tender BOAMP source (migration 005)
  tender_idweb?: string
  url_avis?: string
  url_profil_acheteur?: string
}

export interface FichierSource {
  nom: string
  url: string
  type: 'rc' | 'cctp' | 'ccap' | 'bpu' | 'ae' | 'dpgf' | 'avis' | 'autre'
  taille: number
}

export interface AnalyseBPU {
  postes: { designation: string; unite: string; quantite?: number; prix_unitaire?: number }[]
  total_estime?: number
}

export interface AnalyseRC {
  objet?: string
  acheteur?: string
  lots?: { numero: string; intitule: string; montant_estime?: number }[]
  criteres_notation?: { critere: string; ponderation_pourcentage: number }[]
  pieces_exigees?: (string | { piece: string; detail?: string })[]
  delai_reponse?: string
  duree_marche?: string
  clauses_eliminatoires?: string[]
  forme_groupement?: string
  variantes?: string
  visite_obligatoire?: string
  decision_go_nogo?: string
  // Champs enrichis par l'analyse DCE unifiée
  prestations_attendues?: string
  normes_exigees?: string[]
  certifications_requises?: string[]
  moyens_humains_exiges?: string
  moyens_techniques_exiges?: string
  contraintes_techniques?: string
  planning_prevu?: string
  penalites?: string
  livrables?: string[]
  clauses_contractuelles_cles?: string
  criteres_rse?: string
  risques_identifies?: string[]
}

export interface AnalyseCCTP {
  prestations_attendues?: string
  normes_exigees?: string[]
  certifications_requises?: string[]
  moyens_humains_exiges?: string
  moyens_techniques_exiges?: string
  contraintes_techniques?: string[]
  planning_prevu?: string
  penalites?: string
  livrables?: string[]
}

export interface DocumentGenere {
  type: 'dc1' | 'dc2' | 'dc4' | 'dume' | 'memoire_technique'
  url: string
  version: number
  genere_le: string
}
