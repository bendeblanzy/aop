# Image Apify avec Playwright préinstallé
FROM apify/actor-node-playwright-chrome:20

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances Node
RUN npm install --omit=dev

# Copier le code compilé
COPY dist ./dist

# Démarrer l'acteur
CMD ["node", "dist/main.js"]
