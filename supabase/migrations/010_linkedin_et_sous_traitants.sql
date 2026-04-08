-- Migration 010: LinkedIn, bio, embedding pour collaborateurs + pas_de_sous_traitants pour profils
-- Date: 2026-04-08

-- Ajouter les champs linkedin_url, bio et embedding sur les collaborateurs
ALTER TABLE collaborateurs ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE collaborateurs ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE collaborateurs ADD COLUMN IF NOT EXISTS diplomes text[];
ALTER TABLE collaborateurs ADD COLUMN IF NOT EXISTS certifications text[];
ALTER TABLE collaborateurs ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Ajouter le flag "pas de sous-traitants" sur les profils
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pas_de_sous_traitants boolean DEFAULT false;
