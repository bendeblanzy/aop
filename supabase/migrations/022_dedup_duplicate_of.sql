-- Migration 022 : Déduplication multi-source
-- Ajoute la colonne `duplicate_of` sur la table tenders + fonction de marquage
-- + mise à jour de la RPC match_tenders_by_embedding pour filtrer les doublons.
--
-- Contexte (2026-04-29, P9 session V4) :
--   L'overlap BOAMP/TED mesuré le 2026-04-29 montre ~56 enregistrements TED (sur 964)
--   qui sont des doublons d'une notice BOAMP (cosine similarity > 0.95 sur les embeddings).
--   Ces doublons parasitent le pool TED=60 de la route /api/veille/tenders.
--
-- Stratégie :
--   1. Colonne `duplicate_of TEXT` = idweb de la notice de référence (BOAMP en priorité)
--   2. Fonction `mark_ted_boamp_duplicates(threshold)` — appelée par le cron sync-dedup
--   3. RPC mise à jour : filtre `duplicate_of IS NULL` sauf si l'utilisateur
--      sélectionne explicitement une source (filter_source IS NOT NULL → on montre tout)

-- ─── 1. Colonne duplicate_of ─────────────────────────────────────────────────
ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS duplicate_of TEXT DEFAULT NULL
    REFERENCES public.tenders(idweb) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

COMMENT ON COLUMN public.tenders.duplicate_of IS
  'idweb de la notice canonique dont cet enregistrement est un doublon '
  '(ex: un TED qui a un équivalent BOAMP). NULL = notice originale. '
  'Calculé par mark_ted_boamp_duplicates() via le cron sync-dedup.';

-- ─── 2. Fonction de marquage ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_ted_boamp_duplicates(
  sim_threshold double precision DEFAULT 0.95
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  marked_count integer := 0;
BEGIN
  -- a. Réinitialise les marques existantes sur les notices TED
  UPDATE public.tenders
  SET duplicate_of = NULL
  WHERE source = 'ted'
    AND duplicate_of IS NOT NULL;

  -- b. Pour chaque notice TED, trouve la meilleure correspondance BOAMP
  --    (cosine similarity sur les embeddings text-embedding-3-small 1536d).
  --    On prend le DISTINCT ON pour ne garder qu'un seul BOAMP par TED.
  WITH best_matches AS (
    SELECT DISTINCT ON (t.idweb)
      t.idweb   AS ted_idweb,
      b.idweb   AS boamp_idweb,
      1 - (t.embedding <=> b.embedding) AS sim
    FROM public.tenders t
    CROSS JOIN public.tenders b
    WHERE t.source = 'ted'
      AND b.source = 'boamp'
      AND t.embedding IS NOT NULL
      AND b.embedding IS NOT NULL
      AND 1 - (t.embedding <=> b.embedding) > sim_threshold
    ORDER BY t.idweb, sim DESC
  )
  UPDATE public.tenders tnd
  SET    duplicate_of = bm.boamp_idweb
  FROM   best_matches bm
  WHERE  tnd.idweb = bm.ted_idweb;

  GET DIAGNOSTICS marked_count = ROW_COUNT;
  RETURN marked_count;
END;
$$;

COMMENT ON FUNCTION public.mark_ted_boamp_duplicates IS
  'Identifie les notices TED qui ont un équivalent BOAMP (cosine sim > threshold) '
  'et marque leur colonne duplicate_of. Appelée par le cron /api/cron/sync-dedup. '
  'Retourne le nombre de notices marquées.';

-- ─── 3. Mise à jour de la RPC match_tenders_by_embedding ────────────────────
--
-- On ajoute `AND (t.duplicate_of IS NULL OR filter_source IS NOT NULL)` :
--   - Sans filtre source (veille globale) → exclut les doublons TED/Atexo.
--   - Avec filtre source (ex: user clique "TED EU") → montre tout, y compris
--     les notices qui existent aussi sur BOAMP (contexte : l'utilisateur veut
--     voir les avis TED tels quels).
CREATE OR REPLACE FUNCTION public.match_tenders_by_embedding(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.3,
  match_count      integer          DEFAULT 100,
  filter_codes     text[]           DEFAULT NULL::text[],
  filter_source    text             DEFAULT NULL::text
)
RETURNS TABLE(
  idweb      character varying,
  objet      text,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    t.idweb,
    t.objet,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM public.tenders t
  WHERE t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
    AND (filter_codes  IS NULL OR t.descripteur_codes && filter_codes)
    AND (filter_source IS NULL OR t.source = filter_source)
    -- Exclure les doublons sauf si l'utilisateur a sélectionné une source explicitement
    AND (t.duplicate_of IS NULL OR filter_source IS NOT NULL)
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
$$;
