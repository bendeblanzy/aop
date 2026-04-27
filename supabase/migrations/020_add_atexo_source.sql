-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 020 — Ajout de la source 'atexo' (Atexo MPE : PLACE + Maximilien)
--
-- Atexo MPE est le profil acheteur sous-jacent à plusieurs plateformes
-- nationales :
--   - PLACE       : marches-publics.gouv.fr (Plateforme des Achats de l'État)
--   - Maximilien  : marches.maximilien.fr (Portail des marchés franciliens)
--   - Et d'autres profils acheteurs régionaux ou sectoriels
--
-- Ces plateformes ne sont pas couvertes par BOAMP (MAPA < 90 K€ HT) et ne
-- publient pas systématiquement au TED. Les annonces Atexo utilisent un idweb
-- préfixé "atx-{provider}-{ref}" (ex: atx-place-2025-0154-00-00-MPF).
--
-- Date : 2026-04-27
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenders DROP CONSTRAINT IF EXISTS tenders_source_check;
ALTER TABLE tenders
  ADD CONSTRAINT tenders_source_check CHECK (source IN ('boamp', 'ted', 'atexo'));

COMMENT ON COLUMN tenders.source IS
  'Provenance de l''annonce : "boamp" (Bulletin Officiel), "ted" (Tenders Electronic Daily UE) ou "atexo" (Atexo MPE — PLACE, Maximilien, etc.).';
