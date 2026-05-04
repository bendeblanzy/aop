-- Migration 029 — P2 backoffice : bug_reports + error_logs (Sentry-light interne)
--
-- Rollback :
--   DROP TABLE IF EXISTS public.bug_reports CASCADE;
--   DROP TABLE IF EXISTS public.error_logs CASCADE;
--   DROP FUNCTION IF EXISTS public.touch_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Table bug_reports
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_email  text          NOT NULL,
  title           text,
  description     text          NOT NULL,
  url             text,
  user_agent      text,
  status          text          NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new', 'in_progress', 'resolved', 'wontfix')),
  severity        text          NOT NULL DEFAULT 'medium'
                                CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved_at     timestamptz,
  resolved_by     uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           text,
  metadata        jsonb,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bug_reports_status_created_idx
  ON public.bug_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS bug_reports_reporter_idx
  ON public.bug_reports (reporter_user_id);

COMMENT ON TABLE public.bug_reports IS
  'Signalements de bugs faits par les utilisateurs via le bouton flottant.';

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bug_reports_select_super_admin" ON public.bug_reports;
CREATE POLICY "bug_reports_select_super_admin"
  ON public.bug_reports FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "bug_reports_select_own" ON public.bug_reports;
CREATE POLICY "bug_reports_select_own"
  ON public.bug_reports FOR SELECT TO authenticated
  USING (reporter_user_id = auth.uid());

-- INSERT/UPDATE bypass via adminClient côté API.

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Table error_logs (Sentry-light interne)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.error_logs (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  level           text          NOT NULL DEFAULT 'error'
                                CHECK (level IN ('warn', 'error', 'fatal')),
  message         text          NOT NULL,
  stack           text,
  source          text,
  user_id         uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  url             text,
  metadata        jsonb,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS error_logs_created_idx
  ON public.error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS error_logs_level_created_idx
  ON public.error_logs (level, created_at DESC);

CREATE INDEX IF NOT EXISTS error_logs_source_created_idx
  ON public.error_logs (source, created_at DESC);

COMMENT ON TABLE public.error_logs IS
  'Erreurs serveur loggées via logError() — visible super_admin only. Alternative légère à Sentry.';

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "error_logs_select_super_admin" ON public.error_logs;
CREATE POLICY "error_logs_select_super_admin"
  ON public.error_logs FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Trigger updated_at sur bug_reports
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bug_reports_touch_updated_at ON public.bug_reports;
CREATE TRIGGER bug_reports_touch_updated_at
  BEFORE UPDATE ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
