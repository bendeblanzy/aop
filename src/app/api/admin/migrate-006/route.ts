import { NextResponse } from 'next/server'

/**
 * Migration 006 — Sprint 2 : Import DCE universel + UX 3 phases
 *
 * Ajoute les champs analyse_bpu, phase, checklist_conformite sur appels_offres
 */
export async function GET() {
  return NextResponse.json({
    status: 'pending',
    message: 'Veuillez exécuter le SQL ci-dessous dans Supabase SQL Editor',
    sql: `
-- Migration 006: Sprint 2 — Import DCE universel + UX 3 phases

ALTER TABLE appels_offres
  ADD COLUMN IF NOT EXISTS analyse_bpu JSONB,
  ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'comprendre',
  ADD COLUMN IF NOT EXISTS checklist_conformite JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN appels_offres.analyse_bpu IS 'Analyse IA du BPU/DPGF : postes, unités, quantités, prix unitaires';
COMMENT ON COLUMN appels_offres.phase IS 'Phase UX courante : comprendre, preparer, deposer';
COMMENT ON COLUMN appels_offres.checklist_conformite IS 'Checklist de conformité finale : [{item, fait}]';
    `.trim(),
  })
}
