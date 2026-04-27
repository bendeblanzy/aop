# atexo-mpe-scraper

Acteur Apify qui scrape les consultations en cours sur les profils acheteurs
**Atexo Local Trust MPE** (PLACE, Maximilien, et autres plateformes Atexo).

Pousse les annonces normalisées dans le dataset Apify pour ingestion downstream
par `src/lib/atexo/sync.ts` côté Next.js.

## Stack

- TypeScript + Apify SDK v3
- `cheerio` pour le parsing HTML
- HTTP natif (pas de Playwright/Crawlee — Atexo n'a pas de JS côté client)

## Mécanisme PRADO

Atexo MPE est construit sur le framework PHP **PRADO**. Chaque page contient un
`PRADO_PAGESTATE` (~30 KB de viewstate sérialisé) qu'il faut renvoyer dans les
POSTs pour naviguer.

Détails dans `src/prado.ts`. Pattern utilisé pour la pagination :

```
PRADO_PAGESTATE=<state>
PRADO_POSTBACK_TARGET=<vide>
PRADO_POSTBACK_PARAMETER=<vide>
ctl0$CONTENU_PAGE$resultSearch$numPageTop=<N>
ctl0$CONTENU_PAGE$resultSearch$DefaultButtonTop=<vide>
ctl0$CONTENU_PAGE$resultSearch$listePageSizeTop=20
```

## Limitations connues V1

- **Hard-cap 3 pages par plateforme** (~50 items lus, ~10–25 services pushés).
  Au-delà, PRADO renvoie `400 — Page state is corrupted`. Améliorations V2 :
  sessions parallèles avec cookies isolés et offset différent, ou approche
  Playwright (browser headless).

- Champs non extraits sur la page de listing (vides dans les items poussés) :
  `cpv_codes`, `valeur_estimee`, `lots`. Pour les obtenir il faudrait fetch la
  fiche détail de chaque AO (1 round-trip de plus chacun). À ajouter en V2 si
  besoin pour le scoring.

## Déploiement

Le déploiement passe par l'API Apify (pas la CLI), via `deploy.ts` :

```bash
cd apify-atexo-actor
APIFY_API_TOKEN=apify_api_xxx npx ts-node deploy.ts
```

Le script :
1. Crée l'actor (s'il n'existe pas)
2. Push le code source via `PUT /v2/acts/{id}/versions/0.0`
3. Trigger un build via `POST /v2/acts/{id}/builds`
4. Attend que le build se termine (~45 s)

Variante non-bloquante (push + trigger sans attendre le build) : `deploy-only.ts`.

## Tests locaux

```bash
# Test du parser sur un HTML capturé
npx ts-node src/test-parse.ts /tmp/place.html

# Test live de la pagination (1 GET + 1 POST)
npx ts-node src/test-pagination.ts place
npx ts-node src/test-pagination.ts mxm

# Test multi-pages (N GETs/POSTs successifs)
npx ts-node src/test-multi-pagination.ts place
```

## Trigger d'un run depuis l'API Apify

```bash
TOKEN=apify_api_xxx
ACTOR=sLd4mvIS6uujlYHCI
curl -X POST "https://api.apify.com/v2/acts/$ACTOR/runs?token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "providers": [
      {"id":"place","baseUrl":"https://www.marches-publics.gouv.fr"},
      {"id":"mxm","baseUrl":"https://marches.maximilien.fr"}
    ],
    "filters": {"categorie":"services","maxAgeDays":30},
    "maxPagesPerProvider": 3
  }'
```

## Schéma de sortie (dataset Apify)

Cf. `src/types.ts` → `AtexoApifyItem`. Le contrat est consommé par
`src/lib/atexo/transform.ts` côté Next.js et doit rester rétro-compatible.

## Plateformes supportées

| ID    | Nom                         | Base URL                                    |
|-------|-----------------------------|---------------------------------------------|
| place | PLACE — Achats de l'État    | https://www.marches-publics.gouv.fr         |
| mxm   | Maximilien — Île-de-France  | https://marches.maximilien.fr               |

À ajouter (toutes Atexo Local Trust MPE) : megalis-bretagne.org, etc.
Cf. `plateformes.csv` de github.com/ColinMaudry/atexo-decp-scraper.
