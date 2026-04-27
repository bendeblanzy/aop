/**
 * Test live de la pagination PRADO sans le runtime Apify.
 *
 * Fait une vraie session :
 *   1. GET de la page de listing (capture cookie + PRADO_PAGESTATE)
 *   2. POST pour récupérer la page 2 (vérifie que le POSTback PRADO fonctionne)
 *   3. Compare les items des 2 pages — il ne doit y avoir AUCUN doublon
 *
 * Usage : npx ts-node src/test-pagination.ts [place|mxm]
 */

import {
  buildPradoPostbackBody,
  extractPradoPageState,
  extractSessionCookie,
  pradoHeaders,
} from './prado'
import { parseListingPage } from './parse'
import type { AtexoProviderId } from './types'

const PROVIDERS: Record<AtexoProviderId, string> = {
  place: 'https://www.marches-publics.gouv.fr',
  mxm: 'https://marches.maximilien.fr',
}

async function main() {
  const id = (process.argv[2] as AtexoProviderId) || 'place'
  const baseUrl = PROVIDERS[id]
  if (!baseUrl) {
    console.error(`Unknown provider: ${id}. Use 'place' or 'mxm'.`)
    process.exit(1)
  }
  const url = baseUrl + '/index.php?page=Entreprise.EntrepriseAdvancedSearch&AllCons'

  console.log(`\n=== ${id.toUpperCase()} (${baseUrl}) ===\n`)

  // ── Page 1 : GET ──
  console.log('→ GET page 1...')
  const r1 = await fetch(url, { headers: pradoHeaders(null, false), method: 'GET' })
  const html1 = await r1.text()
  const cookie = extractSessionCookie(
    'getSetCookie' in r1.headers && typeof (r1.headers as unknown as { getSetCookie(): string[] }).getSetCookie === 'function'
      ? (r1.headers as unknown as { getSetCookie(): string[] }).getSetCookie()
      : r1.headers.get('set-cookie'),
  )
  console.log(`  status=${r1.status}, html=${html1.length}b, cookie=${cookie ? '✓' : '✗'}`)

  const p1 = parseListingPage(html1, baseUrl, id)
  console.log(`  totalPages=${p1.totalPages}, totalResults=${p1.totalResults}, items=${p1.items.length}, pradoState=${p1.pradoPageState ? '✓' : '✗'}`)
  if (p1.items.length > 0) {
    console.log(`  page 1 first ref: ${p1.items[0].reference} | "${p1.items[0].intitule?.slice(0, 50)}..."`)
    console.log(`  page 1 last ref:  ${p1.items[p1.items.length - 1].reference}`)
  }

  if (!p1.pradoPageState) {
    console.error('✗ PRADO_PAGESTATE introuvable — abandon')
    process.exit(2)
  }

  // ── Page 2 : POST avec PRADO_PAGESTATE ──
  console.log('\n→ POST page 2 (jump direct via numPageTop=2)...')
  const body = buildPradoPostbackBody(p1.pradoPageState, '', {
    'ctl0$CONTENU_PAGE$resultSearch$numPageTop': '2',
    'ctl0$CONTENU_PAGE$resultSearch$DefaultButtonTop': '',
    'ctl0$CONTENU_PAGE$resultSearch$listePageSizeTop': '20',
  })
  const r2 = await fetch(url, {
    headers: pradoHeaders(cookie, true),
    method: 'POST',
    body,
  })
  const html2 = await r2.text()
  console.log(`  status=${r2.status}, html=${html2.length}b`)

  const p2 = parseListingPage(html2, baseUrl, id)
  console.log(`  items=${p2.items.length}, pradoState=${p2.pradoPageState ? '✓ (changed: ' + (p2.pradoPageState !== p1.pradoPageState) + ')' : '✗'}`)
  if (p2.items.length > 0) {
    console.log(`  page 2 first ref: ${p2.items[0].reference} | "${p2.items[0].intitule?.slice(0, 50)}..."`)
    console.log(`  page 2 last ref:  ${p2.items[p2.items.length - 1].reference}`)
  }

  // ── Validation : aucun doublon entre p1 et p2 ──
  const refs1 = new Set(p1.items.map(i => i.reference))
  const refs2 = new Set(p2.items.map(i => i.reference))
  const inter = [...refs2].filter(r => refs1.has(r))

  console.log(`\n→ Validation`)
  console.log(`  p1 refs: ${refs1.size}, p2 refs: ${refs2.size}, intersection: ${inter.length}`)

  if (p2.items.length === 0) {
    console.error('✗ ÉCHEC : page 2 vide')
    process.exit(3)
  }
  if (inter.length === p1.items.length && inter.length === p2.items.length) {
    console.error('✗ ÉCHEC : page 2 = page 1 (POSTback PRADO non interprété par le serveur)')
    process.exit(4)
  }
  if (inter.length > 0) {
    console.warn(`⚠ ${inter.length} doublons détectés — possibles mais à surveiller : ${inter.slice(0, 3).join(', ')}...`)
  } else {
    console.log('✓ Aucun doublon entre page 1 et page 2 — pagination POST PRADO fonctionne !')
  }
}

main().catch(err => {
  console.error('Erreur :', err)
  process.exit(1)
})
