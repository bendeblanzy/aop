/**
 * Variante de deploy.ts : push + trigger build mais SANS attente.
 * Plus rapide pour le sandbox 45s. Polling à faire séparément.
 */

import * as fs from 'fs'
import * as path from 'path'

const ACTOR_ID = process.env.APIFY_ATEXO_ACTOR_ID || 'sLd4mvIS6uujlYHCI'
const VERSION_NUMBER = '0.0'
const TOKEN = process.env.APIFY_API_TOKEN
if (!TOKEN) { console.error('APIFY_API_TOKEN manquant'); process.exit(1) }

const ROOT = __dirname
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', 'apify_storage', 'storage', 'crawlee_storage'])
const EXCLUDE_FILES = new Set(['.DS_Store', 'deploy.ts', 'deploy-only.ts', 'package-lock.json'])
// V3 : on exclut tous les fichiers de test (legacy V2 + nouveaux tests Playwright).
// Les tests sont uniquement utiles en local — pas besoin de les pousser sur Apify.
const EXCLUDE_BY_PATH = new Set([
  'src/test-parse.ts',
  'src/test-pagination.ts',
  'src/test-keyword.ts',
  'src/test-multi-keyword.ts',
  'src/test-multi-pagination.ts',
  'src/test-playwright.ts',
])
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.zip', '.tar', '.gz'])

function walk(dir: string, prefix = ''): Array<{ name: string; format: 'TEXT' | 'BASE64'; content: string }> {
  const out: Array<{ name: string; format: 'TEXT' | 'BASE64'; content: string }> = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_FILES.has(e.name)) continue
    const full = path.join(dir, e.name)
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue
      out.push(...walk(full, rel))
    } else if (e.isFile()) {
      if (EXCLUDE_BY_PATH.has(rel)) continue
      const ext = path.extname(e.name).toLowerCase()
      const isBin = BINARY_EXTS.has(ext)
      const buf = fs.readFileSync(full)
      out.push({ name: rel, format: isBin ? 'BASE64' : 'TEXT', content: isBin ? buf.toString('base64') : buf.toString('utf8') })
    }
  }
  return out
}

async function main() {
  const files = walk(ROOT)
  console.log(`Fichiers à pousser : ${files.length}`)
  // Upsert version
  console.log(`PUT version ${VERSION_NUMBER}...`)
  const res1 = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/versions/${VERSION_NUMBER}?token=${TOKEN}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      versionNumber: VERSION_NUMBER,
      sourceType: 'SOURCE_FILES',
      // V3 : image avec Playwright Chromium pré-installé. Le Dockerfile dans
      // les sourceFiles override en pratique, mais on aligne la metadata.
      baseDockerImage: 'apify/actor-node-playwright-chrome:20',
      buildTag: 'latest',
      sourceFiles: files,
    }),
  })
  if (!res1.ok) { console.error('PUT version failed:', res1.status, await res1.text()); process.exit(2) }
  console.log('✓ Version pushée')

  // Trigger build (no wait)
  console.log('POST build...')
  const res2 = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/builds?token=${TOKEN}&version=${VERSION_NUMBER}&waitForFinish=0&useCache=false`, {
    method: 'POST',
  })
  if (!res2.ok) { console.error('POST build failed:', res2.status, await res2.text()); process.exit(3) }
  const buildData = (await res2.json()) as { data: { id: string; status: string } }
  console.log(`✓ Build lancé : ${buildData.data.id} (${buildData.data.status})`)
  console.log(`\nPoll : curl "https://api.apify.com/v2/actor-builds/${buildData.data.id}?token=$TOKEN"`)
}

main().catch(e => { console.error(e); process.exit(1) })
