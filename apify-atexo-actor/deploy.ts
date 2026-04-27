/**
 * Déploiement de l'acteur atexo-mpe-scraper sur Apify via l'API officielle.
 *
 * Ce script :
 *   1. Crée l'actor (s'il n'existe pas) via POST /v2/acts
 *   2. Crée/met à jour la version 0.0 via PUT /v2/acts/{id}/versions/0.0
 *      avec tous les fichiers du dossier (sauf node_modules, dist…)
 *   3. Trigger un build via POST /v2/acts/{id}/builds
 *   4. Attend que le build se termine et imprime l'actorId à coller dans
 *      APIFY_ATEXO_ACTOR_ID du .env.local
 *
 * Doc API : https://docs.apify.com/api/v2
 *
 * Usage :
 *   APIFY_API_TOKEN=xxx npx ts-node deploy.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const ACTOR_NAME = 'atexo-mpe-scraper'
const VERSION_NUMBER = '0.0'

const TOKEN = process.env.APIFY_API_TOKEN
if (!TOKEN) {
  console.error('APIFY_API_TOKEN manquant')
  process.exit(1)
}

const ROOT = __dirname

// Fichiers/dossiers à exclure du push
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', 'apify_storage', 'storage', 'crawlee_storage'])
const EXCLUDE_FILES = new Set(['.DS_Store', 'deploy.ts', 'package-lock.json'])
const EXCLUDE_BY_PATH = new Set([
  'src/test-parse.ts',
  'src/test-pagination.ts',
])

// Fichiers binaires → encoder en base64. Tout le reste = texte.
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.zip', '.tar', '.gz'])

interface ApifySourceFile {
  name: string
  format: 'TEXT' | 'BASE64'
  content: string
}

function walk(dir: string, prefix = ''): ApifySourceFile[] {
  const out: ApifySourceFile[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_FILES.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue
      out.push(...walk(full, rel))
    } else if (entry.isFile()) {
      if (EXCLUDE_BY_PATH.has(rel)) continue
      const ext = path.extname(entry.name).toLowerCase()
      const isBinary = BINARY_EXTS.has(ext)
      const buf = fs.readFileSync(full)
      out.push({
        name: rel,
        format: isBinary ? 'BASE64' : 'TEXT',
        content: isBinary ? buf.toString('base64') : buf.toString('utf8'),
      })
    }
  }
  return out
}

interface ApifyResponse<T> { data: T }

async function apifyApi<T>(method: string, urlPath: string, body?: unknown): Promise<T> {
  const url = `https://api.apify.com/v2${urlPath}${urlPath.includes('?') ? '&' : '?'}token=${TOKEN}`
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`API ${method} ${urlPath} failed: ${res.status} ${res.statusText}\n${text.slice(0, 600)}`)
  }
  const json = JSON.parse(text) as ApifyResponse<T>
  return json.data
}

async function findActor(name: string): Promise<{ id: string; name: string } | null> {
  const list = await apifyApi<{ items: Array<{ id: string; name: string }> }>('GET', '/acts?my=1&limit=100')
  return list.items.find(a => a.name === name) ?? null
}

async function ensureActor(): Promise<{ id: string; name: string }> {
  let actor = await findActor(ACTOR_NAME)
  if (actor) {
    console.log(`✓ Actor "${ACTOR_NAME}" existe déjà : ${actor.id}`)
    return actor
  }
  console.log(`Création de l'actor "${ACTOR_NAME}"...`)
  actor = await apifyApi<{ id: string; name: string }>('POST', '/acts', {
    name: ACTOR_NAME,
    title: 'Atexo MPE — Scraper PLACE & Maximilien',
    description: 'Scrape les consultations en cours sur les profils acheteurs Atexo Local Trust MPE (PLACE, Maximilien). Gère PRADO_PAGESTATE.',
    isPublic: false,
    seoTitle: '',
    seoDescription: '',
  })
  console.log(`✓ Actor créé : ${actor.id}`)
  return actor
}

async function upsertVersion(actorId: string, files: ApifySourceFile[]): Promise<void> {
  console.log(`Upsert version ${VERSION_NUMBER} avec ${files.length} fichiers source...`)
  await apifyApi('PUT', `/acts/${actorId}/versions/${VERSION_NUMBER}`, {
    versionNumber: VERSION_NUMBER,
    sourceType: 'SOURCE_FILES',
    baseDockerImage: 'apify/actor-node:20',
    buildTag: 'latest',
    sourceFiles: files,
  })
  console.log(`✓ Version ${VERSION_NUMBER} mise à jour`)
}

interface ApifyBuild {
  id: string
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMING-OUT' | 'TIMED-OUT' | 'ABORTING' | 'ABORTED'
  startedAt: string
  finishedAt?: string | null
  buildNumber?: string
}

async function triggerBuild(actorId: string): Promise<ApifyBuild> {
  console.log(`Trigger build de la version ${VERSION_NUMBER}...`)
  const build = await apifyApi<ApifyBuild>('POST', `/acts/${actorId}/builds?version=${VERSION_NUMBER}&waitForFinish=0&useCache=true`)
  console.log(`✓ Build lancé : ${build.id}`)
  return build
}

async function waitBuild(actorId: string, buildId: string, maxWaitMs = 8 * 60 * 1000): Promise<ApifyBuild> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const b = await apifyApi<ApifyBuild>('GET', `/acts/${actorId}/builds/${buildId}`)
    if (['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(b.status)) {
      return b
    }
    await new Promise(r => setTimeout(r, 5_000))
    process.stdout.write('.')
  }
  throw new Error(`Build ${buildId} : timeout (${Math.round(maxWaitMs/1000)}s)`)
}

async function main() {
  console.log(`\n=== Deploy ${ACTOR_NAME} ===\n`)
  const files = walk(ROOT)
  console.log(`Fichiers à pousser : ${files.length}`)
  for (const f of files) console.log(`  - ${f.name} (${f.format}, ${f.content.length}b)`)

  const actor = await ensureActor()
  await upsertVersion(actor.id, files)
  const build = await triggerBuild(actor.id)
  console.log('Wait build...')
  const finished = await waitBuild(actor.id, build.id)
  console.log() // newline after dots
  if (finished.status !== 'SUCCEEDED') {
    console.error(`✗ Build terminé en statut ${finished.status}`)
    console.error(`Voir logs : https://console.apify.com/actors/${actor.id}/builds/${build.id}`)
    process.exit(2)
  }
  console.log(`\n✅ Déploiement OK !`)
  console.log(`\nActor ID  : ${actor.id}`)
  console.log(`Build ID  : ${build.id}`)
  console.log(`\nÀ ajouter dans .env.local :`)
  console.log(`APIFY_ATEXO_ACTOR_ID=${actor.id}`)
  console.log(`\n(URL console : https://console.apify.com/actors/${actor.id})`)
}

main().catch(err => {
  console.error('\n✗ Erreur :', err instanceof Error ? err.message : err)
  process.exit(1)
})
