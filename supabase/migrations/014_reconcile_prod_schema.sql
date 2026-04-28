-- ════════════════════════════════════════════════════════════════════════════
-- Migration 014 — Réconciliation schéma versionné ↔ prod
--
-- Cette migration reconcilie le schéma versionné avec la prod existante.
-- Elle est IDEMPOTENTE et NE DÉTRUIT AUCUNE DONNÉE.
--
-- Contexte (audit 2026-04-26) :
-- - Les tables `organizations`, `organization_members`, `tender_dce` ont été
--   créées directement en prod via le SQL Editor de Supabase (probablement
--   migration 005 désormais disparue du repo). Cette migration les
--   "rattrape" dans le schéma versionné.
-- - Les colonnes `organization_id` sur `profiles`, `references`,
--   `collaborateurs`, `appels_offres` ont été ajoutées en prod sans
--   migration tracée. Cette migration les recrée avec `ADD COLUMN IF NOT
--   EXISTS`. Les anciennes colonnes (`profile_id`, `intitule_marche`, etc.)
--   ne sont PAS supprimées — à valider/nettoyer dans une migration
--   ultérieure après vérification que rien ne les utilise.
-- - Les fonctions helper `get_user_org_id()` / `is_org_admin()` sont
--   recréées avec `CREATE OR REPLACE`.
-- - Les RLS policies basées sur `profile_id = auth.uid()` (de la migration
--   001) sont droppées et remplacées par les policies prod basées sur
--   `organization_id = get_user_org_id()`.
--
-- Ce qui N'EST PAS touché ici :
-- - Les 4 policies du bucket Storage `documents` créées par la migration
--   013 (`documents_select_org_members`, `documents_insert_org_members`,
--   `documents_update_org_members`, `documents_delete_org_members`).
-- - La policy `dce_select_org_members` du bucket `dce` (migration 011).
--
-- ⚠️ Limite connue — fresh DB :
-- Sur un environnement neuf, la séquence `001 → 013 → 014` ÉCHOUE car
-- `001_add_tenders.sql` référence `organizations(id)` qui n'est créée
-- qu'ici. Pour reconstruire la prod à partir de zéro, exécuter dans
-- l'ordre : 001_initial_schema → 014 (partie tables seulement) →
-- 001_add_tenders → 002 → … → 013. Cette dette sera corrigée dans une
-- migration de réorganisation ultérieure (renommage chronologique global).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Tables manquantes ──────────────────────────────────────────────────

-- 1.1 organizations
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 1.2 organization_members
CREATE TABLE IF NOT EXISTS organization_members (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  role            TEXT        NOT NULL DEFAULT 'member'
                                CHECK (role IN ('admin', 'member')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- 1.3 tender_dce
CREATE TABLE IF NOT EXISTS tender_dce (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_idweb    TEXT        NOT NULL,
  organization_id UUID        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',
  documents       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  ao_id           UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  apify_run_id    TEXT,
  apify_run_at    TIMESTAMPTZ,
  apify_error     TEXT,
  CONSTRAINT tender_dce_unique UNIQUE (tender_idweb, organization_id)
);

-- ─── 2. Colonnes organization_id sur tables existantes ─────────────────────
-- Ces colonnes existent déjà en prod (rattrapage versioning).
-- Pas de DROP des anciennes colonnes (profile_id, etc.) sans validation.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- profiles.organization_id est UNIQUE en prod (1 profile = 1 organization)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_organization_id_key'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_organization_id_key UNIQUE (organization_id);
  END IF;
END $$;

ALTER TABLE "references"
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE collaborateurs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE appels_offres
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Colonnes prod sur appels_offres absentes des migrations versionnées
ALTER TABLE appels_offres
  ADD COLUMN IF NOT EXISTS tender_idweb        TEXT,
  ADD COLUMN IF NOT EXISTS url_avis            TEXT,
  ADD COLUMN IF NOT EXISTS team_members        UUID[];

-- Colonnes prod sur collaborateurs absentes des migrations versionnées
ALTER TABLE collaborateurs
  ADD COLUMN IF NOT EXISTS email       TEXT,
  ADD COLUMN IF NOT EXISTS role_metier TEXT,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();

-- Colonnes prod sur references absentes des migrations versionnées
-- (les noms diffèrent de la 001 ; on garde les colonnes prod)
ALTER TABLE "references"
  ADD COLUMN IF NOT EXISTS titre                          TEXT,
  ADD COLUMN IF NOT EXISTS client                         TEXT,
  ADD COLUMN IF NOT EXISTS annee                          INTEGER,
  ADD COLUMN IF NOT EXISTS description                    TEXT,
  ADD COLUMN IF NOT EXISTS updated_at                     TIMESTAMPTZ DEFAULT now();

-- Colonne region sur profiles (en prod, pas dans les migrations 007/009/010)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS region TEXT;

-- ─── 3. Fonctions helper RLS (rattrapage) ──────────────────────────────────

-- Note : `SET search_path = public, pg_temp` ferme un risque de
-- privilege-escalation sur les fonctions SECURITY DEFINER (cf. advisor
-- Supabase « function_search_path_mutable »).
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- ─── 4. RLS — organizations & organization_members ────────────────────────

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_dce            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_select"          ON organizations;
DROP POLICY IF EXISTS "org_update"          ON organizations;
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (id = get_user_org_id());
CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (is_org_admin());

DROP POLICY IF EXISTS "members_select"        ON organization_members;
DROP POLICY IF EXISTS "members_insert_admin"  ON organization_members;
DROP POLICY IF EXISTS "members_delete_admin"  ON organization_members;
CREATE POLICY "members_select" ON organization_members
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "members_insert_admin" ON organization_members
  FOR INSERT WITH CHECK (is_org_admin());
CREATE POLICY "members_delete_admin" ON organization_members
  FOR DELETE USING (is_org_admin());

-- tender_dce
DROP POLICY IF EXISTS "Users manage own org tender_dce" ON tender_dce;
CREATE POLICY "Users manage own org tender_dce" ON tender_dce
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- ─── 5. RLS — réconciliation des policies legacy 001 ──────────────────────
-- On drop les policies basées sur `profile_id = auth.uid()` (migration 001)
-- et on les remplace par les policies "_all" basées sur organization_id.

-- profiles
DROP POLICY IF EXISTS "Users view own profile"   ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;
DROP POLICY IF EXISTS "profiles_all"             ON profiles;
CREATE POLICY "profiles_all" ON profiles
  FOR ALL USING (organization_id = get_user_org_id());

-- references
DROP POLICY IF EXISTS "Users CRUD own references" ON "references";
DROP POLICY IF EXISTS "refs_all"                  ON "references";
CREATE POLICY "refs_all" ON "references"
  FOR ALL USING (organization_id = get_user_org_id());

-- collaborateurs
DROP POLICY IF EXISTS "Users CRUD own collaborateurs" ON collaborateurs;
DROP POLICY IF EXISTS "collabs_all"                   ON collaborateurs;
CREATE POLICY "collabs_all" ON collaborateurs
  FOR ALL USING (organization_id = get_user_org_id());

-- appels_offres
DROP POLICY IF EXISTS "Users CRUD own AO" ON appels_offres;
DROP POLICY IF EXISTS "ao_all"            ON appels_offres;
CREATE POLICY "ao_all" ON appels_offres
  FOR ALL USING (organization_id = get_user_org_id());

-- documents_templates : renommage de la policy 001
DROP POLICY IF EXISTS "Templates readable by all authenticated" ON documents_templates;
DROP POLICY IF EXISTS "templates_read"                          ON documents_templates;
CREATE POLICY "templates_read" ON documents_templates
  FOR SELECT TO authenticated USING (true);

-- ─── 6. Triggers updated_at — alignement sur la nomenclature prod ─────────
-- En prod : trg_<table>_updated_at. La migration 001 a créé profiles_updated_at
-- et appels_offres_updated_at. On dropée les anciens (s'ils existent) et on
-- recrée tous les triggers prod.

DROP TRIGGER IF EXISTS profiles_updated_at      ON profiles;
DROP TRIGGER IF EXISTS appels_offres_updated_at ON appels_offres;

DROP TRIGGER IF EXISTS trg_profiles_updated_at      ON profiles;
DROP TRIGGER IF EXISTS trg_appels_offres_updated_at ON appels_offres;
DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
DROP TRIGGER IF EXISTS trg_collaborateurs_updated_at ON collaborateurs;
DROP TRIGGER IF EXISTS trg_references_updated_at    ON "references";

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_appels_offres_updated_at
  BEFORE UPDATE ON appels_offres
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_collaborateurs_updated_at
  BEFORE UPDATE ON collaborateurs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_references_updated_at
  BEFORE UPDATE ON "references"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 7. Index manquants ───────────────────────────────────────────────────

-- M21 — perfs lookup favoris par tender
CREATE INDEX IF NOT EXISTS idx_tender_favorites_idweb
  ON tender_favorites(tender_idweb);

-- Perfs lookup SIRET (unique partiel : ignore NULL et chaîne vide)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_siret
  ON profiles(siret)
  WHERE siret IS NOT NULL AND siret != '';

-- Perfs filtre par deadline AO
CREATE INDEX IF NOT EXISTS idx_appels_offres_deadline
  ON appels_offres(date_limite_reponse);

-- Perfs RLS appels_offres (organization_id = get_user_org_id() à chaque requête)
CREATE INDEX IF NOT EXISTS idx_appels_offres_organization_id
  ON appels_offres(organization_id);

-- Index prod existant (idx_ao_tender_idweb) à formaliser
CREATE INDEX IF NOT EXISTS idx_appels_offres_tender_idweb
  ON appels_offres(tender_idweb);

-- Index prod existants tender_dce (rattrapage versioning)
CREATE INDEX IF NOT EXISTS idx_tender_dce_organization_id
  ON tender_dce(organization_id);

CREATE INDEX IF NOT EXISTS idx_tender_dce_tender_idweb
  ON tender_dce(tender_idweb);

-- ─── 8. Nettoyage policies "fantômes" du bucket documents ─────────────────
-- En prod ont été détectées 3 policies orphelines (`docs_select`, `docs_insert`,
-- `docs_delete`) qui font la même chose que les `documents_*_org_members` de
-- la migration 013, mais avec `get_user_org_id()` au lieu d'un sous-select
-- direct sur `organization_members`. C'est un doublon — chaque opération est
-- évaluée 2 fois (perfs) et la première policy crée un risque de désynchro
-- en cas de changement futur.
--
-- ⚠️ AVANT D'APPLIQUER : valider visuellement que ces policies sont bien
-- redondantes et non utilisées par un cas particulier (signed URLs, etc.).
-- Si tu veux les conserver, commente cette section avant de pousser.

DROP POLICY IF EXISTS "docs_select" ON storage.objects;
DROP POLICY IF EXISTS "docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "docs_delete" ON storage.objects;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Fin migration 014.
--
-- Pour vérifier post-application :
--   SELECT * FROM pg_policies WHERE schemaname IN ('public','storage')
--     AND tablename = 'objects' AND policyname LIKE 'docs_%';
--   -- doit renvoyer 0 ligne
--
--   SELECT COUNT(*) FROM organizations;          -- doit rester = 10
--   SELECT COUNT(*) FROM organization_members;   -- doit rester = 15
--   SELECT COUNT(*) FROM tender_dce;             -- doit rester = 24
-- ════════════════════════════════════════════════════════════════════════════
