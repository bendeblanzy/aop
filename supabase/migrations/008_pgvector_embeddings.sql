-- Phase vectorisation : pgvector pour scoring sémantique

-- 1. Activer l'extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Ajouter colonne embedding aux tenders (1536 dimensions = text-embedding-3-small)
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Ajouter colonne embedding aux profiles (embedding de l'activite_metier)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

-- 4. Index HNSW pour recherche de similarité rapide sur tenders
CREATE INDEX IF NOT EXISTS idx_tenders_embedding_hnsw
  ON tenders USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. Fonction de matching vectoriel : retourne les tenders les plus proches d'un profil
CREATE OR REPLACE FUNCTION match_tenders_by_embedding(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 100,
  filter_codes text[] DEFAULT NULL
)
RETURNS TABLE (
  idweb varchar(64),
  objet text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    t.idweb,
    t.objet,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM tenders t
  WHERE t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
    AND (filter_codes IS NULL OR t.descripteur_codes && filter_codes)
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 6. Vue pour suivre l'état des embeddings
CREATE OR REPLACE VIEW embedding_stats AS
SELECT
  'tenders' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(embedding) AS embedded_rows,
  COUNT(*) - COUNT(embedding) AS missing_rows,
  ROUND(100.0 * COUNT(embedding) / GREATEST(COUNT(*), 1), 1) AS pct_embedded
FROM tenders
UNION ALL
SELECT
  'profiles',
  COUNT(*),
  COUNT(embedding),
  COUNT(*) - COUNT(embedding),
  ROUND(100.0 * COUNT(embedding) / GREATEST(COUNT(*), 1), 1)
FROM profiles;
