-- Migration 010: LinkedIn pour collaborateurs + pas_de_sous_traitants pour profils
-- Date: 2026-04-08

-- Ajouter le champ linkedin_url sur les collaborateurs
ALTER TABLE collaborateurs ADD COLUMN IF NOT EXISTS linkedin_url text;

-- Ajouter le flag "pas de sous-traitants" sur les profils
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pas_de_sous_traitants boolean DEFAULT false;
