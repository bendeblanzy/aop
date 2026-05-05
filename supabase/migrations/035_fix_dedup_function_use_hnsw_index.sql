-- Migration 035 — fix mark_ted_boamp_duplicates : LATERAL JOIN + index HNSW
--
-- Avant : CROSS JOIN naïf t × b sur tous les embeddings 1536d → O(N×M)
-- → "canceling statement due to statement timeout" sur Supabase (8s par défaut).
--
-- Après : LATERAL JOIN avec ORDER BY embedding <=> + LIMIT 1 par TED
-- qui exploite l'index HNSW idx_tenders_embedding_hnsw → O(N log M).
-- + statement_timeout = 5min sur la fonction (au cas où).
--
-- Rollback : revoir migration 022 pour la version d'origine.

CREATE OR REPLACE FUNCTION public.mark_ted_boamp_duplicates(
  sim_threshold double precision DEFAULT 0.95
)
RETURNS integer
LANGUAGE plpgsql
SET statement_timeout = '5min'
AS $$
DECLARE
  marked_count integer := 0;
BEGIN
  UPDATE public.tenders
  SET duplicate_of = NULL
  WHERE source = 'ted' AND duplicate_of IS NOT NULL;

  WITH best_matches AS (
    SELECT
      t.idweb   AS ted_idweb,
      b.idweb   AS boamp_idweb,
      1 - (t.embedding <=> b.embedding) AS sim
    FROM public.tenders t
    CROSS JOIN LATERAL (
      SELECT idweb, embedding
      FROM public.tenders b2
      WHERE b2.source = 'boamp' AND b2.embedding IS NOT NULL
      ORDER BY b2.embedding <=> t.embedding
      LIMIT 1
    ) b
    WHERE t.source = 'ted'
      AND t.embedding IS NOT NULL
      AND 1 - (t.embedding <=> b.embedding) > sim_threshold
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
  'et marque leur colonne duplicate_of. Utilise LATERAL JOIN + index HNSW pour '
  'rester sous le statement_timeout. Retourne le nombre de notices marquées.';
