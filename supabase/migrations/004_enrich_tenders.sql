-- ============================================================
-- Migration 004 — Enrichissement table tenders
-- Nouveaux champs BOAMP direct + eForms
-- ============================================================

ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS code_departement     TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS type_procedure       TEXT,
  ADD COLUMN IF NOT EXISTS procedure_libelle    TEXT,
  ADD COLUMN IF NOT EXISTS nature_libelle       TEXT,
  ADD COLUMN IF NOT EXISTS datefindiffusion     DATE,
  ADD COLUMN IF NOT EXISTS cpv_codes            TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS code_nuts            TEXT,
  ADD COLUMN IF NOT EXISTS nb_lots              INTEGER,
  ADD COLUMN IF NOT EXISTS lots_titres          TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS budget_estime        BIGINT;     -- en euros

CREATE INDEX IF NOT EXISTS tenders_code_departement_idx
  ON tenders USING gin(code_departement);

CREATE INDEX IF NOT EXISTS tenders_cpv_codes_idx
  ON tenders USING gin(cpv_codes);
