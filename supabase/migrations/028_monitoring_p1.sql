-- Migration 028 — Monitoring backoffice P1 : sync_runs + super_admin flag
--
-- 1. Table sync_runs : journal des exécutions des cron de sync (boamp, ted, atexo,
--    aws, dedup, embed-tenders, enrich-tenders) + check-sync-health.
-- 2. Helper SQL is_super_admin(uuid) — lit le flag dans auth.users.raw_user_meta_data.
-- 3. RLS sur sync_runs : SELECT pour super_admins, write réservé au service_role.
--
-- Rollback :
--   DROP TABLE IF EXISTS public.sync_runs CASCADE;
--   DROP FUNCTION IF EXISTS public.is_super_admin(uuid);
--   UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data - 'is_super_admin'
--     WHERE raw_user_meta_data ? 'is_super_admin';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Table sync_runs
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text          NOT NULL,
  status          text          NOT NULL DEFAULT 'running'
                                CHECK (status IN ('running', 'success', 'partial', 'failed')),
  started_at      timestamptz   NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  duration_ms     integer,
  fetched         integer       NOT NULL DEFAULT 0,
  inserted        integer       NOT NULL DEFAULT 0,
  updated         integer       NOT NULL DEFAULT 0,
  errors          integer       NOT NULL DEFAULT 0,
  error_messages  jsonb,
  triggered_by    text          NOT NULL DEFAULT 'cron',  -- 'cron' | 'manual:<email>'
  metadata        jsonb,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_runs_source_started_idx
  ON public.sync_runs (source, started_at DESC);

CREATE INDEX IF NOT EXISTS sync_runs_status_started_idx
  ON public.sync_runs (status, started_at DESC);

COMMENT ON TABLE public.sync_runs IS
  'Journal d''exécution des cron jobs de synchronisation et d''enrichissement.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Helper is_super_admin
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (raw_user_meta_data->>'is_super_admin')::boolean
       FROM auth.users
      WHERE id = uid),
    false
  );
$$;

COMMENT ON FUNCTION public.is_super_admin(uuid) IS
  'Retourne true si l''utilisateur a le flag plateforme is_super_admin = true.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS sur sync_runs
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_runs_select_super_admin" ON public.sync_runs;
CREATE POLICY "sync_runs_select_super_admin"
  ON public.sync_runs
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- INSERT/UPDATE/DELETE : aucune policy → bloqué pour authenticated.
-- Les writes passent par adminClient (service_role) qui bypass les RLS.

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Promotion super_admin pour Benjamin (staging + prod)
--    Idempotent : on merge le flag dans raw_user_meta_data.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE auth.users
   SET raw_user_meta_data =
       COALESCE(raw_user_meta_data, '{}'::jsonb)
       || jsonb_build_object('is_super_admin', true)
 WHERE email = 'benjamindeblanzy@ladngroupe.com';
