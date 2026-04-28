import * as cheerio from 'cheerio'
import type { AtexoLot } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Enrichissement des fiches détail Atexo MPE (P6, 2026-04-29).
//
// Objectif : après la collecte listing (CPV vide, valeur=null, lots=[]), récupérer
// en HTTP simple la page de détail de chaque consultation pour en extraire :
//   - codes CPV (span[data-code-cpv] — observé PLACE + Maximilien + Alsace)
//   - valeur estimée (li.clearfix > label "Valeur estimée")
//   - lots (tableau intitulé "Lot N°")
//   - URL DCE (lien contenant "dce" ou "dossier")
//
// Pourquoi HTTP brut et non Playwright ?
//   La page /app.php/entreprise/consultation/… est un rendu serveur PHP (PRADO).
//   Les données CPV/valeur/lots sont dans le HTML initial — pas de JS nécessaire.
//   → HTTP fetch : ~200-800ms vs ~3-5s Playwright, soit 10× plus rapide.
//
// Sélecteurs validés le 2026-04-29 sur PLACE (marches-publics.gouv.fr)
// et Maximilien (marches.maximilien.fr).
// ─────────────────────────────────────────────────────────────────────────────

export interface AtexoDetailResult {
  cpv_codes: string[]
  valeur_estimee: number | null
  lots: AtexoLot[]
  url_dce: string | null
}

const DETAIL_TIMEOUT_MS = 8_000
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/120.0.0.0 Safari/537.36 LADNDataAtexoScraper/2.0'

const EMPTY: AtexoDetailResult = { cpv_codes: [], valeur_estimee: null, lots: [], url_dce: null }

/**
 * Fetch HTTP simple de la fiche détail Atexo et extraction des données d'enrichissement.
 * Ne lance pas de navigateur — utilise l'API fetch standard + cheerio.
 * Retourne un objet vide en cas d'erreur réseau ou de timeout (fail-safe).
 */
export async function fetchAtexoDetail(url: string): Promise<AtexoDetailResult> {
  let html: string
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'User-Agent': USER_AGENT,
      },
    })
    if (!res.ok) return EMPTY
    html = await res.text()
  } catch {
    return EMPTY
  }

  const $ = cheerio.load(html)

  // ── 1. CPV codes ─────────────────────────────────────────────────────────
  // Structure : <span data-code-cpv="72262000">72262000 (Code principal)</span>
  // Plusieurs spans possibles (CPV principal + CPV secondaires).
  const cpvCodes: string[] = []
  $('span[data-code-cpv]').each((_, el) => {
    const code = $(el).attr('data-code-cpv')?.trim()
    if (code && !cpvCodes.includes(code)) cpvCodes.push(code)
  })

  // ── 2. Valeur estimée ────────────────────────────────────────────────────
  // Structure : <li class="clearfix">
  //   <label class="col-md-4 ...">Valeur estimée :</label>
  //   <div class="col-md-8 ...">1 234 567,00 EUR</div>
  // </li>
  let valeurEstimee: number | null = null
  $('li.clearfix').each((_, li) => {
    const labelText = $(li).find('label').text().trim().toLowerCase()
    if (labelText.includes('valeur') || labelText.includes('montant')) {
      const rawVal = $(li).find('div').first().text().replace(/\n/g, ' ').trim()
      // Supprimer espaces insécables + EUR + € + lettre, garder chiffres + , + .
      const cleaned = rawVal
        .replace(/[ \s]/g, '') // espaces et insécables
        .replace(/[€EeUrR]/g, '')   // unité "EUR" ou "€"
        .replace(',', '.')           // virgule décimale FR → point
      const n = parseFloat(cleaned)
      if (Number.isFinite(n) && n > 0) valeurEstimee = Math.round(n)
    }
  })

  // ── 3. Lots ──────────────────────────────────────────────────────────────
  // Structure variable selon la version Atexo :
  //   a) Tableau <tr> : <td>Lot N°1</td><td>Prestations de communication</td>
  //   b) Divs : <div class="lot-...">
  // On cherche les lignes où la première cellule commence par "Lot".
  const lots: AtexoLot[] = []

  // Stratégie a — tableau
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td')
    if (cells.length < 1) return
    const firstCellText = $(cells[0]).text().trim()
    if (/^lot\s*n?°?\s*\d/i.test(firstCellText)) {
      lots.push({
        numero: firstCellText.replace(/lot\s*n?°?\s*/i, '').trim() || null,
        intitule: cells.length > 1 ? $(cells[1]).text().trim() || null : null,
        description: cells.length > 2 ? $(cells[2]).text().trim() || null : null,
      })
    }
  })

  // Stratégie b — div headings si tableau n'a rien donné
  if (lots.length === 0) {
    $('h3, h4, .lot-titre, .lot-intitule, [class*="lot-head"]').each((_, el) => {
      const text = $(el).text().trim()
      if (/^lot\s*n?°?\s*\d/i.test(text)) {
        const desc = $(el).next('p, div, .lot-desc').text().trim() || null
        lots.push({
          numero: text.replace(/lot\s*n?°?\s*/i, '').trim() || null,
          intitule: text,
          description: desc,
        })
      }
    })
  }

  // ── 4. URL DCE ───────────────────────────────────────────────────────────
  // Chercher un lien vers le dossier de consultation
  let urlDce: string | null = null
  $('a').each((_, el) => {
    if (urlDce) return // déjà trouvé
    const text = $(el).text().trim().toLowerCase()
    const href = $(el).attr('href') ?? ''
    const isMatch =
      text.includes('dce') ||
      text.includes('dossier') ||
      text.includes('télécharger le dossier') ||
      href.toLowerCase().includes('dce')
    if (isMatch && href.startsWith('http')) urlDce = href
  })

  return { cpv_codes: cpvCodes, valeur_estimee: valeurEstimee, lots, url_dce: urlDce }
}

/**
 * Enrichit un tableau d'items Atexo en fetchant leurs fiches de détail en parallèle.
 *
 * @param items          Items à enrichir (modifiés en place — cpv_codes, valeur_estimee, lots, url_dce)
 * @param maxItems       Cap max d'items à enrichir (défaut 50, pour maîtriser le temps d'exécution)
 * @param concurrency    Fetches simultanés (défaut 8 — bon compromis débit/politesse)
 */
export async function enrichItemsWithDetails(
  items: Array<{
    url_consultation: string
    cpv_codes: string[]
    valeur_estimee: number | null
    lots: AtexoLot[]
    url_dce: string | null
  }>,
  maxItems = 50,
  concurrency = 8,
): Promise<{ enriched: number; withCpv: number }> {
  const toEnrich = items.slice(0, maxItems)
  let enriched = 0
  let withCpv = 0

  // Semaphore simple (Promise pool) pour limiter la concurrence
  const queue = [...toEnrich]
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      const detail = await fetchAtexoDetail(item.url_consultation)
      if (detail.cpv_codes.length > 0) {
        item.cpv_codes = detail.cpv_codes
        withCpv++
      }
      if (detail.valeur_estimee !== null && item.valeur_estimee === null) {
        item.valeur_estimee = detail.valeur_estimee
      }
      if (detail.lots.length > 0 && item.lots.length === 0) {
        item.lots = detail.lots
      }
      if (detail.url_dce && !item.url_dce) {
        item.url_dce = detail.url_dce
      }
      enriched++
    }
  })

  await Promise.all(workers)
  return { enriched, withCpv }
}
