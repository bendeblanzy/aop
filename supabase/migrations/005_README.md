# Migration 005 — disparue

La migration `005_*.sql` a été appliquée en prod (probablement via le SQL
Editor de Supabase) puis supprimée du repo, sans laisser de trace.

D'après l'audit du schéma prod réalisé le **2026-04-26** (cf.
`014_reconcile_prod_schema.sql`), son contenu probable était :

- création des tables `organizations`, `organization_members`, `tender_dce`
- ajout des colonnes `organization_id` sur `profiles`, `references`,
  `collaborateurs`, `appels_offres` (en remplacement de `profile_id`)
- création des fonctions helper `get_user_org_id()` et `is_org_admin()`
- recréation des RLS policies basées sur `organization_id` au lieu de
  `auth.uid() = profile_id`

Tout ce contenu a été **réconcilié dans la migration `014_reconcile_prod_schema.sql`**
en utilisant `CREATE TABLE IF NOT EXISTS` et `ADD COLUMN IF NOT EXISTS`
pour rester idempotent sur la prod existante.

## Pourquoi un `_README.md` plutôt qu'un `005_skipped.sql` ?

Un fichier `.sql` vide à cet emplacement risquerait d'être détecté par la
CLI Supabase comme une migration valide à appliquer (et ferait échouer un
`db reset` ou un environnement neuf). Un `.md` est ignoré par Supabase et
préserve la chronologie documentaire.

## Action future

Si on doit un jour reconstruire la prod depuis zéro à partir des
migrations versionnées, voir l'avertissement « Limite connue — fresh DB »
en en-tête de `014_reconcile_prod_schema.sql`.
