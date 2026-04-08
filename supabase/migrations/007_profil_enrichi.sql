-- Phase 4 : Profil enrichi — nouveaux champs positionnement + documents

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS atouts_differenciants text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS methodologie_type text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cv_plaquette_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dossier_capacites_url text;

-- Bucket storage pour les documents entreprise (PDF)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Politique : membres de l'org peuvent uploader/lire
CREATE POLICY "org_members_documents_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

CREATE POLICY "org_members_documents_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "org_members_documents_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
