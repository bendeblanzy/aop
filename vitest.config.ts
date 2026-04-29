import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Phase 3.C — Suite E2E seed scoring.
 *
 * MVP : tests unitaires sur les fonctions pures du scoring (simToScore,
 * cosineSimilarity). Les tests E2E avec dataset seed (profils × AO étiquetés)
 * sont à étoffer en sessions successives.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // Le repo a un dossier `TESTS/` (uppercase) côté Drive (mount Google
    // Drive case-insensitive). On utilise le casing canonique du repo.
    include: ['TESTS/**/*.test.ts'],
    // Pas de DB Supabase en MVP : on isole les fonctions pures.
    // Si on doit tester scoring-vector.ts, faire un mock adminClient au cas par cas.
  },
})
