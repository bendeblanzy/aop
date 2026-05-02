# AWS MPI scraper — image légère (pas de Playwright, pure HTTP fetch + cheerio)
FROM apify/actor-node:20

# Copy package files & install deps
COPY package*.json ./
RUN npm install --include=dev

# Copy source & build TypeScript
COPY . .
RUN npm run build

# Remove devDeps after build to slim the image
RUN npm prune --omit=dev

CMD ["node", "dist/main.js"]
