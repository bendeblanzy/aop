-- Migration 026 : enrichment service (LinkedIn + site web + recherche web)
--
-- Ajoute à la table profiles les colonnes nécessaires pour stocker les sources
-- de l'enrichissement et le contexte structuré que Claude produit en agrégeant
-- ces sources. Ce contexte est ensuite consommé partout dans l'app : pré-remplissage
-- onboarding, scoring veille, suggestion de codes BOAMP, génération mémoire.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS enrichment_context jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_sources jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_version integer DEFAULT 1;

COMMENT ON COLUMN public.profiles.linkedin_url IS 'URL LinkedIn de l''entreprise (ex: https://www.linkedin.com/company/xxx).';
COMMENT ON COLUMN public.profiles.website_url IS 'URL du site web officiel de l''entreprise (optionnel).';
COMMENT ON COLUMN public.profiles.enrichment_context IS 'Objet structuré produit par enrichmentService : spécialité, clients_types, exclusions_metier, etc. Schéma défini dans src/lib/enrichment/types.ts.';
COMMENT ON COLUMN public.profiles.enrichment_at IS 'Timestamp du dernier enrichissement réussi. Utilisé pour le cache TTL (30j par défaut).';
COMMENT ON COLUMN public.profiles.enrichment_sources IS 'Statut par source : {"linkedin":"ok|fail|skip","website":"ok|fail|skip","web_search":"ok|fail|skip"}. Sert au scoring de confiance.';
COMMENT ON COLUMN public.profiles.enrichment_version IS 'Version du schéma enrichment_context. Incrémenter quand on change le format pour invalider le cache.';
