-- 016_prestations_detail.sql
-- Schéma de profil enrichi : par prestation, on porte la spécificité et les
-- exclusions explicites. C'est cette structure qui débloque le matching pour
-- les profils niche ("vidéo AVEC IA" vs "vidéo en général").
--
-- prestations_detail :
--   array of { type: string, specificity: string, exclusions: string[] }
--
-- Ex: [
--   { "type": "video",
--     "specificity": "vidéo générée par IA, motion design IA",
--     "exclusions": ["captation événementielle", "tournage classique"] },
--   { "type": "formation",
--     "specificity": "IA générative, transformation numérique",
--     "exclusions": ["BAFA", "réglementaire", "sûreté"] }
-- ]
--
-- exclusions_globales :
--   liste plate de sujets/secteurs refusés transversalement.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS prestations_detail jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS exclusions_globales text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN profiles.prestations_detail IS
  'Array of {type:string, specificity:string, exclusions:string[]} — détaille chaque prestation avec sa spécificité (ce qui distingue le client) et les exclusions (ce que le client refuse).';
COMMENT ON COLUMN profiles.exclusions_globales IS
  'Liste des sujets/secteurs explicitement refusés par l''entreprise, transversaux à toutes les prestations (ex: "BTP", "armement").';
