-- ============================================================
-- Migration 003 — Favoris tenders
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS tender_favorites (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_idweb    VARCHAR(64) NOT NULL,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tender_idweb, organization_id)
);

CREATE INDEX IF NOT EXISTS tender_favorites_org_idx
  ON tender_favorites (organization_id, created_at DESC);

-- RLS
ALTER TABLE tender_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tender_favorites_select_own" ON tender_favorites
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tender_favorites_insert_own" ON tender_favorites
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tender_favorites_delete_own" ON tender_favorites
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
