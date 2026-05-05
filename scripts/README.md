# Scripts utilitaires

## `setup-vercel-staging.sh`

Configure le Custom Environment **Staging** dans Vercel :

1. Crée un token Vercel : https://vercel.com/account/tokens (scope minimum : Read/Write Project, expiration 30j)
2. Lance le script :
   ```bash
   export VERCEL_TOKEN="..."
   bash scripts/setup-vercel-staging.sh
   ```

Le script :

- Identifie le projet Vercel `aop`
- Crée un Custom Environment `staging` branché sur la branche Git `staging`
- Pousse toutes les variables non-vides de `.env.staging.local` dans cet env Vercel (les `*_KEY/*_TOKEN/*_SECRET` sont marqués comme secrets chiffrés Vercel)

Idempotent — peut être relancé sans dupliquer les variables.

> Note : la variable `VERCEL_TOKEN` n'est pas poussée dans Vercel (c'est juste un secret local pour le script).

## Premier déploiement staging

Une fois `setup-vercel-staging.sh` exécuté avec succès, push n'importe quel commit sur la branche `staging` pour déclencher le 1er build.

L'URL stable de l'env Staging est `https://aop-staging.vercel.app` (assignée comme alias du custom env, indépendante du SHA de chaque déploiement).
