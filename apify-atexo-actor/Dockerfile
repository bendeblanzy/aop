# Image Apify Node 20 — pas besoin de Playwright (scraping HTTP + HTML pur)
FROM apify/actor-node:20

# Manifests + source TS (pas de dist pré-buildé : on compile côté Apify)
COPY package*.json tsconfig.json ./
COPY src ./src

# Install deps (incl. tsc), build, puis prune des deps dev pour image légère
RUN npm install --include=dev \
 && npm run build \
 && npm prune --omit=dev \
 && rm -rf src tsconfig.json

# Démarrer l'acteur (dist/main.js produit par tsc)
CMD ["node", "dist/main.js"]
