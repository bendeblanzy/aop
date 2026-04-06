import { NextResponse } from 'next/server'

/**
 * Migration 005 — Table tender_dce + champs AO
 *
 * À exécuter dans Supabase SQL Editor :
 *
 * -- 1. Table tender_dce : suivi des DCE par organisation
 * CREATE TABLE IF NOT EXISTS tender_dce (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   tender_idweb TEXT NOT NULL,
 *   organization_id UUID NOT NULL,
 *   status TEXT NOT NULL DEFAULT 'pending',
 *   documents JSONB NOT NULL DEFAULT '[]'::jsonb,
 *   ao_id UUID,
 *   notes TEXT,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   CONSTRAINT tender_dce_unique UNIQUE(tender_idweb, organization_id)
 * );
 *
 * ALTER TABLE tender_dce ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Users manage own org tender_dce" ON tender_dce
 *   FOR ALL USING (
 *     organization_id IN (
 *       SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
 *     )
 *   );
 *
 * CREATE INDEX IF NOT EXISTS idx_tender_dce_org ON tender_dce(organization_id);
 * CREATE INDEX IF NOT EXISTS idx_tender_dce_tender ON tender_dce(tender_idweb);
 *
 * -- 2. Champs supplémentaires sur appels_offres
 * ALTER TABLE appels_offres
 *   ADD COLUMN IF NOT EXISTS tender_idweb TEXT,
 *   ADD COLUMN IF NOT EXISTS url_avis TEXT,
 *   ADD COLUMN IF NOT EXISTS url_profil_acheteur TEXT;
 *
 * CREATE INDEX IF NOT EXISTS idx_ao_tender_idweb ON appels_offres(tender_idweb);
 */
export async function GET() {
  return NextResponse.json({
    status: 'pending',
    message: 'Veuillez exécuter le SQL ci-dessus dans Supabase SQL Editor',
    sql: `
CREATE TABLE IF NOT EXISTS tender_dce (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_idweb TEXT NOT NULL,
  organization_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  ao_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tender_dce_unique UNIQUE(tender_idweb, organization_id)
);

ALTER TABLE tender_dce ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own org tender_dce" ON tender_dce
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_tender_dce_org ON tender_dce(organization_id);
CREATE INDEX IF NOT EXISTS idx_tender_dce_tender ON tender_dce(tender_idweb);

ALTER TABLE appels_offres
  ADD COLUMN IF NOT EXISTS tender_idweb TEXT,
  ADD COLUMN IF NOT EXISTS url_avis TEXT,
  ADD COLUMN IF NOT EXISTS url_profil_acheteur TEXT;

CREATE INDEX IF NOT EXISTS idx_ao_tender_idweb ON appels_offres(tender_idweb);
    `.trim(),
  })
}
