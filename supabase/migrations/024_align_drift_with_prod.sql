-- ════════════════════════════════════════════════════════════════════════════
-- Migration 024 — Alignement du schéma versionné avec la prod (drift résiduel)
--
-- Cette migration rattrape 8 modifications appliquées en prod hors migrations
-- (probablement via SQL Editor de Supabase), détectées le 2026-04-29 lors du
-- provisioning du projet staging.
--
-- Elle est IDEMPOTENTE et NE DÉTRUIT AUCUNE DONNÉE :
--   - en prod : toutes les opérations sont no-op (les colonnes existent déjà
--     avec les types cibles)
--   - sur fresh DB / staging : crée les 2 colonnes manquantes et aligne les
--     6 types (text[]→jsonb, integer→numeric)
--
-- Sans cette migration, un futur fresh DB (re-provisioning, dev local via
-- supabase db reset, etc.) reproduit le drift constaté.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Colonnes manquantes ───────────────────────────────────────────────
ALTER TABLE appels_offres
  ADD COLUMN IF NOT EXISTS url_profil_acheteur text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS positionnement text;

-- ─── 2. Alignement des types ──────────────────────────────────────────────
-- En prod, ces colonnes ont migré de text[]/integer vers jsonb/numeric. Les
-- USING ci-dessous gèrent les 2 cas (text[] → jsonb, integer → numeric).
-- Les blocs DO empêchent toute erreur si le type est déjà aligné.

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles' AND column_name='effectif_moyen') <> 'numeric' THEN
    ALTER TABLE profiles ALTER COLUMN effectif_moyen TYPE numeric USING effectif_moyen::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles' AND column_name='certifications') <> 'jsonb' THEN
    ALTER TABLE profiles ALTER COLUMN certifications TYPE jsonb USING to_jsonb(certifications);
  END IF;

  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles' AND column_name='domaines_competence') <> 'jsonb' THEN
    ALTER TABLE profiles ALTER COLUMN domaines_competence TYPE jsonb USING to_jsonb(domaines_competence);
  END IF;

  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='collaborateurs' AND column_name='diplomes') <> 'jsonb' THEN
    ALTER TABLE collaborateurs ALTER COLUMN diplomes TYPE jsonb USING to_jsonb(diplomes);
  END IF;

  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='collaborateurs' AND column_name='certifications') <> 'jsonb' THEN
    ALTER TABLE collaborateurs ALTER COLUMN certifications TYPE jsonb USING to_jsonb(certifications);
  END IF;

  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='collaborateurs' AND column_name='competences_cles') <> 'jsonb' THEN
    ALTER TABLE collaborateurs ALTER COLUMN competences_cles TYPE jsonb USING to_jsonb(competences_cles);
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Fin migration 024.
--
-- Vérifs post-application :
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema='public'
--     AND ((table_name='profiles' AND column_name IN ('effectif_moyen','certifications','domaines_competence','positionnement'))
--       OR (table_name='collaborateurs' AND column_name IN ('diplomes','certifications','competences_cles'))
--       OR (table_name='appels_offres' AND column_name='url_profil_acheteur'));
-- ════════════════════════════════════════════════════════════════════════════
