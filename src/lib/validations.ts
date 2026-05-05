import { z } from 'zod'

// ── Appels d'offres ──────────────────────────────────────────────────────────

export const createAppelOffreSchema = z.object({
  titre: z.string().min(1, 'Le titre est requis'),
  reference_marche: z.string().optional(),
  acheteur: z.string().optional(),
  date_limite_reponse: z.string().optional(),
  statut: z.enum(['brouillon', 'en_cours', 'analyse', 'genere', 'soumis', 'archive']).default('brouillon'),
  notes_utilisateur: z.string().optional(),
  team_members: z.array(z.string()).optional(),
  tender_idweb: z.string().optional(),
  url_avis: z.string().optional(),
  url_profil_acheteur: z.string().optional(),
}).strict()

export const updateAppelOffreSchema = z.object({
  id: z.string().uuid('ID invalide'),
}).merge(createAppelOffreSchema.partial()).strict()

// ── Collaborateurs ───────────────────────────────────────────────────────────

export const createCollaborateurSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  prenom: z.string().min(1, 'Le prénom est requis'),
  poste: z.string().optional(),
  experience_annees: z.number().int().min(0).optional(),
  diplomes: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  competences_cles: z.array(z.string()).optional(),
  email: z.string().email().optional().or(z.literal('')),
  role_metier: z.string().optional(),
  cv_url: z.string().url().optional().or(z.literal('')),
}).strict()

export const updateCollaborateurSchema = z.object({
  id: z.string().uuid('ID invalide'),
}).merge(createCollaborateurSchema.partial()).strict()

// ── Références ───────────────────────────────────────────────────────────────

export const createReferenceSchema = z.object({
  titre: z.string().min(1, 'Le titre est requis'),
  client: z.string().min(1, 'Le client est requis'),
  annee: z.number().int().min(1900).max(2100).optional(),
  montant: z.number().min(0).optional(),
  description: z.string().optional(),
  domaine: z.string().optional(),
  lot: z.string().optional(),
  attestation_bonne_execution: z.boolean().default(false),
  contact_reference: z.string().optional(),
  telephone_reference: z.string().optional(),
}).strict()

export const updateReferenceSchema = z.object({
  id: z.string().uuid('ID invalide'),
}).merge(createReferenceSchema.partial()).strict()

// ── Profil ───────────────────────────────────────────────────────────────────

export const upsertProfileSchema = z.object({
  raison_sociale: z.string().optional(),
  forme_juridique: z.string().optional(),
  siret: z.string().max(14).optional().or(z.literal('')),
  siren: z.string().max(9).optional().or(z.literal('')),
  code_naf: z.string().optional(),
  numero_tva: z.string().optional(),
  date_creation_entreprise: z.string().optional(),
  capital_social: z.number().optional().nullable(),
  adresse_siege: z.string().optional(),
  code_postal: z.string().max(10).optional().or(z.literal('')),
  ville: z.string().optional(),
  pays: z.string().default('France'),
  civilite_representant: z.string().optional(),
  nom_representant: z.string().optional(),
  prenom_representant: z.string().optional(),
  qualite_representant: z.string().optional(),
  email_representant: z.string().email().optional().or(z.literal('')),
  telephone_representant: z.string().optional(),
  ca_annee_n1: z.number().optional().nullable(),
  ca_annee_n2: z.number().optional().nullable(),
  ca_annee_n3: z.number().optional().nullable(),
  effectif_moyen: z.number().optional().nullable(),
  certifications: z.array(z.string()).optional(),
  domaines_competence: z.array(z.string()).optional(),
  moyens_techniques: z.string().optional(),
  assurance_rc_numero: z.string().optional(),
  assurance_rc_compagnie: z.string().optional(),
  assurance_rc_expiration: z.string().optional(),
  assurance_decennale_numero: z.string().optional(),
  assurance_decennale_compagnie: z.string().optional(),
  assurance_decennale_expiration: z.string().optional(),
  declaration_non_interdiction: z.boolean().optional(),
  declaration_a_jour_fiscal: z.boolean().optional(),
  declaration_a_jour_social: z.boolean().optional(),
  sous_traitants: z.array(z.object({
    nom: z.string(),
    siret: z.string(),
    adresse: z.string(),
    specialite: z.string(),
    montant_habituel: z.number().optional(),
  })).optional(),
  positionnement: z.string().optional(),
  boamp_codes: z.array(z.string()).optional(),
  activite_metier: z.string().optional(),
  // Sources pour le service d'enrichissement (LinkedIn + site web officiel).
  // Schéma permissif : URL libre, on n'oblige pas le format https car certains
  // utilisateurs collent juste "linkedin.com/company/xxx" sans protocole.
  linkedin_url: z.string().optional().or(z.literal('')),
  website_url: z.string().optional().or(z.literal('')),
})

// ── Delete (commun) ──────────────────────────────────────────────────────────

export const deleteByIdSchema = z.object({
  id: z.string().uuid('ID invalide'),
}).strict()

// ── AI routes ────────────────────────────────────────────────────────────────
// (les schemas aiAnalyzeSchema et aiGenerateSchema ont été retirés avec la
// fonctionnalité de réponse aux AO.)
