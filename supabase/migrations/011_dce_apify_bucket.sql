-- Migration 011 — Bucket Storage 'dce' + suivi Apify sur tender_dce
-- ADDITIF UNIQUEMENT : n'affecte pas les tables/colonnes existantes

-- 1. Créer le bucket 'dce' pour stocker les fichiers téléchargés par l'acteur Apify
--    (séparé du bucket 'documents' qui sert aux pièces de l'entreprise)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dce',
  'dce',
  false,
  104857600, -- 100 MB max par fichier
  ARRAY['application/zip', 'application/pdf', 'application/octet-stream',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- Politique : lecture autorisée aux membres de l'organisation propriétaire
-- (le chemin du fichier commence par organization_id/)
CREATE POLICY IF NOT EXISTS "dce_select_org_members" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'dce'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Politique : insertion autorisée uniquement via service_role (l'acteur Apify)
-- Pas de politique INSERT pour les utilisateurs authentifiés : l'acteur écrit en service_role

-- 2. Ajouter les colonnes de suivi Apify sur tender_dce (si pas déjà là)
ALTER TABLE tender_dce
  ADD COLUMN IF NOT EXISTS apify_run_id    TEXT,
  ADD COLUMN IF NOT EXISTS apify_run_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apify_error     TEXT;

COMMENT ON COLUMN tender_dce.apify_run_id  IS 'ID du run Apify qui a téléchargé ce DCE';
COMMENT ON COLUMN tender_dce.apify_run_at  IS 'Date/heure du déclenchement du run Apify';
COMMENT ON COLUMN tender_dce.apify_error   IS 'Message d''erreur si le run Apify a échoué';
