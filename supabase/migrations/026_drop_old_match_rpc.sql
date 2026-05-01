-- Migration 026 — Suppression de l'ancienne surcharge match_tenders_by_embedding (4 params)
--
-- Problème : la migration 008 a créé match_tenders_by_embedding(vector, float8, int4, text[])
-- La migration 021 a créé match_tenders_by_embedding(vector, float8, int4, text[], text)
-- via CREATE OR REPLACE FUNCTION avec une signature différente → PostgreSQL crée une 2ème
-- fonction (overload) au lieu de remplacer la 1ère.
-- Résultat : PostgREST retourne HTTP 300 (Multiple Choices) car il ne peut pas choisir
-- entre les deux surcharges, même quand filter_source est passé en paramètre.
--
-- Fix : DROP de la version 4-params. La version 5-params (migration 021) gère les deux cas :
-- filter_source NULL = pas de filtre source (comportement identique à l'ancienne version).

DROP FUNCTION IF EXISTS public.match_tenders_by_embedding(
  vector,
  double precision,
  integer,
  text[]
);
