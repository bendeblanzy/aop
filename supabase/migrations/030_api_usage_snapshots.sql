-- Migration 030 — P3 backoffice : api_usage_snapshots
-- Snapshots quotidiens de l'usage des APIs tierces (Apify, Resend, Anthropic, OpenAI).
--
-- Rollback :
--   DROP TABLE IF EXISTS public.api_usage_snapshots CASCADE;

CREATE TABLE IF NOT EXISTS public.api_usage_snapshots (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text          NOT NULL
                                CHECK (provider IN ('apify', 'resend', 'anthropic', 'openai')),
  snapshot_date   date          NOT NULL DEFAULT CURRENT_DATE,
  period_start    date,
  period_end      date,
  usage_value     numeric,
  usage_unit      text,
  limit_value     numeric,
  usage_pct       numeric,
  raw_payload     jsonb,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (provider, snapshot_date)
);

CREATE INDEX IF NOT EXISTS api_usage_provider_date_idx
  ON public.api_usage_snapshots (provider, snapshot_date DESC);

COMMENT ON TABLE public.api_usage_snapshots IS
  'Snapshots quotidiens de l''usage des APIs tierces — un row par provider/date.';

ALTER TABLE public.api_usage_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_usage_select_super_admin" ON public.api_usage_snapshots;
CREATE POLICY "api_usage_select_super_admin"
  ON public.api_usage_snapshots FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
