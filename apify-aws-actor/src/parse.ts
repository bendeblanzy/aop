/**
 * Parsers HTML pour marches-publics.info (AWSolutions MPE).
 *
 * Structure HTML observée le 2026-04-29 :
 *
 * Page listing (/Annonces/lister) :
 *   - Un <div class="container-fluid" id="entity"> par AO
 *   - Dates dans .affiche_date_avis → .col-md-3 (publi) et .col-md-6 (deadline)
 *   - Organisme + CP dans <h2 class="h2-avis">ORGANISME (XXXXX)</h2>
 *   - Réf acheteur dans <div class="col-12 col-md-12 ref-acheteur">[réf. XXXX]
 *   - Intitulé = texte dans <div id="titre_box"> hors réf + <p>
 *   - URL consultation → <a href="/Annonces/MPI-pub-XXXXXXXX.htm" title="Consulter l'avis">
 *   - Pagination → <a href="?pager_s=N" rel="next">
 *
 * Page détail (/Annonces/MPI-pub-XXXXXXXX.htm) :
 *   - SIRET dans le bloc acheteur : texte "SIRET 12345678901234"
 *   - Données clés dans tableau AW_TableM : <td><b>Label</b></td><td>Valeur</td>
 *   - CPV principal : <td><b>Code CPV principal</b></td><td><strong>71800000</strong>
 *   - Valeur estimée : "Valeur estimée hors TVA : 246 000,00 €"
 *   - Lots : tableau avec colonnes "Lots" | "Libellé" | "Estimé € HT" | "CPV"
 *     chaque ligne : N° X | intitulé | valeur | <b>79311200</b>
 */

import * as cheerio from 'cheerio'
import type { AwsMpiLot } from './types.js'

// ─── Helpers date ─────────────────────────────────────────────────────────────

/**
 * "26/03/26" ou "26/03/2026" → "2026-03-26"
 */
function parseDateFR(s: string): string | null {
  if (!s) return null
  const m = s.trim().match(/(\d{1,2})\/(\d{2})\/(\d{2,4})/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = m[2]
  let year = m[3]
  if (year.length === 2) year = `20${year}`
  return `${year}-${month}-${day}`
}

/**
 * "30/04/26 à 12h00" → "2026-04-30T12:00:00+00:00"
 * "30/04/26" (sans heure) → "2026-04-30T00:00:00+00:00"
 */
function parseDateLimiteFR(s: string): string | null {
  if (!s) return null
  // Avec heure
  const withTime = s.match(/(\d{1,2})\/(\d{2})\/(\d{2,4})\s+à\s+(\d{1,2})h(\d{2})/)
  if (withTime) {
    const day = withTime[1].padStart(2, '0')
    const month = withTime[2]
    let year = withTime[3]
    if (year.length === 2) year = `20${year}`
    const hour = withTime[4].padStart(2, '0')
    const min = withTime[5]
    return `${year}-${month}-${day}T${hour}:${min}:00+00:00`
  }
  // Sans heure
  const dateOnly = parseDateFR(s)
  if (dateOnly) return `${dateOnly}T00:00:00+00:00`
  return null
}

/**
 * "23400" → ["23"]
 * "75001" → ["75"]
 * "2A004" → ["2A"] (Corse du Sud)
 * "97100" → ["971"] (DOM — 3 chiffres)
 */
function codePostalToDept(cp: string): string[] {
  if (!cp) return []
  const s = cp.trim()
  // DOM-TOM (97x, 98x) → 3 chiffres
  if (/^(97|98)\d/.test(s)) return [s.slice(0, 3)]
  // Corse 2A/2B
  if (/^2[AB]/i.test(s)) return [s.slice(0, 2).toUpperCase()]
  // Métropole
  if (/^\d{5}$/.test(s)) return [s.slice(0, 2)]
  return []
}

// ─── Listing page ─────────────────────────────────────────────────────────────

export interface ListingItem {
  /** Numéro MPI extrait de l'URL (ex: "20260871430") */
  mpiRef: string
  referenceAcheteur: string | null
  intitule: string | null
  organisme: string | null
  codePostal: string | null
  codeDepartement: string[]
  datePublication: string | null
  dateLimite: string | null
  urlConsultation: string
  nbLots: number | null
}

export interface ListingResult {
  items: ListingItem[]
  /** true si une page suivante existe */
  hasNextPage: boolean
  /** numéro de la page suivante (pager_s) ou null */
  nextPageNum: number | null
}

const BASE_URL = 'https://www.marches-publics.info'

export function parseListingPage(html: string): ListingResult {
  const $ = cheerio.load(html)
  const items: ListingItem[] = []

  // On cible tous les div[id="entity"] — un par AO dans la liste
  // (id dupliqué = invalide en HTML mais Cheerio les retourne tous)
  $('[id="entity"]').each((_, el) => {
    try {
      const $el = $(el)

      // ── URL consultation → mpiRef ─────────────────────────────────────────
      const consultHref = $el.find('a[title="Consulter l\'avis"]').attr('href') ?? ''
      const mpiRefMatch = consultHref.match(/MPI-pub-(\d+)\.htm/i)
      if (!mpiRefMatch) return // AO sans URL valide → skip
      const mpiRef = mpiRefMatch[1]
      const urlConsultation = `${BASE_URL}${consultHref}`

      // ── Dates ──────────────────────────────────────────────────────────────
      const dateRow = $el.find('.affiche_date_avis')
      const pubRaw = dateRow.find('.col-md-3').first().text()
      const deadlineRaw = dateRow.find('.col-md-6').text()

      // "Publié le 26/03/26          |" → extraire la date
      const pubMatch = pubRaw.match(/(\d{1,2}\/\d{2}\/\d{2,4})/)
      const datePublication = pubMatch ? parseDateFR(pubMatch[1]) : null

      // "Date limite : le 30/04/26 à 12h00"
      const dateLimite = parseDateLimiteFR(deadlineRaw)

      // ── Organisme + code postal ─────────────────────────────────────────────
      const h2Text = $el.find('.h2-avis').first().text().trim()
      // Format : "CC CREUSE SUD OUEST\n                (23400)\n            "
      const orgMatch = h2Text.match(/^([\s\S]*?)\s*\((\d+[A-Z]?\d*)\)\s*$/i)
      const organisme = orgMatch ? orgMatch[1].replace(/\s+/g, ' ').trim() : h2Text.replace(/\s+/g, ' ').trim() || null
      const codePostal = orgMatch ? orgMatch[2] : null
      const codeDepartement = codePostal ? codePostalToDept(codePostal) : []

      // ── Référence acheteur ─────────────────────────────────────────────────
      const refText = $el.find('.ref-acheteur').first().text().trim()
      const refMatch = refText.match(/\[r[ée]f\.\s*(.+?)\]/i)
      const referenceAcheteur = refMatch ? refMatch[1].trim() : null

      // ── Intitulé ───────────────────────────────────────────────────────────
      // Texte dans #titre_box après avoir retiré .ref-acheteur et <p>
      const titreBoxClone = $el.find('#titre_box').clone()
      titreBoxClone.find('.ref-acheteur').remove()
      titreBoxClone.find('p').remove()
      const intitule = titreBoxClone.text().replace(/\s+/g, ' ').trim() || null

      // ── Nombre de lots ─────────────────────────────────────────────────────
      // "[Marché alloti : 3 lots]" dans le <p> qu'on avait supprimé pour intitulé
      // → on le relit depuis l'original
      const lotsText = $el.find('#titre_box p').first().text()
      const lotsMatch = lotsText.match(/alloti\s*:\s*(\d+)\s*lots?/i)
      const nbLots = lotsMatch ? parseInt(lotsMatch[1], 10) : null

      items.push({
        mpiRef,
        referenceAcheteur,
        intitule,
        organisme,
        codePostal,
        codeDepartement,
        datePublication,
        dateLimite,
        urlConsultation,
        nbLots,
      })
    } catch {
      // item malformé → on skip silencieusement
    }
  })

  // ── Pagination ──────────────────────────────────────────────────────────────
  const nextLink = $('a[rel="next"]')
  const hasNextPage = nextLink.length > 0
  let nextPageNum: number | null = null
  if (hasNextPage) {
    const href = nextLink.attr('href') ?? ''
    const pageMatch = href.match(/pager_s=(\d+)/)
    if (pageMatch) nextPageNum = parseInt(pageMatch[1], 10)
  }

  return { items, hasNextPage, nextPageNum }
}

// ─── Detail page ──────────────────────────────────────────────────────────────

export interface DetailData {
  siret: string | null
  objet: string | null
  procedure_type: string | null
  type_marche: string | null
  lieu_execution: string | null
  cpv_codes: string[]
  valeur_estimee: number | null
  lots: AwsMpiLot[]
}

export function parseDetailPage(html: string): DetailData {
  const $ = cheerio.load(html)

  // ── SIRET ─────────────────────────────────────────────────────────────────
  const bodyText = $.text()
  const siretMatch = bodyText.match(/SIRET\s+(\d{14})/)
  const siret = siretMatch ? siretMatch[1] : null

  // ── Table label → valeur ──────────────────────────────────────────────────
  // Pattern : <tr><td ...><b>Label</b></td><td ...>Valeur</td></tr>
  const tableData: Record<string, string> = {}
  $('tr').each((_, row) => {
    const tds = $(row).find('td')
    if (tds.length < 2) return
    const labelEl = $(tds[0]).find('b').first()
    const label = labelEl.text().trim()
    if (!label) return
    const value = $(tds[1]).text().trim().replace(/\s+/g, ' ')
    tableData[label] = value
  })

  // ── Objet (titre principal) ───────────────────────────────────────────────
  // Dans la ligne "AW_TableM_Entete" avec <b>Objet</b>
  const objetRow = $('td.AW_TableM_Entete:has(b:contains("Objet"))').closest('tr')
  const objetRaw = objetRow.find('td').eq(1).text().trim().replace(/\s+/g, ' ')
  const objet = objetRaw || tableData['Description'] || null

  // ── Type de marché ─────────────────────────────────────────────────────────
  const typeMarche = tableData['Type de marché'] ?? null

  // ── Procédure ─────────────────────────────────────────────────────────────
  const procedureType = tableData['Mode'] ?? tableData['Procédure'] ?? null

  // ── Lieu d'exécution ──────────────────────────────────────────────────────
  const lieuExecution = tableData["Lieu principal d'exécution"]
    ?? tableData["Lieu d'exécution"]
    ?? null

  // ── CPV principal ──────────────────────────────────────────────────────────
  const cpvSet = new Set<string>()
  // La cellule contient "<strong>71800000</strong> - Services..."
  $('td.AW_TableM_Bloc1_Clair, td.AW_TableM_Entete').each((_, td) => {
    const b = $(td).find('b').first().text().trim()
    if (b === 'Code CPV principal') {
      const strong = $(td).closest('tr').find('td').eq(1).find('strong').first().text().trim()
      const code = strong.replace(/\s+/g, '')
      if (code && /^\d{8}/.test(code)) cpvSet.add(code.slice(0, 8))
    }
  })

  // ── Lots ──────────────────────────────────────────────────────────────────
  const lots: AwsMpiLot[] = []

  // Table des lots : entête "Lots | Libellé | Estimé € HT | CPV"
  // Lignes : AW_TableM_Bloc1_Clair ou AW_TableM_Bloc1_Fonce alternés
  // Première colonne contient "N° X"
  const lotsTableRows = $('td.AW_TableM_Entete:contains("Lots")').closest('table').find('tr')
  lotsTableRows.each((_, row) => {
    const tds = $(row).find('td')
    if (tds.length < 3) return
    const firstText = $(tds[0]).text().trim()
    const lotNumMatch = firstText.match(/N°\s*(\d+)/i)
    if (!lotNumMatch) return

    const numero = lotNumMatch[1]

    // Intitulé : premier fragment avant <br> dans la 2e colonne
    const intituleHtml = $(tds[1]).html() ?? ''
    const intituleFull = intituleHtml.split(/<br\s*\/?>/i)[0]
    const intitule = intituleFull.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null

    // CPV : dans la dernière colonne, balise <b>
    const cpvTd = $(tds[tds.length - 1])
    const cpvRaw = cpvTd.find('b').first().text().trim().replace(/\s+/g, '')
    const cpv = cpvRaw && /^\d{8}/.test(cpvRaw) ? cpvRaw.slice(0, 8) : null
    if (cpv) cpvSet.add(cpv)

    lots.push({ numero, intitule, cpv })
  })

  // ── Valeur estimée ────────────────────────────────────────────────────────
  // "Valeur estimée hors TVA : 246 000,00 €"
  let valeurEstimee: number | null = null
  const valeurMatch = $('body').text().match(
    /Valeur estim[ée]+\s+hors\s+TVA\s*:\s*([\d\s]+),(\d{2})/i,
  )
  if (valeurMatch) {
    const integer = valeurMatch[1].replace(/\s/g, '')
    const decimal = valeurMatch[2]
    const v = parseFloat(`${integer}.${decimal}`)
    if (Number.isFinite(v) && v > 0) valeurEstimee = Math.round(v)
  }

  return {
    siret,
    objet,
    procedure_type: procedureType,
    type_marche: typeMarche,
    lieu_execution: lieuExecution,
    cpv_codes: [...cpvSet],
    valeur_estimee: valeurEstimee,
    lots,
  }
}
