-- 017_calibration_feedback.sql
-- Table de feedback utilisateur sur des AO échantillonnés.
-- Sert à calibrer empiriquement le matching : l'utilisateur note ✓/?/✗ sur 5 AO
-- présentés en onboarding ou dans /profil, et ce feedback alimente
-- exclusions_globales et permet d'ajuster les seuils de score.

CREATE TABLE IF NOT EXISTS tender_calibration_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_idweb varchar NOT NULL REFERENCES tenders(idweb) ON DELETE CASCADE,
  verdict text NOT NULL CHECK (verdict IN ('match', 'maybe', 'no')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, tender_idweb)
);

CREATE INDEX IF NOT EXISTS idx_tender_calibration_org ON tender_calibration_feedback(organization_id);
CREATE INDEX IF NOT EXISTS idx_tender_calibration_verdict ON tender_calibration_feedback(organization_id, verdict);

ALTER TABLE tender_calibration_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calibration_org_read" ON tender_calibration_feedback;
CREATE POLICY "calibration_org_read" ON tender_calibration_feedback
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "calibration_org_write" ON tender_calibration_feedback;
CREATE POLICY "calibration_org_write" ON tender_calibration_feedback
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

COMMENT ON TABLE tender_calibration_feedback IS
  'Feedback utilisateur sur des AO échantillonnés — sert à calibrer le matching et alimenter exclusions_globales du profil.';
