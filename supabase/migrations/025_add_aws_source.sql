-- Migration 025 : Ajouter 'aws' (marches-publics.info / AWSolutions MPE) à la contrainte CHECK source
-- Appliquée en prod le 2026-04-29

ALTER TABLE tenders DROP CONSTRAINT IF EXISTS tenders_source_check;
ALTER TABLE tenders ADD CONSTRAINT tenders_source_check
  CHECK (source IN ('boamp', 'ted', 'atexo', 'aws'));
