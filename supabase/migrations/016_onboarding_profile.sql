-- Migration 016 : Onboarding profil enrichi + scoring hybride

-- Nouvelles colonnes profil issues de l'onboarding
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_methodology        text,
  ADD COLUMN IF NOT EXISTS onboarding_answers         jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at    timestamptz;

-- Colonnes secteur/périmètre issues de l'onboarding QCM
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS prestations_types          text[],
  ADD COLUMN IF NOT EXISTS clients_types              text[],
  ADD COLUMN IF NOT EXISTS intervention_modes         text[],
  ADD COLUMN IF NOT EXISTS zone_intervention          text;
