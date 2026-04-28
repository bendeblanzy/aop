-- Migration 021 — Ajout du paramètre filter_source à match_tenders_by_embedding
--
-- Problème : la route /api/veille/tenders faisait 1 seul appel RPC avec pool=300.
-- Avec 3765 BOAMP embeddés vs ~382 TED+Atexo, les AO non-BOAMP étaient
-- statistiquement évincés du top 300. Cette migration ajoute filter_source pour
-- permettre 3 appels parallèles dédiés par source (pool diversifié).

CREATE OR REPLACE FUNCTION public.match_tenders_by_embedding(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 100,
  filter_codes text[] DEFAULT NULL::text[],
  filter_source text DEFAULT NULL::text
)
RETURNS TABLE(idweb character varying, objet text, similarity double precision)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    t.idweb,
    t.objet,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM tenders t
  WHERE t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
    AND (filter_codes IS NULL OR t.descripteur_codes && filter_codes)
    AND (filter_source IS NULL OR t.source = filter_source)
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
$$;
