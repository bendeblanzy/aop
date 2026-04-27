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

const TED_FIELDS = [
  'publication-number',
  'publication-date',
  'notice-type',
  'notice-title',
  'description-lot',
  'buyer-name',
  'buyer-country',
  'place-of-performance-country',
  'place-of-performance-nuts',
  'procedure-type',
  'contract-nature',
  'deadline-date-lot',
  'deadline-receipt-tender',
  'estimated-value-glo',
  'estimated-value-cur-glo',
  'duration-period',
  'duration-month-glo',
  'classification-cpv',
  'main-classification-cpv',
  'url-document',
  'links',
] as const

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

/** Extrait une string "FR" ou "fra"/"eng" d'un champ multi-langues TED */
function extractText(v: unknown, preferredLang: 'fra' | 'eng' = 'fra'): string | null {
  if (!v) return null
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.length > 0 ? extractText(v[0], preferredLang) : null
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    const langs: ('fra' | 'eng')[] = preferredLang === 'fra' ? ['fra', 'eng'] : ['eng', 'fra']
    for (const lang of langs) {
      const val = obj[lang]
      if (typeof val === 'string') return val
      if (Array.isArray(val) && val[0]) return String(val[0])
    }
    // Fallback : première valeur string trouvée
    for (const val of Object.values(obj)) {
      if (typeof val === 'string') return val
    }
  }
  return null
}

function extractStringArray(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string') return [v]
  return []
}

/** Construit une date ISO YYYY-MM-DD à N jours en arrière */
function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  return d.toISOString().split('T')[0]
}

/** Construit la query TED-EQL */
function buildQuery(daysBack: number): string {
  const fromDate = daysAgoIso(daysBack)
  // place-of-performance-country = "FRA" filtre par lieu d'exécution
  // notice-type IN (cn-standard cn-social) = avis de marché classique + social
  return [
    `publication-date >= ${fromDate}`,
    `notice-type IN (cn-standard cn-social cn-desg)`,
    `place-of-performance-country = "FRA"`,
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

  // Valeur estimée
  let valeurEstimee: number | null = null
  const value = notice['estimated-value-glo']
  if (typeof value === 'number') valeurEstimee = Math.round(value)
  else if (value && typeof value === 'object' && typeof (value as { amount?: number }).amount === 'number') {
    valeurEstimee = Math.round((value as { amount: number }).amount)
  }

  // Durée
  let dureeMois: number | null = null
  const duration = notice['duration-period']
  if (typeof duration === 'number') dureeMois = duration
  else if (duration && typeof duration === 'object') {
    const d = duration as { months?: number; years?: number; days?: number }
    if (typeof d.months === 'number') dureeMois = d.months
    else if (typeof d.years === 'number') dureeMois = d.years * 12
    else if (typeof d.days === 'number') dureeMois = Math.round(d.days / 30)
  }
  if (dureeMois === null && typeof notice['duration-month-glo'] === 'number') {
    dureeMois = notice['duration-month-glo'] as number
  }

  // CPV
  const cpvCodes = extractStringArray(notice['classification-cpv'])
  const mainCpv = extractText(notice['main-classification-cpv'])
  if (mainCpv && !cpvCodes.includes(mainCpv)) cpvCodes.unshift(mainCpv)

  // Lieu (NUTS)
  const nutsCodes = extractStringArray(notice['place-of-performance-nuts'])

  // Type marché : on mappe contract-nature TED vers les valeurs BOAMP
  const nature = extractText(notice['contract-nature'])
  const typeMarcheMap: Record<string, string> = {
    'works': 'TRAVAUX',
    'services': 'SERVICES',
    'supplies': 'FOURNITURES',
  }
  const typeMarche = nature ? (typeMarcheMap[nature.toLowerCase()] ?? nature.toUpperCase()) : null

  // URL profil acheteur — on prend url-document si présent
  const urlProfilAcheteur = typeof notice['url-document'] === 'string'
    ? notice['url-document']
    : null

  // URL avis = lien HTML TED (si fourni) sinon construit depuis le numéro
  const links = notice['links'] as { html?: string } | undefined
  const urlAvis = links?.html ?? `https://ted.europa.eu/en/notice/${pubNumber}`

  // Dates
  const dateparution = (notice['publication-date'] as string | undefined)?.split('T')[0] ?? null
  const datelimite = (notice['deadline-date-lot'] ?? notice['deadline-receipt-tender']) as string | undefined ?? null

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
