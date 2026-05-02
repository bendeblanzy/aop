# Chantier — Bugfix Pass 1 (refonte/bugfix-pass1)

**Filet de sécurité** : tag `audit-baseline-2026-05-02` (état avant la passe).
**Démarré le** : 2026-05-02
**23 bugs identifiés** lors d'une navigation live de l'app sur staging (qui pointe en réalité vers la DB prod — bug #9).

> **Document de passation** : si la session Claude Code coupe avant la fin, ce fichier sert de checkpoint. La prochaine session reprend à l'item le plus haut non coché.

---

## Wave A — Config / actions Vercel (à faire par Benjamin)

- [ ] **#9** Reconfigurer env vars Vercel projet `aop-staging` → DB staging (`bzcammbwqkfqfkzhvzie`) au lieu de prod (`lodzbshmlasvvqkqtwjf`). Variables à corriger :
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- [ ] **#21** Ajouter `benjamindeblanzy@ladngroupe.com` à `SUPER_ADMIN_EMAIL` (ou faire passer à un format `,`-séparé qui supporte plusieurs emails).
- [ ] **vercel.json** : `maxDuration: 600` pour `sync-atexo` dépasse la limite plan. Soit upgrade Vercel plan, soit réduire à 300.

## Wave B — Backend (1-line fixes)

- [ ] **#6** `src/app/api/profil/route.ts:37` → `.upsert(payload, { onConflict: 'organization_id' })`
- [ ] **#2 + #3** `src/app/api/profil/siret/route.ts` → ne pas dupliquer raison sociale ni adresse
- [ ] **#4** Bouton Rechercher SIRET — fix focus/handler

## Wave C — Code mort / textes

- [ ] **#5** Onboarding step 2 — retirer la mention "DC1 et DC2"
- [ ] **#22** Paramètres — retirer "Accès à tous les formulaires"
- [ ] **#23** Paramètres — masquer ou désactiver "Passer Pro"

## Wave D — UX

- [ ] **#1** Onboarding header "Étape X/8" → "Étape X/N" calculé dynamiquement
- [ ] **#10** Décodage entités HTML (`&#039;` etc.) sur les noms acheteurs
- [ ] **#11** Score "50%" générique partout — soit afficher "Non évalué", soit forcer le scoring
- [ ] **#12** Card incohérente : "aucun lot ne correspond" + "Match partiel 50%"
- [ ] **#13** Sidebar : ajouter ou retirer définitivement "Appels d'offres"
- [ ] **#14** Dashboard badge "5109" → vrai compteur user-specific
- [ ] **#16** Veille "5109 correspondances profil" → idem
- [ ] **#15** Veille filtre Sources : ajouter AWS
- [ ] **#17** Détail tender : traduire NUTS en libellé région
- [ ] **#18** `/admin/users` non-autorisé → message clair (403, pas redirect silencieux)
- [ ] **#19** `/admin/dce` non-autorisé → idem
- [ ] **#20** Page 404 → garder le layout `(app)` (sidebar)

## Wave E — Onboarding (plus complexe)

- [ ] **#7** Persistance d'état onboarding (DB plutôt que mémoire client)
- [ ] **#8** Synchroniser `user_metadata.onboarding_completed` avec l'état DB réel

## Finalisation

- [ ] Build + lint + typecheck verts
- [ ] Push branche + créer PR
- [ ] Résumé pour Benjamin avec les actions Vercel à faire (#9, #21)

---

## Logs de progression

(commits ajoutés ici au fil du chantier)
