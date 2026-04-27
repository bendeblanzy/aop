import type { TedNotice, TedSearchResponse, TedSyncResult } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Synchronisation TED (Tenders Electronic Daily — UE)
//
// API officielle v3 : https://api.ted.europa.eu/v3/notices/search
// Documentation : https://docs.ted.europa.eu/api/latest/
//
// On filtre :
//  - PoP country = FRA (lieu d'exécution en France)
//  - notice-type ∈ {cn-standard, cn-social} (avis de marché)
//  - publication-date sur les N derniers jours
//
// Sans clé API, le quota est limité (~ 30 req/min). Avec clé EU Login en
// header `X-API-Key`, le quota monte. La clé est optionnelle ici — on tombe
// gracieusement en mode anonyme si TED_API_KEY n'est pas défini.
// ─────────────────────────────────────────────────────────────────────────────

const TED_BASE_URL = 'https://api.ted.europa.eu/v3/notices/search'
const PAGE_SIZE = 250
const DELAY_MS = 1100 // ~50 req/min en marge sous le quota anonyme

// Noms exacts des champs TED v3 (validés via le check de l'API en avril 2026).
// La nomenclature suffixée (-lot, -part, -proc, -glo) est imposée par TED selon
// le scope. On prend les variantes "-lot" pour les avis de marché (CN) qui ont
// au moins un lot.
const TED_FIELDS = [
  'publication-number',
  'publication-date',
  'notice-type',
  'notice-title',
  'description-lot',
  'buyer-name',
  'place-of-performance-country-lot',
  'place-of-performance-country-part',
  'place-of-performance-subdiv-lot',
  'procedure-type',
  'contract-nature',
  'deadline-date-lot',
  'deadline-receipt-tender-date-lot',
  'estimated-value-glo',
  'estimated-value-cur-glo',
  'estimated-value-lot',
  'duration-period-value-lot',
  'duration-period-unit-lot',
  'classification-cpv',
  'document-url-lot',
  'buyer-profile',
  'links',
] as const

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

/**
 * Extrait une string d'un champ TED. Les valeurs TED v3 sont quasi
 * systématiquement des arrays (par lot), parfois imbriqués dans un objet
 * multi-langues `{fra: [...], eng: [...]}`. On déroule récursivement et on
 * privilégie la première valeur en français.
 */
function extractText(v: unknown, preferredLang: 'fra' | 'eng' = 'fra'): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (Array.isArray(v)) return v.length > 0 ? extractText(v[0], preferredLang) : null
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    const langs: ('fra' | 'eng')[] = preferredLang === 'fra' ? ['fra', 'eng'] : ['eng', 'fra']
    for (const lang of langs) {
      const val = obj[lang]
      if (val !== undefined) {
        const t = extractText(val, preferredLang)
        if (t) return t
      }
    }
    // Fallback : première valeur exploitable
    for (const val of Object.values(obj)) {
      const t = extractText(val, preferredLang)
      if (t) return t
    }
  }
  return null
}

/** Aplatit un champ TED en tableau de strings unique (sans doublons). */
function extractStringArray(v: unknown): string[] {
  if (v == null) return []
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) {
    const set = new Set<string>()
    for (const item of v) {
      if (typeof item === 'string' && item.trim()) set.add(item.trim())
      else if (item && typeof item === 'object') {
        for (const sub of extractStringArray(item)) set.add(sub)
      }
    }
    return [...set]
  }
  if (typeof v === 'object') {
    const set = new Set<string>()
    for (const sub of Object.values(v as Record<string, unknown>)) {
      for (const s of extractStringArray(sub)) set.add(s)
    }
    return [...set]
  }
  return []
}

/** Convertit une date TED ("2026-06-05+02:00") en ISO timestamptz propre. */
function cleanDate(v: unknown): string | null {
  if (v == null) return null
  if (Array.isArray(v)) return v.length > 0 ? cleanDate(v[0]) : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  // Format TED : "2026-06-05+02:00" → on remplace +HH:MM par TZ ISO
  // Si pas de heure, on ajoute T00:00:00 pour produire un timestamptz valide
  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})([+-]\d{2}:\d{2}|Z)?$/)
  if (dateOnly) {
    const tz = dateOnly[2] ?? '+00:00'
    return `${dateOnly[1]}T00:00:00${tz}`
  }
  return s
}

/**
 * Construit la query TED EQL.
 *
 * NB : TED v3 attend les dates au format YYYYMMDD (8 chiffres, sans tirets) ou
 * la fonction relative `today(-N)`. On utilise `today(-N)` qui est plus clair
 * et évite les soucis de fuseau horaire.
 */
function buildQuery(daysBack: number): string {
  return [
    `publication-date >= today(-${daysBack})`,
    `notice-type IN (cn-standard cn-social cn-desg)`,
    `place-of-performance-country-lot = "FRA"`,
  ].join(' AND ')
}

/** Appelle l'API TED v3 (une page) */
async function fetchTedPage(query: string, page: number): Promise<TedSearchResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
  if (process.env.TED_API_KEY) {
    headers['X-API-Key'] = process.env.TED_API_KEY
  }

  const response = await fetch(TED_BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      fields: TED_FIELDS,
      limit: PAGE_SIZE,
      page,
      scope: 'ALL',
      paginationMode: 'PAGE_NUMBER',
    }),
    signal: AbortSignal.timeout(45_000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`TED API error: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`)
  }

  return response.json() as Promise<TedSearchResponse>
}

/**
 * Transforme une notice TED en payload compatible avec la table `tenders`.
 * Le contract avec la table : mêmes colonnes que les annonces BOAMP, plus
 * `source = 'ted'` et `idweb` préfixé "ted-".
 */
export function transformTedNotice(notice: TedNotice) {
  const pubNumber = String(notice['publication-number'] ?? '').trim()
  if (!pubNumber) return null

  const idweb = `ted-${pubNumber}`
  const objet = extractText(notice['notice-title'])
  const description = extractText(notice['description-lot'])
  const acheteur = extractText(notice['buyer-name'])

  // Valeur estimée — on essaie d'abord -glo (global), sinon on somme les -lot
  let valeurEstimee: number | null = null
  const glo = notice['estimated-value-glo']
  if (typeof glo === 'number') valeurEstimee = Math.round(glo)
  else if (Array.isArray(glo) && glo.length > 0) {
    const n = Number(glo[0])
    if (Number.isFinite(n) && n > 0) valeurEstimee = Math.round(n)
  }
  if (valeurEstimee === null) {
    const lots = notice['estimated-value-lot']
    if (Array.isArray(lots)) {
      const sum = lots.reduce((acc: number, v) => {
        const n = Number(v)
        return Number.isFinite(n) && n > 0 ? acc + n : acc
      }, 0)
      if (sum > 0) valeurEstimee = Math.round(sum)
    } else if (typeof lots === 'number') valeurEstimee = Math.round(lots)
  }

  // Durée : valeur du 1er lot + son unité
  let dureeMois: number | null = null
  const durValueRaw = Array.isArray(notice['duration-period-value-lot'])
    ? (notice['duration-period-value-lot'] as unknown[])[0]
    : notice['duration-period-value-lot']
  const durValue = Number(durValueRaw)
  const durUnit = String(extractText(notice['duration-period-unit-lot']) ?? '').toUpperCase()
  if (Number.isFinite(durValue) && durValue > 0) {
    if (durUnit.includes('YEAR') || durUnit === 'ANN') dureeMois = Math.round(durValue * 12)
    else if (durUnit.includes('DAY')) dureeMois = Math.max(1, Math.round(durValue / 30))
    else dureeMois = Math.round(durValue) // défaut : MONTH
  }

  // CPV : codes uniques (TED retourne souvent des doublons par lot)
  const cpvCodes = extractStringArray(notice['classification-cpv'])

  // Lieu (NUTS — code de subdivision)
  const nutsCodes = extractStringArray(notice['place-of-performance-subdiv-lot'])

  // Type marché : mappe contract-nature TED vers les valeurs BOAMP
  const nature = extractText(notice['contract-nature'])
  const typeMarcheMap: Record<string, string> = {
    'works': 'TRAVAUX',
    'services': 'SERVICES',
    'supplies': 'FOURNITURES',
  }
  const typeMarche = nature ? (typeMarcheMap[nature.toLowerCase()] ?? nature.toUpperCase()) : null

  // URL profil acheteur — buyer-profile en priorité, sinon document-url-lot
  let urlProfilAcheteur = extractText(notice['buyer-profile'])
  if (!urlProfilAcheteur) urlProfilAcheteur = extractText(notice['document-url-lot'])

  // URL avis : on prend le PDF FRA via links.pdf.FRA, sinon on construit
  const links = notice['links'] as { pdf?: Record<string, string>; html?: Record<string, string> } | undefined
  const urlAvis = links?.pdf?.FRA
    ?? links?.pdf?.ENG
    ?? links?.html?.FRA
    ?? `https://ted.europa.eu/fr/notice/${pubNumber}`

  // Dates : on accepte plusieurs alias (deadline-date-lot prioritaire)
  const dateparution = cleanDate(notice['publication-date'])?.split('T')[0] ?? null
  const datelimite = cleanDate(notice['deadline-date-lot'] ?? notice['deadline-receipt-tender-date-lot'])

  return {
    idweb,
    source: 'ted',
    objet: objet ?? null,
    nomacheteur: acheteur ?? null,
    famille: null,
    nature: nature ?? null,
    nature_libelle: nature ?? null,
    dateparution,
    datelimitereponse: datelimite,
    datefindiffusion: null,
    descripteur_codes: [] as string[],
    descripteur_libelles: [] as string[],
    type_marche: typeMarche,
    url_avis: urlAvis,
    url_profil_acheteur: urlProfilAcheteur,
    description_detail: description ?? null,
    valeur_estimee: valeurEstimee,
    budget_estime: valeurEstimee,
    duree_mois: dureeMois,
    cpv_codes: cpvCodes,
    code_nuts: nutsCodes.length > 0 ? nutsCodes.join(',') : null,
    code_departement: [] as string[],
    type_procedure: extractText(notice['procedure-type']),
    procedure_libelle: extractText(notice['procedure-type']),
    nb_lots: null,
    lots_titres: [] as string[],
    updated_at: new Date().toISOString(),
  }
}

/**
 * Sync principal TED.
 *
 * @param supabaseAdmin - client Supabase service_role
 * @param daysBack - nombre de jours à remonter (défaut 7, max 90)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncTedTenders(supabaseAdmin: any, daysBack = 7): Promise<TedSyncResult> {
  const result: TedSyncResult = { fetched: 0, inserted: 0, errors: 0, pages: 0 }
  const query = buildQuery(daysBack)

  let page = 1
  let totalCount = 0

  while (true) {
    let pageData: TedSearchResponse
    try {
      pageData = await fetchTedPage(query, page)
    } catch (e) {
      console.error(`[sync-ted] Erreur page ${page}:`, e instanceof Error ? e.message : e)
      result.errors++
      break
    }

    result.pages++
    const notices = pageData.notices ?? []
    result.fetched += notices.length

    if (page === 1) {
      totalCount = pageData.totalNoticeCount ?? notices.length
      console.log(`[sync-ted] Total TED: ${totalCount} notices, ~${Math.ceil(totalCount / PAGE_SIZE)} pages`)
    }

    // Transformer + upsert par lot de 50
    const records = notices
      .map(transformTedNotice)
      .filter((r): r is NonNullable<ReturnType<typeof transformTedNotice>> => r !== null)

    const BATCH = 50
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH)
      const { error, data } = await supabaseAdmin
        .from('tenders')
        .upsert(batch, { onConflict: 'idweb', ignoreDuplicates: false })
        .select('idweb')
      if (error) {
        console.error(`[sync-ted] Upsert error page=${page} batch=${i}:`, error.message)
        result.errors += batch.length
      } else {
        result.inserted += data?.length ?? 0
      }
    }

    // Stop si on a tout récupéré
    if (notices.length < PAGE_SIZE || result.fetched >= totalCount) break

    page++
    await sleep(DELAY_MS)
  }

  console.log('[sync-ted] Résultat:', result)
  return result
}
