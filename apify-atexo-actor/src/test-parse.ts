/**
 * Test local du parser : charge un HTML capturé sur PLACE et affiche les
 * premiers items extraits. Pas besoin du runtime Apify.
 *
 * Usage :
 *   npx ts-node src/test-parse.ts /chemin/vers/place.html
 */

import * as fs from 'fs'
import { parseListingPage } from './parse'

const file = process.argv[2]
if (!file) {
  console.error('Usage: ts-node src/test-parse.ts <html-file>')
  process.exit(1)
}

const html = fs.readFileSync(file, 'utf8')
const result = parseListingPage(html, 'https://www.marches-publics.gouv.fr', 'place')

console.log('totalPages:', result.totalPages)
console.log('totalResults:', result.totalResults)
console.log('pradoPageState present:', !!result.pradoPageState, '— length:', result.pradoPageState?.length)
console.log('items count:', result.items.length)
console.log('\n──── First 3 items ────\n')
for (const it of result.items.slice(0, 3)) {
  console.log(JSON.stringify(it, null, 2))
  console.log('───')
}
