-- Migration 032 — Settings : api_credentials chiffré + api_alert_settings + cron_settings + sync_runs.progress
--
-- Rollback :
--   DROP TABLE IF EXISTS public.api_credentials, public.api_alert_settings, public.cron_settings CASCADE;
--   ALTER TABLE public.sync_runs DROP COLUMN IF EXISTS progress;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.api_credentials (
  provider          text          PRIMARY KEY
                                  CHECK (provider IN ('apify', 'resend', 'anthropic', 'openai', 'anthropic_admin', 'openai_admin')),
  encrypted_value   bytea,
  last_validated_at timestamptz,
  last_validation_ok boolean,
  last_validation_error text,
  updated_by        uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.api_credentials IS
  'Clés API tierces chiffrées symétriquement via pgcrypto (clé maître = env API_KEY_ENCRYPTION_SECRET).';

ALTER TABLE public.api_credentials ENABLE ROW LEVEL SECURITY;
-- Pas de SELECT autorisé même pour super_admin : on passe par adminClient (service_role).

CREATE TABLE IF NOT EXISTS public.api_alert_settings (
  provider              text          PRIMARY KEY
                                      CHECK (provider IN ('apify', 'resend', 'anthropic', 'openai')),
  threshold_pct         numeric       NOT NULL DEFAULT 80,
  threshold_usd_remaining numeric,
  enabled               boolean       NOT NULL DEFAULT true,
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.api_alert_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_alert_settings_select_super_admin" ON public.api_alert_settings;
CREATE POLICY "api_alert_settings_select_super_admin"
  ON public.api_alert_settings FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

INSERT INTO public.api_alert_settings (provider, threshold_pct) VALUES
  ('apify', 80), ('resend', 80), ('anthropic', 80), ('openai', 80)
ON CONFLICT (provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cron_settings (
  source            text          PRIMARY KEY,
  preset            text          NOT NULL DEFAULT 'daily'
                                  CHECK (preset IN ('disabled', 'daily', 'every_2h', 'every_4h', 'every_8h', 'every_12h', 'hourly')),
  daily_hour_utc    integer       DEFAULT 5 CHECK (daily_hour_utc >= 0 AND daily_hour_utc <= 23),
  enabled           boolean       NOT NULL DEFAULT true,
  updated_by        uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cron_settings_select_super_admin" ON public.cron_settings;
CREATE POLICY "cron_settings_select_super_admin"
  ON public.cron_settings FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

INSERT INTO public.cron_settings (source, preset, daily_hour_utc, enabled) VALUES
  ('boamp', 'daily', 5, true),
  ('ted', 'daily', 6, true),
  ('atexo', 'daily', 7, true),
  ('dedup', 'daily', 8, true),
  ('aws', 'daily', 9, true),
  ('embed-tenders', 'daily', 5, true),
  ('enrich-tenders', 'every_4h', 0, true),
  ('check-sync-health', 'daily', 10, true),
  ('check-api-usage', 'daily', 11, true)
ON CONFLICT (source) DO NOTHING;

ALTER TABLE public.sync_runs
  ADD COLUMN IF NOT EXISTS progress jsonb;

COMMENT ON COLUMN public.sync_runs.progress IS
  'État d''avancement temps réel : {current, total, step} — updaté par le helper withSyncRun.';

DROP TRIGGER IF EXISTS api_credentials_touch_updated_at ON public.api_credentials;
CREATE TRIGGER api_credentials_touch_updated_at BEFORE UPDATE ON public.api_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS api_alert_settings_touch_updated_at ON public.api_alert_settings;
CREATE TRIGGER api_alert_settings_touch_updated_at BEFORE UPDATE ON public.api_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS cron_settings_touch_updated_at ON public.cron_settings;
CREATE TRIGGER cron_settings_touch_updated_at BEFORE UPDATE ON public.cron_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
