-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raison_sociale TEXT NOT NULL,
  forme_juridique TEXT,
  siret TEXT NOT NULL,
  siren TEXT GENERATED ALWAYS AS (LEFT(siret, 9)) STORED,
  code_naf TEXT,
  numero_tva TEXT,
  date_creation_entreprise DATE,
  capital_social NUMERIC,
  adresse_siege TEXT,
  code_postal TEXT,
  ville TEXT,
  pays TEXT DEFAULT 'France',
  civilite_representant TEXT,
  nom_representant TEXT NOT NULL,
  prenom_representant TEXT NOT NULL,
  qualite_representant TEXT,
  email_representant TEXT,
  telephone_representant TEXT,
  ca_annee_n1 NUMERIC,
  ca_annee_n2 NUMERIC,
  ca_annee_n3 NUMERIC,
  effectif_moyen INTEGER,
  certifications TEXT[],
  domaines_competence TEXT[],
  moyens_techniques TEXT,
  assurance_rc_numero TEXT,
  assurance_rc_compagnie TEXT,
  assurance_rc_expiration DATE,
  assurance_decennale_numero TEXT,
  assurance_decennale_compagnie TEXT,
  assurance_decennale_expiration DATE,
  declaration_non_interdiction BOOLEAN DEFAULT FALSE,
  declaration_a_jour_fiscal BOOLEAN DEFAULT FALSE,
  declaration_a_jour_social BOOLEAN DEFAULT FALSE,
  sous_traitants JSONB DEFAULT '[]'::JSONB
);

-- Table references
CREATE TABLE IF NOT EXISTS references (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  intitule_marche TEXT NOT NULL,
  acheteur_public TEXT NOT NULL,
  annee_execution INTEGER,
  montant NUMERIC,
  description_prestations TEXT,
  domaine TEXT,
  lot TEXT,
  attestation_bonne_execution BOOLEAN DEFAULT FALSE,
  contact_reference TEXT,
  telephone_reference TEXT
);

-- Table collaborateurs
CREATE TABLE IF NOT EXISTS collaborateurs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  poste TEXT,
  experience_annees INTEGER,
  diplomes TEXT[],
  certifications TEXT[],
  competences_cles TEXT[],
  cv_url TEXT
);

-- Table appels_offres
CREATE TABLE IF NOT EXISTS appels_offres (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  titre TEXT NOT NULL,
  reference_marche TEXT,
  acheteur TEXT,
  date_limite_reponse TIMESTAMPTZ,
  statut TEXT DEFAULT 'brouillon',
  fichiers_source JSONB DEFAULT '[]'::JSONB,
  analyse_rc JSONB,
  analyse_cctp JSONB,
  documents_generes JSONB DEFAULT '[]'::JSONB,
  notes_utilisateur TEXT,
  references_selectionnees UUID[],
  collaborateurs_selectionnes UUID[]
);

-- Table documents_templates
CREATE TABLE IF NOT EXISTS documents_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  nom TEXT NOT NULL,
  description TEXT,
  version TEXT,
  template_url TEXT,
  champs_mapping JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_references_profile ON references(profile_id);
CREATE INDEX IF NOT EXISTS idx_collaborateurs_profile ON collaborateurs(profile_id);
CREATE INDEX IF NOT EXISTS idx_appels_offres_profile ON appels_offres(profile_id);
CREATE INDEX IF NOT EXISTS idx_appels_offres_statut ON appels_offres(statut);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

ALTER TABLE references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own references" ON references FOR ALL USING (profile_id = auth.uid());

ALTER TABLE collaborateurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own collaborateurs" ON collaborateurs FOR ALL USING (profile_id = auth.uid());

ALTER TABLE appels_offres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own AO" ON appels_offres FOR ALL USING (profile_id = auth.uid());

ALTER TABLE documents_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Templates readable by all authenticated" ON documents_templates FOR SELECT TO authenticated USING (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER appels_offres_updated_at BEFORE UPDATE ON appels_offres FOR EACH ROW EXECUTE FUNCTION update_updated_at();
