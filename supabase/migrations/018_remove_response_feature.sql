-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 018 — Suppression des colonnes liées à la fonctionnalité "réponse"
--
-- Le produit se concentre désormais uniquement sur la veille / recherche d'AO.
-- Toute la mécanique de génération de DC1/DC2/DUME/mémoire technique a été
-- retirée. Les colonnes ci-dessous deviennent donc inutiles.
--
-- Date : 2026-04-27
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE appels_offres
  DROP COLUMN IF EXISTS fichiers_source,
  DROP COLUMN IF EXISTS analyse_rc,
  DROP COLUMN IF EXISTS analyse_cctp,
  DROP COLUMN IF EXISTS analyse_bpu,
  DROP COLUMN IF EXISTS documents_generes,
  DROP COLUMN IF EXISTS references_selectionnees,
  DROP COLUMN IF EXISTS collaborateurs_selectionnes,
  DROP COLUMN IF EXISTS phase,
  DROP COLUMN IF EXISTS checklist_conformite;

-- NB : on conserve les statuts existants ('brouillon' | 'en_cours' | 'analyse'
-- | 'genere' | 'soumis' | 'archive') pour ne pas casser les anciens AO. Une
-- migration ultérieure pourra les simplifier en ('en_cours' | 'soumis' | 'archive').

COMMENT ON TABLE appels_offres IS
  'Suivi d''AO. Champs de réponse retirés (migration 018). L''app se concentre désormais uniquement sur la veille.';
