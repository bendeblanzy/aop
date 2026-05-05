-- Migration 031 — passer tenders.valeur_estimee de INTEGER à BIGINT
-- pour accepter les marchés > 2,1 Md € (ex AO 26-31152 à 2,45 Md €).
--
-- Rollback :
--   ALTER TABLE public.tenders ALTER COLUMN valeur_estimee TYPE integer USING valeur_estimee::integer;
--   (peut échouer si une valeur > INT_MAX existe — vérifier avant)

ALTER TABLE public.tenders
  ALTER COLUMN valeur_estimee TYPE bigint USING valeur_estimee::bigint;
