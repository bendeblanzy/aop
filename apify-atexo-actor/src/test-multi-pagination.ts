/**
 * Test live multi-page : valider 5 pages d'affilée avec next-page POSTback.
 *
 * Usage : npx ts-node src/test-multi-pagination.ts [place|mxm]
 */

import {
  buildPradoPostbackBody,
  extractPradoPageState,
  extractSessionCookie,
  pradoHeaders,
} from './prado'
import { parseListingPage } from './parse'
import type { AtexoProviderId } from './types'

const PROVIDERS: Partial<Record<AtexoProviderId, string>> = {
  place: 'https://www.marches-publics.gouv.fr',
  mxm: 'https://marches.maximilien.fr',
}
const NUM_PAGES = 5
// Variantes à tester
const TARGET_DEFAULT_BTN = 'ctl0$CONTENU_PAGE$resultSearch$DefaultButtonTop'
const TARGET_NEXT = 'ctl0$CONTENU_PAGE$resultSearch$PagerTop$ctl2'
// On essaiera PagerBottom$ctl2 si PagerTop ne marche pas
const TARGET_NEXT_BOT = 'ctl0$CONTENU_PAGE$resultSearch$PagerBottom$ctl2'

async function main() {
  const id = (process.argv[2] as AtexoProviderId) || 'place'
  const baseUrl = PROVIDERS[id as keyof typeof PROVIDERS]
  if (!baseUrl) {
    console.error(`Unknown provider: ${id}`)
    process.exit(1)
  }
  const url = baseUrl + '/index.php?page=Entreprise.EntrepriseAdvancedSearch&AllCons'
  console.log(`\n=== ${id.toUpperCase()} : ${NUM_PAGES} pages d'affilée ===\n`)

  // Page 1 : GET
  const r1 = await fetch(url, { headers: pradoHeaders(null, false), method: 'GET' })
  const html1 = await r1.text()
  const setCookie =
    'getSetCookie' in r1.headers && typeof (r1.headers as unknown as { getSetCookie(): string[] }).getSetCookie === 'function'
      ? (r1.headers as unknown as { getSetCookie(): string[] }).getSetCookie()
      : r1.headers.get('set-cookie')
  const cookie = extractSessionCookie(setCookie)
  let pradoState = extractPradoPageState(html1)
  let parsed = parseListingPage(html1, baseUrl, id)
  console.log(`Page 1 GET : ${r1.status}, items=${parsed.items.length}, totalPages=${parsed.totalPages}`)
  if (parsed.items.length > 0) {
    console.log(`  first: ${parsed.items[0].reference}`)
  }
  if (!pradoState) { console.error('PRADO_PAGESTATE introuvable !'); process.exit(2) }

  const allRefs = new Set(parsed.items.map(i => i.reference))

  // Variant B : target = nextPageTarget extrait dynamiquement de la page courante
  let nextTarget: string | null = parsed.nextPageTarget
  console.log(`  initial nextTarget: ${nextTarget}`)
  for (let page = 2; page <= NUM_PAGES; page++) {
    if (!nextTarget) {
      console.log(`Page ${page} : nextTarget null — fin pagination`)
      break
    }
    await new Promise(r => setTimeout(r, 1000))
    const body = buildPradoPostbackBody(pradoState!, nextTarget, {
      'ctl0$CONTENU_PAGE$resultSearch$listePageSizeTop': '20',
    })
    const r = await fetch(url, { headers: pradoHeaders(cookie, true), method: 'POST', body })
    const html = await r.text()
    if (r.status !== 200) {
      console.error(`[A] Page ${page} POST : HTTP ${r.status}`)
      // Cherche message d'erreur explicite
      const m = html.match(/<title>([^<]+)<\/title>/i)
      if (m) console.error('Title:', m[1])
      const errMsg = html.match(/<div[^>]+class="[^"]*err[^"]*"[^>]*>([^<]+)/i)
      if (errMsg) console.error('Err msg:', errMsg[1].trim())
      const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
      if (h1) console.error('H1:', h1[1].trim())
      const body1 = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
      if (body1) {
        // Strip tags
        const text = body1[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        console.error('Body extract:', text.slice(0, 400))
      }
      break
    }
    const newState = extractPradoPageState(html)
    if (newState) pradoState = newState
    parsed = parseListingPage(html, baseUrl, id)
    const newRefs = parsed.items.filter(i => !allRefs.has(i.reference))
    for (const r2 of parsed.items) allRefs.add(r2.reference)
    console.log(`[B] Page ${page} POST : ${r.status}, items=${parsed.items.length}, new=${newRefs.length}, nextTarget=${parsed.nextPageTarget}`)
    if (parsed.items.length > 0) {
      console.log(`     first: ${parsed.items[0].reference}, last: ${parsed.items[parsed.items.length - 1].reference}`)
    }
    nextTarget = parsed.nextPageTarget
  }
  console.log(`\n[B] Total refs uniques après ${NUM_PAGES} pages : ${allRefs.size}`)
  void TARGET_DEFAULT_BTN
  void TARGET_NEXT
  void TARGET_NEXT_BOT
}

main().catch(e => { console.error(e); process.exit(1) })
