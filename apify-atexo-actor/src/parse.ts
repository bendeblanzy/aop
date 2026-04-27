import * as cheerio from 'cheerio'
import type { AtexoApifyItem, AtexoProviderId } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Parsing du HTML Atexo MPE — page de listing.
//
// Structure observée le 2026-04-27 sur PLACE (marches-publics.gouv.fr) et
// supposée identique sur Maximilien (marches.maximilien.fr) puisque les deux
// tournent sur le même moteur Atexo Local Trust MPE.
//
// Le listing n'est PAS un <table>. C'est une liste de `<div class="item_consultation">`.
// ─────────────────────────────────────────────────────────────────────────────

const FRENCH_MONTHS_ABBR: Record<string, string> = {
  'janv.': '01', 'janv': '01', 'jan.': '01',
  'fév.': '02', 'fev.': '02', 'fév': '02', 'fev': '02', 'févr.': '02',
  'mars': '03', 'mar.': '03',
  'avr.': '04', 'avr': '04', 'avril': '04',
  'mai': '05',
  'juin': '06',
  'juil.': '07', 'juil': '07', 'juillet': '07',
  'août': '08', 'aout': '08',
  'sept.': '09', 'sept': '09', 'septembre': '09',
  'oct.': '10', 'oct': '10', 'octobre': '10',
  'nov.': '11', 'nov': '11', 'novembre': '11',
  'déc.': '12', 'dec.': '12', 'déc': '12', 'dec': '12', 'décembre': '12',
}

function monthFr(m: string | null | undefined): string | null {
  if (!m) return null
  const key = m.trim().toLowerCase().replace(/\s+/g, '')
  return FRENCH_MONTHS_ABBR[key] ?? null
}

/** Extrait jour/mois/année d'un bloc `.date` Atexo (cons_ref ou cons_dateEnd). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDateBlock($block: any): { day: string | null; month: string | null; year: string | null } {
  if (!$block || $block.length === 0) return { day: null, month: null, year: null }
  const day = $block.find('.day span').first().text().trim() || null
  const month = monthFr($block.find('.month span').first().text().trim())
  const year = $block.find('.year span').first().text().trim() || null
  return { day, month, year }
}

/** Construit une date ISO YYYY-MM-DD à partir de jour/mois/année texte. */
function buildIsoDate(day: string | null, month: string | null, year: string | null): string | null {
  if (!day || !month || !year) return null
  const dd = day.padStart(2, '0')
  const mm = month.padStart(2, '0')
  if (!/^\d{2}$/.test(dd) || !/^\d{2}$/.test(mm) || !/^\d{4}$/.test(year)) return null
  return `${year}-${mm}-${dd}`
}

/** Mappe la catégorie Atexo en valeur normalisée (SERVICES / TRAVAUX / FOURNITURES). */
function normalizeCategorie(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  if (!t) return null
  if (t.startsWith('serv')) return 'SERVICES'
  if (t.startsWith('trav')) return 'TRAVAUX'
  if (t.startsWith('fourn')) return 'FOURNITURES'
  return s.trim().toUpperCase()
}

/** Déduit le code département depuis "(75) Paris" → ["75"]. */
function extractDept(s: string | null | undefined): string[] {
  if (!s) return []
  const m = s.match(/\((\d{2,3})\)/)
  return m ? [m[1]] : []
}

export interface ListingPageResult {
  totalPages: number | null
  totalResults: number | null
  pradoPageState: string | null
  items: AtexoApifyItem[]
  /**
   * Cible PRADO_POSTBACK_TARGET pour aller à la page suivante.
   * Détection dynamique : on cherche le <a> dont le span a title="Aller à la
   * page suivante", et on convertit son `id` en notation $ (PRADO event-target).
   * Null si on est sur la dernière page (le bouton est désactivé/absent).
   */
  nextPageTarget: string | null
}

/**
 * Cherche dans le HTML l'EventTarget PRADO pour aller à la page suivante.
 *
 * Stratégie : on identifie d'abord l'`id` DOM du <a> "Aller à la page
 * suivante", puis on cherche dans les bindings JS PRADO la ligne
 * correspondante : `new Prado.WebUI.TLinkButton({'ID':"<id>", 'EventTarget':"<target>", ...})`.
 *
 * On NE convertit PAS naïvement `_` → `$` : les noms de contrôles peuvent
 * contenir des underscores (ex `CONTENU_PAGE`) qu'il faut conserver.
 */
export function findNextPageTarget(html: string): string | null {
  // 1. Extraire l'id DOM du <a> "Aller à la page suivante"
  const aRe = /<a\s+id="([^"]*PagerTop[^"]*?ctl\d+)"[^>]*>\s*<span[^>]*title=["']Aller à la page suivante["'][^>]*>/i
  const aMatch = html.match(aRe)
  if (!aMatch) return null
  const linkId = aMatch[1]

  // 2. Chercher dans les bindings JS l'EventTarget associé à cet id
  // Format observé : new Prado.WebUI.TLinkButton({'ID':"<id>",'EventTarget':"<target>", ...})
  // Les single-quotes sont possibles dans le JSON inline. On accepte les deux.
  const escId = linkId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const bindRe = new RegExp(
    `['"]ID['"]\\s*:\\s*['"]${escId}['"]\\s*,\\s*['"]EventTarget['"]\\s*:\\s*['"]([^'"]+)['"]`,
    'i',
  )
  const bMatch = html.match(bindRe)
  if (bMatch) return bMatch[1]

  // 3. Fallback : conversion naïve (peut échouer sur les noms multi-mot
  // contenant des _ comme CONTENU_PAGE) — mais mieux que rien.
  return linkId.replace(/_/g, '$')
}

/**
 * Parse une page de listing Atexo MPE.
 *
 * @param html       Le HTML brut de la page
 * @param baseUrl    Base URL de la plateforme (ex "https://www.marches-publics.gouv.fr")
 * @param provider   Identifiant logique de la plateforme ('place' | 'mxm')
 */
export function parseListingPage(
  html: string,
  baseUrl: string,
  provider: AtexoProviderId,
): ListingPageResult {
  const $ = cheerio.load(html)

  // Métadonnées
  const totalPagesText = $('#ctl0_CONTENU_PAGE_resultSearch_nombrePageTop').first().text().trim()
  const totalResultsText = $('#ctl0_CONTENU_PAGE_resultSearch_nombreElement').first().text().trim()
  const totalPages = totalPagesText ? Number.parseInt(totalPagesText, 10) || null : null
  const totalResults = totalResultsText ? Number.parseInt(totalResultsText, 10) || null : null

  // PRADO_PAGESTATE — input type=text style=display:none
  const pradoPageState = $('input[name="PRADO_PAGESTATE"]').first().attr('value') ?? null

  // Items
  const items: AtexoApifyItem[] = []
  $('div.item_consultation').each((_, el) => {
    const $row = $(el)

    // refCons / orgCons via les inputs cachés (les + fiables)
    const refCons = $row.find('input[id$="_refCons"]').first().attr('value')?.trim() ?? null
    const orgCons = $row.find('input[id$="_orgCons"]').first().attr('value')?.trim() ?? null
    if (!refCons || !orgCons) return

    // Référence visible (ex "110-26-01-RPPM") — premier .small.pull-left dans panelBlocIntitule
    const refVisible = $row
      .find('div[id$="_panelBlocIntitule"] div.objet-line div.m-b-1 div.small.pull-left')
      .first()
      .text()
      .trim() || null

    // Intitulé : truncate text, on prend le title pour la version complète
    const $intituleEl = $row.find('div[id$="_panelBlocIntitule"] div.truncate span[title]').first()
    const intitule = ($intituleEl.attr('title') ?? $intituleEl.text() ?? '').trim() || null

    // Objet : .truncate-700 a un title avec la version complète
    const $objetEl = $row.find('div[id$="_panelBlocObjet"] div.truncate-700').first()
    const objet = ($objetEl.attr('title') ?? $objetEl.find('span.small span').first().text() ?? '').trim() || null

    // Organisme
    const $orgEl = $row.find('div[id$="_panelBlocDenomination"] div.truncate-700').first()
    const organisme = ($orgEl.attr('title') ?? $orgEl.find('span.small').first().text() ?? '').trim() || null

    // Lieu d'exécution
    const lieu = $row.find('div[id$="_panelBlocLieuxExec"] span span').first().text().trim() || null
    const code_departement = extractDept(lieu)

    // Type procédure (abbr title = long, span = court)
    const $procEl = $row.find('div.cons_procedure abbr').first()
    const procedure_type = ($procEl.attr('title') ?? $procEl.find('span').first().text() ?? '').trim() || null

    // Catégorie de marché
    const categorieRaw = $row.find('div[id$="_panelBlocCategorie"] span').first().text().trim() || null
    const type_marche = normalizeCategorie(categorieRaw)

    // Dates
    const $datePubBlock = $row.find('div.cons_ref div.date.date-min').first()
    const datePub = extractDateBlock($datePubBlock)
    const date_publication = buildIsoDate(datePub.day, datePub.month, datePub.year)

    const $dateEndBlock = $row.find('div.cons_dateEnd div.cloture-line div.date').first()
    const dateEnd = extractDateBlock($dateEndBlock)
    const dateEndIso = buildIsoDate(dateEnd.day, dateEnd.month, dateEnd.year)
    const heure = $row.find('div.cons_dateEnd div.time label').first().text().trim() || null
    const date_limite_remise = dateEndIso
      ? `${dateEndIso}T${heure && /^\d{1,2}:\d{2}/.test(heure) ? heure.padStart(5, '0') : '12:00'}:00+02:00`
      : null

    // Reference utilisée comme idweb : on combine la référence visible (lisible)
    // et l'id technique pour garantir l'unicité. Si pas de ref visible on retombe
    // sur l'id technique seul.
    const reference = refVisible
      ? `${refVisible}|${refCons}`
      : refCons

    // URL canonique de la fiche (pattern app.php valable PLACE et Maximilien)
    const url_consultation = `${baseUrl}/app.php/entreprise/consultation/${refCons}?orgAcronyme=${encodeURIComponent(orgCons)}`

    items.push({
      provider,
      reference,

      intitule,
      objet,
      organisme,
      reference_acheteur: refVisible,

      procedure_type,
      type_marche,

      date_publication,
      date_limite_remise,

      lieu_execution: lieu,
      code_departement,

      cpv_codes: [],

      valeur_estimee: null,

      url_consultation,
      url_dce: null,

      lots: [],

      scraped_at: new Date().toISOString(),
    })
  })

  return { totalPages, totalResults, pradoPageState, items, nextPageTarget: findNextPageTarget(html) }
}
