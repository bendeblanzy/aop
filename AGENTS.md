<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## Bonnes pratiques — à respecter systématiquement

### Avant chaque commit

1. **Vérifier l'API des bibliothèques** avant d'utiliser un constructeur ou une méthode.
   Ne jamais supposer qu'une API est identique à ce qu'on connaît — toujours inspecter
   `node_modules/<lib>/dist/index.d.ts` ou la source pour confirmer la signature exacte.
   Exemple de bug évité : `PageNumber` dans docx v9 est un objet const, pas une classe —
   `new PageNumber(...)` lève `TypeError` au runtime.

2. **Lancer `npm run build`** pour vérifier la compilation TypeScript complète.
   Une erreur de type dans une route API peut passer inaperçue sans ça.

3. **Tester la génération locale** pour les fonctions critiques (ex: `docx-generator.ts`) :
   écrire un script Node.js minimal qui génère un fichier dans `/tmp/` et vérifier qu'il
   n'est pas vide/corrompu avant de pousser.

4. **Utiliser Claude in Chrome** pour tester le flux complet dans le navigateur
   après `npm run dev`, et détecter les erreurs visuelles et console *avant* de pousser sur Vercel.

5. **Toujours pousser sur GitHub** pour déclencher le déploiement Vercel automatique.
   Ne jamais supposer que "ça marche en local donc ça marchera en prod".

### Règles de robustesse du code

- **`Array.isArray()` obligatoire** avant tout `.map()`, `.filter()`, `.join()`, `.length`
  sur des données provenant d'une IA (Claude peut retourner un objet `{}` au lieu d'un tableau `[]`).

- **`WidthType.DXA` uniquement** pour les largeurs de cellules dans les tableaux `docx`.
  `WidthType.PERCENTAGE` génère un OOXML invalide interprété par Word comme des twips
  (35 twips ≈ 0,6mm → texte vertical). Utiliser des valeurs absolues + `columnWidths` sur `Table`.

- **`adminClient` (service_role)** pour tous les accès Supabase Storage et les opérations
  d'écriture côté serveur. Le client anon est bloqué par les RLS policies.

- **`maybeSingle()`** au lieu de `single()` quand une ligne peut ne pas exister
  (évite les erreurs 400).

- **`Array.isArray(ao.analyse_rc?.lots)`** avant tout `.map()` sur des champs JSON
  stockés en base (Supabase renvoie parfois un objet au lieu d'un tableau selon le schéma).

- **Colonnes à exclure des upserts Supabase** (ce projet) :
  `created_at`, `updated_at` (auto-timestamps), `siren` (colonne générée depuis `siret`).
  PostgreSQL interdit de fournir une valeur explicite sur une colonne générée → 400.
  Pattern : `const { created_at, updated_at, siren, ...payload } = data`

### Réflexe "ne pas réinventer la roue"

Avant de proposer ou d'écrire du code pour une fonctionnalité, toujours vérifier si une brique existante la couvre déjà.

- **Auth / users** → Supabase Auth est en place. 2FA, magic link, social login, RBAC sont natifs — configurer, ne pas coder.
- **Appels AI** → Préférer Vercel AI SDK (`ai` package) aux appels Anthropic raw. Gère streaming, function calling, multi-provider.
- **Billing** → Stripe Billing pour plans fixes. Si usage-based (tokens, AO analysés) → regarder Lago avant de coder custom.
- **Composants UI** → Chercher dans shadcn/ui ou Radix avant de créer from scratch.
- **Toute feature transverse** (notifications, onboarding, webhooks, invitations...) → poser la question "existe-t-il un package ?" avant de coder.
- **Boilerplate de référence** pour cherry-picker du code : MakerKit (https://makerkit.dev) et Supastarter (https://supastarter.dev).

### Stack technique du projet

- Next.js App Router (version récente — voir `node_modules/next/dist/docs/`)
- Supabase (PostgreSQL + Auth + Storage)
- `docx` v9 pour la génération Word
- `unpdf` pour l'extraction PDF côté serveur (pas `pdf-parse` qui requiert des API navigateur)
- Anthropic Claude via `callClaude()` dans `src/lib/ai/claude-client.ts`
- Déploiement : GitHub → Vercel (auto-deploy sur push `main`)
