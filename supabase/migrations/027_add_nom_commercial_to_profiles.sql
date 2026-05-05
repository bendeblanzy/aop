-- Migration 027: ajout colonne nom_commercial dans profiles
-- Utilisée dans l'onboarding étape 1 (nom de marque / nom commercial)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nom_commercial TEXT;
