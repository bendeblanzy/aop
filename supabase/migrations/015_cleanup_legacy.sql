-- ════════════════════════════════════════════════════════════════════════════
-- Migration 015 — Cleanup legacy + durcissement security advisors
--
-- Cette migration finalise la réconciliation amorcée par la 014. Elle est
-- IDEMPOTENTE et NE DÉTRUIT AUCUNE DONNÉE en prod (toutes les colonnes
-- legacy y ont déjà été nettoyées via la migration 005 disparue).
-- Sa raison d'être :
--   1. Sur un fresh DB, garantir que les colonnes obsolètes créées par la
--      migration 001 (profile_id, intitule_marche, acheteur_public,
--      annee_execution, description_prestations…) soient bien supprimées
--      au profit des colonnes prod (organization_id, titre, client, annee,
--      description). Toutes les opérations utilisent IF EXISTS.
--   2. Fermer 4 advisors Supabase préexistants (function_search_path_mutable
--      + security_definer_view) sur 3 fonctions et 1 vue.
--
-- Audit code (2026-04-26, prompt session 015) :
-- - `r.intitule_marche`/`r.acheteur_public`/`r.annee_execution` n'étaient
--   plus utilisés que dans `aop/src/lib/documents/docx-generator.ts`
--   lignes 427-429 (bug latent : ces champs n'existaient même plus en
--   prod). Le code a été corrigé pour utiliser `r.titre`/`r.client`/
--   `r.annee` dans le même commit que cette migration.
-- - `profile_id` : aucune référence dans `aop/src/`. Safe à dropper.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Cleanup colonnes legacy (no-op en prod, dropée sur fresh DB) ──────
-- Les FOREIGN KEY associées à `profile_id` tombent automatiquement avec
-- `DROP COLUMN ... CASCADE`, mais on évite CASCADE pour ne pas masquer un
-- usage inattendu. Sur fresh DB, la séquence est :
--   - 001 crée profile_id + FK profile_id_fkey + idx_*_profile
--   - 014 ajoute organization_id
--   - 015 drop la FK puis la colonne (l'index disparaît avec la colonne)

ALTER TABLE "references"
  DROP CONSTRAINT IF EXISTS references_profile_id_fkey,
  DROP COLUMN     IF EXISTS profile_id,
  DROP COLUMN     IF EXISTS intitule_marche,
  DROP COLUMN     IF EXISTS acheteur_public,
  DROP COLUMN     IF EXISTS annee_execution,
  DROP COLUMN     IF EXISTS description_prestations;

ALTER TABLE collaborateurs
  DROP CONSTRAINT IF EXISTS collaborateurs_profile_id_fkey,
  DROP COLUMN     IF EXISTS profile_id;

ALTER TABLE appels_offres
  DROP CONSTRAINT IF EXISTS appels_offres_profile_id_fkey,
  DROP COLUMN     IF EXISTS profile_id;

-- Index obsoletes basés sur profile_id (devenus orphelins)
DROP INDEX IF EXISTS idx_references_profile;
DROP INDEX IF EXISTS idx_collaborateurs_profile;
DROP INDEX IF EXISTS idx_appels_offres_profile;

-- Index 002 sur tenders.url_profil_acheteur (functional index sur IS NOT NULL)
-- → laissé tel quel : il est créé par la 002 et n'est ni cassé ni trompeur.

-- ─── 2. Fermer les advisors search_path mutable ───────────────────────────
-- Trois fonctions publiques sans `SET search_path` : on les durcit ici sans
-- les redéfinir (ALTER FUNCTION ... SET conserve le corps).

ALTER FUNCTION public.update_updated_at()              SET search_path = public, pg_temp;
ALTER FUNCTION public.match_tenders_by_embedding(vector, double precision, integer, text[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.similarity_for_idwebs(vector, text[]) SET search_path = public, pg_temp;

-- ─── 3. Vue embedding_stats — passer en SECURITY INVOKER ──────────────────
-- Depuis PG 15, les vues peuvent être créées avec security_invoker = true
-- pour que la RLS du caller s'applique au lieu de celle du créateur. La
-- migration 008 a créé `embedding_stats` sans cette option : le linter
-- Supabase remonte l'advisor `security_definer_view` (level=ERROR).
-- Note : `embedding_stats` ne lit que des compteurs agrégés (COUNT) sur
-- tenders/profiles, donc il n'y a pas de fuite de données ; on la durcit
-- quand même par hygiène.

ALTER VIEW public.embedding_stats SET (security_invoker = true);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Fin migration 015.
--
-- Vérifs post-application :
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND column_name IN ('profile_id','intitule_marche','acheteur_public','annee_execution','description_prestations');
--   -- doit renvoyer 0 ligne
--
--   SELECT proname, proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace
--   AND proname IN ('update_updated_at','match_tenders_by_embedding','similarity_for_idwebs');
--   -- doit montrer search_path=public, pg_temp pour chaque
--
--   SELECT viewname, viewowner FROM pg_views WHERE schemaname='public' AND viewname='embedding_stats';
--   SELECT relname, reloptions FROM pg_class WHERE relname='embedding_stats';
--   -- doit contenir 'security_invoker=true' dans reloptions
-- ════════════════════════════════════════════════════════════════════════════
