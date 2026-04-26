-- Migration 013 — Durcissement RLS du bucket Storage 'documents'
--
-- ─── Problème corrigé ────────────────────────────────────────────────────────
-- La migration 007 a créé des policies trop permissives sur le bucket
-- 'documents' :
--   - SELECT : USING (bucket_id = 'documents')
--     → tout user authentifié pouvait lire les documents de TOUTES les orgs.
--   - INSERT : WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated')
--     → tout user authentifié pouvait écrire dans n'importe quel dossier.
--   - DELETE : USING (bucket_id = 'documents' AND auth.role() = 'authenticated')
--     → tout user authentifié pouvait supprimer n'importe quel fichier.
--
-- ─── Convention de chemin (vérifiée 2026-04-26) ──────────────────────────────
-- Tous les uploads vers 'documents' utilisent le path `<organization_id>/<file>`
-- (cf. src/app/(app)/profil/page.tsx ligne ~166).
-- Donc `(storage.foldername(name))[1]` = organization_id pour tous les fichiers
-- existants → on peut filtrer par appartenance à l'org sans migration de
-- données.
--
-- ─── Modèle ──────────────────────────────────────────────────────────────────
-- Même pattern que la policy SELECT du bucket 'dce' (migration 011).
--
-- ─── Note : bucket public ────────────────────────────────────────────────────
-- Le bucket 'documents' est encore créé en `public: true` (migration 007).
-- La RLS ci-dessous protège uniquement les accès via l'API Supabase
-- (signed URLs, list, download authentifié). Les URLs publiques restent
-- accessibles à quiconque connaît le chemin. Si ces documents (CV / dossier
-- de capacités) sont confidentiels, envisager de basculer le bucket en privé
-- dans une migration séparée.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop des policies trop laxistes de la migration 007
DROP POLICY IF EXISTS "org_members_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "org_members_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "org_members_documents_delete" ON storage.objects;

-- 2. Recréation avec filtre par organization_id (premier segment du path)

-- SELECT : seuls les membres de l'org propriétaire peuvent lire
CREATE POLICY "documents_select_org_members" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- INSERT : seuls les membres de l'org propriétaire peuvent uploader dans son dossier
CREATE POLICY "documents_insert_org_members" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- UPDATE : nécessaire pour que `upsert: true` côté supabase-js fonctionne
-- (l'upload avec upsert effectue un UPDATE si le fichier existe déjà).
CREATE POLICY "documents_update_org_members" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- DELETE : seuls les membres de l'org propriétaire peuvent supprimer
CREATE POLICY "documents_delete_org_members" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
