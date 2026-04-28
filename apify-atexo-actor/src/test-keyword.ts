/**
 * Test live : POST sur le formulaire de recherche avancée Atexo PLACE
 * avec un keyword + categorie services pour valider Phase C.
 *
 * Usage : npx ts-node src/test-keyword.ts "communication"
 */

import { extractPradoPageState, extractSessionCookie, pradoHeaders } from './prado'
import { parseListingPage } from './parse'

const BASE = 'https://www.marches-publics.gouv.fr'
const URL = `${BASE}/?page=Entreprise.EntrepriseAdvancedSearch`

async function main() {
  const keyword = process.argv[2] || 'communication'
  console.log(`\n=== POST advanced search avec keyword="${keyword}" ===\n`)

  // 1. GET du formulaire
  const r1 = await fetch(URL, { headers: pradoHeaders(null), method: 'GET' })
  const html1 = await r1.text()
  const setCookie = 'getSetCookie' in r1.headers && typeof (r1.headers as unknown as { getSetCookie(): string[] }).getSetCookie === 'function'
    ? (r1.headers as unknown as { getSetCookie(): string[] }).getSetCookie()
    : r1.headers.get('set-cookie')
  const cookie = extractSessionCookie(setCookie)
  const pradoState = extractPradoPageState(html1)
  console.log(`GET ${URL} → ${r1.status}, html=${html1.length}b, cookie=${cookie ? '✓' : '✗'}, prado=${pradoState ? '✓' : '✗'}`)

  if (!pradoState) {
    console.error('PRADO_PAGESTATE introuvable !')
    process.exit(2)
  }

  // 2. POST avec keyword + categorie=3 (Services) + cpv si fourni
  // Target = lancerRecherche (le bouton submit du formulaire)
  const cpv = process.argv[3] || ''
  const params = new URLSearchParams()
  params.set('PRADO_PAGESTATE', pradoState)
  params.set('PRADO_POSTBACK_TARGET', 'ctl0$CONTENU_PAGE$AdvancedSearch$lancerRecherche')
  params.set('PRADO_POSTBACK_PARAMETER', '')
  params.set('ctl0$CONTENU_PAGE$AdvancedSearch$keywordSearch', keyword)
  params.set('ctl0$CONTENU_PAGE$AdvancedSearch$categorie', '3') // 3 = Services
  params.set('ctl0$CONTENU_PAGE$AdvancedSearch$rechercheFloue', '1') // recherche floue ON
  if (cpv) {
    params.set('ctl0$CONTENU_PAGE$AdvancedSearch$referentielCPV$cpvPrincipale', cpv)
    console.log(`+ filtre CPV principal = ${cpv}`)
  }

  const r2 = await fetch(URL, {
    method: 'POST',
    headers: pradoHeaders(cookie, true),
    body: params.toString(),
  })
  const html2 = await r2.text()
  console.log(`POST search → ${r2.status}, html=${html2.length}b`)

  if (r2.status !== 200) {
    const m = html2.match(/<title>([^<]+)<\/title>/i)
    console.error('Title:', m?.[1])
    const body1 = html2.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (body1) {
      const text = body1[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      console.error('Body extract:', text.slice(0, 400))
    }
    process.exit(3)
  }

  // 3. Parser le résultat
  const parsed = parseListingPage(html2, BASE, 'place')
  console.log(`\ntotalResults=${parsed.totalResults}, totalPages=${parsed.totalPages}, items=${parsed.items.length}`)
  console.log(`\n──── Top 5 résultats ────\n`)
  for (const it of parsed.items.slice(0, 5)) {
    console.log(`• ${it.reference} | ${it.type_marche} | ${it.organisme}`)
    console.log(`  "${(it.intitule ?? '').slice(0, 80)}..."`)
    console.log(`  pub=${it.date_publication} limite=${it.date_limite_remise}\n`)
  }
}

main().catch(err => {
  console.error('Erreur :', err)
  process.exit(1)
})
