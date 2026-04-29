-- 023_claude_scoring_logs.sql
-- Phase 3.A — Logging Tier 2 Claude
--
-- Persiste chaque appel Tier 2 du scoring (model, latence, tokens, score in/out,
-- raison renvoyée par Claude). Sert à :
--   - mesurer la stabilité du scoring dans le temps (a-t-il dérivé ?)
--   - alimenter Phase 3.B (calibration auto) avec des données réelles
--   - auditer les explications Claude que voit l'utilisateur
--
-- Insert "fire-and-forget" : aucune lecture critique, l'échec d'insert ne doit
-- jamais bloquer le retour de score à l'utilisateur.

CREATE TABLE IF NOT EXISTS claude_scoring_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_idweb    varchar NOT NULL,
  -- score vectoriel (Tier 1) en entrée
  score_in        smallint NOT NULL,
  -- score Claude (Tier 2) en sortie
  score_out       smallint NOT NULL,
  -- similarité cosinus brute (0-1) au moment du Tier 1
  similarity      real,
  -- raison courte renvoyée par Claude (max ~130 chars)
  raison          text,
  -- modèle utilisé (sonnet / haiku / autre)
  model           text NOT NULL,
  latency_ms      integer,
  tokens_in       integer,
  tokens_out      integer,
  -- hash SHA256 du prompt système, pour détecter les changements de prompt
  prompt_hash     varchar(64),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index pour les analyses temporelles par org
CREATE INDEX IF NOT EXISTS idx_claude_scoring_logs_org_created
  ON claude_scoring_logs(organization_id, created_at DESC);

-- Index pour retrouver l'historique d'un tender donné (audit)
CREATE INDEX IF NOT EXISTS idx_claude_scoring_logs_tender
  ON claude_scoring_logs(tender_idweb, created_at DESC);

-- Index pour la calibration auto (Phase 3.B)
CREATE INDEX IF NOT EXISTS idx_claude_scoring_logs_org_score
  ON claude_scoring_logs(organization_id, score_out);

ALTER TABLE claude_scoring_logs ENABLE ROW LEVEL SECURITY;

-- Lecture : seuls les membres de l'org peuvent voir leurs propres logs
DROP POLICY IF EXISTS "claude_scoring_logs_org_read" ON claude_scoring_logs;
CREATE POLICY "claude_scoring_logs_org_read" ON claude_scoring_logs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Pas de policy WRITE — l'insertion passe exclusivement par adminClient
-- (service_role bypass RLS).

COMMENT ON TABLE claude_scoring_logs IS
  'Phase 3.A — Trace de chaque appel Tier 2 Claude pour audit et calibration auto.';
