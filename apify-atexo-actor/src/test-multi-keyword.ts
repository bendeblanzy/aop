/**
 * Test local : enchaîner plusieurs keywords sur PLACE pour voir si le HTTP 400
 * sur sub-runs 2+ vient de la séquence (chez nous) ou de l'IP Apify (shared).
 */

import { extractPradoPageState, extractSessionCookie, pradoHeaders } from './prado'
import { parseListingPage } from './parse'

const BASE = 'https://www.marches-publics.gouv.fr'
const URL = `${BASE}/?page=Entreprise.EntrepriseAdvancedSearch`
const KEYWORDS = ['communication', 'evenementiel', 'audiovisuel', 'video']

async function searchOnce(kw: string): Promise<{ ok: boolean; total: number }> {
  // GET initial → cookie + PRADO_PAGESTATE frais
  const r0 = await fetch(URL, { method: 'GET', headers: pradoHeaders(null) })
  const html0 = await r0.text()
  const setCookie = 'getSetCookie' in r0.headers && typeof (r0.headers as unknown as { getSetCookie(): string[] }).getSetCookie === 'function'
    ? (r0.headers as unknown as { getSetCookie(): string[] }).getSetCookie()
    : r0.headers.get('set-cookie')
  const cookie = extractSessionCookie(setCookie)
  const prado = extractPradoPageState(html0)
  if (!prado) return { ok: false, total: 0 }

  // Délai 500ms : laisser le serveur "consolider" le PAGESTATE
  await new Promise(r => setTimeout(r, 500))

  const params = new URLSearchParams()
  params.set('PRADO_PAGESTATE', prado)
  params.set('PRADO_POSTBACK_TARGET', 'ctl0$CONTENU_PAGE$AdvancedSearch$lancerRecherche')
  params.set('PRADO_POSTBACK_PARAMETER', '')
  params.set('ctl0$CONTENU_PAGE$AdvancedSearch$keywordSearch', kw)
  params.set('ctl0$CONTENU_PAGE$AdvancedSearch$categorie', '3')
  params.set('ctl0$CONTENU_PAGE$AdvancedSearch$rechercheFloue', '1')

  const r1 = await fetch(URL, { method: 'POST', headers: pradoHeaders(cookie, true), body: params.toString() })
  const html1 = await r1.text()
  if (r1.status !== 200) return { ok: false, total: 0 }
  const parsed = parseListingPage(html1, BASE, 'place')
  return { ok: true, total: parsed.totalResults ?? 0 }
}

async function searchOne(kw: string, idx: number) {
  console.log(`\n--- Keyword ${idx + 1}: "${kw}" ---`)
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await searchOnce(kw)
    if (r.ok) {
      console.log(`  attempt ${attempt}: OK, total=${r.total}`)
      return r.total
    }
    console.log(`  attempt ${attempt}: FAIL`)
    if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt))
  }
  return 0
}

async function main() {
  for (let i = 0; i < KEYWORDS.length; i++) {
    await searchOne(KEYWORDS[i], i)
    await new Promise(r => setTimeout(r, 4000)) // 4s entre keywords
  }
}

main().catch(e => { console.error(e); process.exit(1) })
