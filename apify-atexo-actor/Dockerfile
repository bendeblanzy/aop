# V3 — Image Apify Node + Playwright Chrome headless.
# Le scraper pilote un vrai navigateur pour exécuter le JS PRADO d'Atexo
# (le moteur PHP renvoie HTTP 400 dès la 4e page sans navigateur, et corrompt
# son state sur les sub-runs successifs en mode fetch HTTP brut).
FROM apify/actor-node-playwright-chrome:20

# Manifests + source TS (pas de dist pré-buildé : on compile côté Apify)
COPY --chown=myuser package*.json tsconfig.json ./
COPY --chown=myuser src ./src

# Install deps (incl. tsc), build, puis prune des deps dev pour image légère.
# NB : on garde les binaires Chromium fournis par l'image de base (déjà installés
# dans /home/myuser/pw-browsers, exposé via PLAYWRIGHT_BROWSERS_PATH).
RUN npm install --include=dev \
 && npm run build \
 && npm prune --omit=dev \
 && rm -rf src tsconfig.json

# Démarrer l'acteur (dist/main.js produit par tsc)
CMD ["node", "dist/main.js"]
