-- Migration 034 — ajouter colonnes credits_remaining_usd + spent_30d_usd à api_usage_snapshots
--
-- Rollback :
--   ALTER TABLE public.api_usage_snapshots DROP COLUMN IF EXISTS credits_remaining_usd, DROP COLUMN IF EXISTS spent_30d_usd;

ALTER TABLE public.api_usage_snapshots
  ADD COLUMN IF NOT EXISTS credits_remaining_usd numeric,
  ADD COLUMN IF NOT EXISTS spent_30d_usd numeric;
