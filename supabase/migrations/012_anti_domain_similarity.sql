-- Migration 012 : Pénalité anti-domaine pour le scoring
--
-- Fonction RPC qui calcule, pour une liste d'idwebs, la similarité cosinus
-- entre l'embedding de chaque tender et un embedding "anti-domaine" donné
-- (fournitures, travaux, infogérance pure, etc.).
--
-- Utilisée côté API pour pénaliser les AO qui ressemblent trop aux
-- prestations hors communication/création, et ainsi réduire les faux
-- positifs à 100% sur des AO manifestement hors scope.

-- Purge des scores cachés calibrés à l'ancienne échelle (linéaire 0.15-0.55).
-- Les prochaines consultations vont les recalculer avec la nouvelle courbe
-- (puissance 1.6, plage 0.22-0.72) qui est plus sévère.
-- Sans ça, les anciens AO afficheraient encore des scores gonflés à 100%.
DELETE FROM tender_scores;

CREATE OR REPLACE FUNCTION similarity_for_idwebs(
  query_embedding vector(1536),
  target_idwebs text[]
)
RETURNS TABLE (
  idweb varchar(64),
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    t.idweb,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM tenders t
  WHERE t.embedding IS NOT NULL
    AND t.idweb = ANY(target_idwebs);
$$;
