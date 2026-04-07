-- ============================================================
-- Migration 002 — Ajout URL profil acheteur (lien DCE)
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================================

-- Ajoute la colonne url_profil_acheteur à la table tenders
-- Ce champ contient le lien vers la plateforme de dématérialisation
-- où le DCE complet (RC, CCTP, BPU, etc.) est téléchargeable.
ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS url_profil_acheteur TEXT;

-- Index optionnel pour identifier les tenders avec/sans lien DCE
CREATE INDEX IF NOT EXISTS tenders_url_profil_acheteur_idx
  ON tenders ((url_profil_acheteur IS NOT NULL));
