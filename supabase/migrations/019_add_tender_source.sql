-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 019 — Ajout colonne `source` à la table tenders
--
-- Permet d'identifier la provenance de chaque annonce (BOAMP, TED, ...) afin
-- d'élargir la veille au-delà du seul BOAMP. Les annonces TED utilisent un
-- idweb préfixé "ted-{publication-number}" pour éviter toute collision avec
-- les idweb BOAMP (numériques courts).
--
-- Date : 2026-04-27
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'boamp';

-- Backfill : toutes les annonces existantes proviennent de BOAMP
UPDATE tenders SET source = 'boamp' WHERE source IS NULL OR source = '';

-- Contrainte de validation
ALTER TABLE tenders
  DROP CONSTRAINT IF EXISTS tenders_source_check;
ALTER TABLE tenders
  ADD CONSTRAINT tenders_source_check CHECK (source IN ('boamp', 'ted'));

-- Index pour filtrer rapidement par source
CREATE INDEX IF NOT EXISTS idx_tenders_source ON tenders (source);
CREATE INDEX IF NOT EXISTS idx_tenders_source_dateparution
  ON tenders (source, dateparution DESC);

COMMENT ON COLUMN tenders.source IS
  'Provenance de l''annonce : "boamp" (Bulletin Officiel) ou "ted" (Tenders Electronic Daily UE).';
