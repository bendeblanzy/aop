-- ============================================================
-- Migration 001 — Veille BOAMP
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================================

-- Table tenders (annonces BOAMP syncées quotidiennement)
CREATE TABLE IF NOT EXISTS tenders (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  idweb                 VARCHAR(64)   UNIQUE NOT NULL,
  objet                 TEXT,
  nomacheteur           TEXT,
  famille               VARCHAR(64),
  nature                VARCHAR(64),
  dateparution          DATE,
  datelimitereponse     TIMESTAMPTZ,
  descripteur_codes     TEXT[]        DEFAULT '{}',
  descripteur_libelles  TEXT[]        DEFAULT '{}',
  type_marche           TEXT,
  url_avis              TEXT,
  -- Champs enrichis (parsés depuis donnees)
  description_detail    TEXT,
  valeur_estimee        INTEGER,      -- en euros
  duree_mois            INTEGER,
  short_summary         TEXT,
  -- Données brutes eForms BOAMP
  donnees               JSONB,
  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenders_dateparution_idx
  ON tenders (dateparution DESC);

CREATE INDEX IF NOT EXISTS tenders_datelimitereponse_idx
  ON tenders (datelimitereponse);

CREATE INDEX IF NOT EXISTS tenders_descripteur_codes_idx
  ON tenders USING gin(descripteur_codes);

-- Table tender_scores (score de pertinence IA par organisation)
CREATE TABLE IF NOT EXISTS tender_scores (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_idweb    VARCHAR(64) NOT NULL,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  score           INTEGER     NOT NULL CHECK (score >= 0 AND score <= 100),
  reason          TEXT,
  scored_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tender_idweb, organization_id)
);

CREATE INDEX IF NOT EXISTS tender_scores_org_idx
  ON tender_scores (organization_id, score DESC);

CREATE INDEX IF NOT EXISTS tender_scores_tender_idx
  ON tender_scores (tender_idweb);

-- Ajout des champs BOAMP au profil organisation
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS boamp_codes      TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS activite_metier  TEXT;

-- RLS : tenders est public en lecture (données publiques BOAMP)
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenders_select_all" ON tenders FOR SELECT USING (true);

-- RLS : tender_scores visible par la seule organisation propriétaire
ALTER TABLE tender_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tender_scores_select_own" ON tender_scores
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "tender_scores_insert_own" ON tender_scores
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "tender_scores_upsert_own" ON tender_scores
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
