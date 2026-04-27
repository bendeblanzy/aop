import type { BoampApiResponse, BoampRecord, ParsedEforms, SyncResult } from './types'

const BOAMP_BASE_URL = 'https://www.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records'
const PAGE_SIZE = 100
const DELAY_MS = 600 // Respecter le rate limit BOAMP (~60 req/min)

/** Normalise un champ qui peut être un tableau ou une JSON string en tableau */
function parseJsonArray(value: string | string[] | null): string[] {
  if (!value) return []
  // L'API BOAMP v2.1 retourne directement des tableaux
  if (Array.isArray(value)) return value.map(String)
  // Fallback : essai de parsing JSON string (ancien format)
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/**
 * Vérifie si une URL pointe vers une page spécifique (consultation)
 * et non vers une simple page d'accueil générique.
 */
function isSpecificUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '') // retirer les trailing slashes
    const hasPath = path.length > 0 && path !== '/index.html' && path !== '/index.htm'
      && path !== '/index.jsp' && path !== '/index.cfm' && path !== '/index.php'
      && path !== '/accueil.htm' && path !== '/accueil.html'
    const hasQueryParams = u.search.length > 1 // "?" seul ne compte pas
    return hasPath || hasQueryParams
  } catch {
    return false
  }
}

/** Helper : extrait la valeur textuelle d'un champ eForms (peut être string ou { '#text': ... }) */
function txt(v: unknown): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v || undefined
  if (typeof v === 'object' && v !== null && '#text' in v) return String((v as Record<string, unknown>)['#text']) || undefined
  return undefined
}

/** Extrait les infos utiles du champ `donnees` (eForms JSON) */
function parseEforms(donneesStr: string | null): ParsedEforms {
  if (!donneesStr) return {}
  try {
    const donnees = typeof donneesStr === 'string' ? JSON.parse(donneesStr) : donneesStr
    const eforms = donnees?.EFORMS
    if (!eforms) return {}

    const cn = eforms.ContractNotice ?? eforms.ContractAwardNotice ?? eforms.PriorInformationNotice
    if (!cn) return {}

    const result: ParsedEforms = {}

    // ── Description détaillée ──────────────────────────────────────────────────
    try {
      const lots = cn['cac:ProcurementProjectLot']
      const lot = Array.isArray(lots) ? lots[0] : lots
      result.description = txt(lot?.['cac:ProcurementProject']?.['cbc:Description'])
    } catch { /* ignore */ }

    // ── Budget (MaximumAmount puis EstimatedOverallContractAmount) ─────────────
    try {
      const project = cn['cac:ProcurementProject']
      const rtt = project?.['cac:RequestedTenderTotal']
      const maxAmt = txt(rtt?.['cbc:MaximumAmount'])
      const estAmt = txt(rtt?.['cbc:EstimatedOverallContractAmount'])
      const raw = maxAmt ?? estAmt
      if (raw) result.valeur_estimee = Math.round(parseFloat(raw))
      // Budget estimé séparé (EstimatedOverallContractAmount)
      if (estAmt) result.budget_estime = Math.round(parseFloat(estAmt))
    } catch { /* ignore */ }

    // ── Durée (premier lot) ────────────────────────────────────────────────────
    try {
      const lots = cn['cac:ProcurementProjectLot']
      const lot = Array.isArray(lots) ? lots[0] : lots
      const dur = txt(lot?.['cac:TenderingTerms']?.['cbc:DurationMeasure'])
      if (dur) result.duree_mois = parseInt(dur)
    } catch { /* ignore */ }

    // ── Type de marché ─────────────────────────────────────────────────────────
    try {
      const typeCode = txt(cn['cbc:ContractTypeCode'])
      if (typeCode) result.type_marche = typeCode
    } catch { /* ignore */ }

    // ── CPV codes ─────────────────────────────────────────────────────────────
    try {
      const project = cn['cac:ProcurementProject']
      const cpvSet = new Set<string>()
      const main = project?.['cac:MainCommodityClassification']
      const mainList = Array.isArray(main) ? main : main ? [main] : []
      for (const c of mainList) { const v = txt(c['cbc:ItemClassificationCode']); if (v) cpvSet.add(v) }
      const add = project?.['cac:AdditionalCommodityClassification']
      const addList = Array.isArray(add) ? add : add ? [add] : []
      for (const c of addList) { const v = txt(c['cbc:ItemClassificationCode']); if (v) cpvSet.add(v) }
      if (cpvSet.size > 0) result.cpv_codes = [...cpvSet]
    } catch { /* ignore */ }

    // ── Lieu d'exécution (code NUTS) ──────────────────────────────────────────
    try {
      const project = cn['cac:ProcurementProject']
      const loc = project?.['cac:RealizedLocation']
      const locList = Array.isArray(loc) ? loc : loc ? [loc] : []
      const nuts = new Set<string>()
      for (const l of locList) {
        const v = txt(l?.['cac:Address']?.['cbc:CountrySubentityCode'])
        if (v) nuts.add(v)
      }
      if (nuts.size > 0) result.code_nuts = [...nuts].join(',')
    } catch { /* ignore */ }

    // ── Lots (nombre + titres) ─────────────────────────────────────────────────
    try {
      const lots = cn['cac:ProcurementProjectLot']
      const lotList = Array.isArray(lots) ? lots : lots ? [lots] : []
      result.nb_lots = lotList.length
      const titres: string[] = []
      for (const lot of lotList) {
        const t = txt(lot?.['cac:ProcurementProject']?.['cbc:Name'])
        if (t) titres.push(t)
      }
      if (titres.length > 0) result.lots_titres = titres
    } catch { /* ignore */ }

    // ── URL profil acheteur ────────────────────────────────────────────────────
    try {
      const lots = cn['cac:ProcurementProjectLot']
      const lot = Array.isArray(lots) ? lots[0] : lots
      const terms = lot?.['cac:TenderingTerms']
      const docRef = terms?.['cac:CallForTendersDocumentReference']
      const ref = Array.isArray(docRef) ? docRef[0] : docRef
      const uri = txt(ref?.['cac:Attachment']?.['cac:ExternalReference']?.['cbc:URI'])
      if (uri) {
        const clean = uri.replace(/&amp;/g, '&')
        if (clean.startsWith('http') && isSpecificUrl(clean)) result.url_profil_acheteur = clean
      }

      if (!result.url_profil_acheteur) {
        const bpStr = txt(cn['cac:ContractingParty']?.['cbc:BuyerProfileURI'])
        if (bpStr?.startsWith('http') && isSpecificUrl(bpStr)) result.url_profil_acheteur = bpStr
      }

      if (!result.url_profil_acheteur) {
        const orgs = cn['ext:UBLExtensions']?.['ext:UBLExtension']?.['ext:ExtensionContent']
          ?.['efext:EformsExtension']?.['efac:Organizations']?.['efac:Organization']
        const orgList = Array.isArray(orgs) ? orgs : orgs ? [orgs] : []
        for (const org of orgList) {
          const epStr = txt(org?.['efac:Company']?.['cbc:EndpointID'])
          if (epStr?.startsWith('http') && !epStr.includes('tribunal') && isSpecificUrl(epStr)) {
            result.url_profil_acheteur = epStr.replace(/&amp;/g, '&')
            break
          }
        }
      }
    } catch { /* ignore */ }

    return result
  } catch {
    return {}
  }
}

/** Attend N millisecondes */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Construit les paramètres de requête BOAMP.
 *
 * Filtres :
 * - dateparution >= dateFrom : sur la fenêtre de N derniers jours
 * - datelimitereponse >= dateTo : on jette les annonces déjà expirées
 * - type_marche = SERVICES OR type_marche IS NULL : alignement avec
 *   le positionnement services de L'ADN. On garde aussi les NULL car
 *   l'API ne classifie pas systématiquement (~1.6% de NULL sur les
 *   nouvelles annonces, et les NULL contiennent souvent de vrais
 *   services). Si besoin clients BTP/distrib plus tard, retirer cette
 *   clause ou paramétrer via env BOAMP_NATURES_FILTER.
 */
function buildBoampParams(offset: number, dateFrom: string, dateTo: string): URLSearchParams {
  const params = new URLSearchParams()
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(offset))
  params.set(
    'where',
    `dateparution >= "${dateFrom}" AND datelimitereponse >= "${dateTo}" AND (type_marche = "SERVICES" OR type_marche IS NULL)`,
  )
  params.set(
    'select',
    'idweb,objet,famille,nature,nature_libelle,dateparution,datelimitereponse,datefindiffusion,nomacheteur,descripteur_code,descripteur_libelle,url_avis,code_departement,type_procedure,procedure_libelle,type_marche,donnees'
  )
  params.set('order_by', 'dateparution DESC')
  return params
}

/** Récupère une page de l'API BOAMP */
async function fetchBoampPage(offset: number, dateFrom: string, dateTo: string): Promise<BoampApiResponse> {
  const params = buildBoampParams(offset, dateFrom, dateTo)
  const url = `${BOAMP_BASE_URL}?${params.toString()}`

  const response = await fetch(url, {
    headers: { 'User-Agent': 'AOP-App/1.0' },
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(`BOAMP API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<BoampApiResponse>
}

/** Transforme un BoampRecord en objet prêt pour Supabase upsert */
export function transformRecord(record: BoampRecord) {
  const eforms = parseEforms(record.donnees)
  return {
    idweb: record.idweb,
    objet: record.objet ?? null,
    nomacheteur: record.nomacheteur ?? null,
    famille: record.famille ?? null,
    nature: record.nature ?? null,
    nature_libelle: record.nature_libelle ?? null,
    dateparution: record.dateparution ?? null,
    datelimitereponse: record.datelimitereponse ?? null,
    datefindiffusion: record.datefindiffusion ?? null,
    descripteur_codes: parseJsonArray(record.descripteur_code),
    descripteur_libelles: parseJsonArray(record.descripteur_libelle),
    // type_marche : préférer la valeur directe BOAMP (tableau → premier élément)
    type_marche: (Array.isArray(record.type_marche) ? record.type_marche[0] : record.type_marche) ?? eforms.type_marche ?? null,
    url_avis: record.url_avis ?? null,
    code_departement: parseJsonArray(record.code_departement),
    type_procedure: record.type_procedure ?? null,
    procedure_libelle: record.procedure_libelle ?? null,
    // Champs eForms
    url_profil_acheteur: eforms.url_profil_acheteur ?? null,
    description_detail: eforms.description ?? null,
    valeur_estimee: eforms.valeur_estimee ?? null,
    budget_estime: eforms.budget_estime ?? null,
    duree_mois: eforms.duree_mois ?? null,
    cpv_codes: eforms.cpv_codes ?? [],
    code_nuts: eforms.code_nuts ?? null,
    nb_lots: eforms.nb_lots ?? null,
    lots_titres: eforms.lots_titres ?? [],
    updated_at: new Date().toISOString(),
  }
}

/**
 * Sync principal : récupère les annonces BOAMP et les upsert en base
 * @param supabaseAdmin - client Supabase service_role (any pour éviter les conflits de types générés)
 * @param daysBack - nombre de jours à remonter (défaut: 7, premier sync: 30)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncBoampTenders(supabaseAdmin: any, daysBack = 7): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 }

  const now = new Date()
  const dateFrom = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]
  const dateTo = now.toISOString().split('T')[0]

  // Première page pour connaître le total
  let firstPage: BoampApiResponse
  try {
    firstPage = await fetchBoampPage(0, dateFrom, dateTo)
  } catch (e) {
    console.error('[sync-boamp] Erreur fetchBoampPage page 0:', e)
    result.errors++
    return result
  }

  const totalCount = firstPage.total_count
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  console.log(`[sync-boamp] Total BOAMP: ${totalCount} annonces, ${totalPages} pages`)

  // Traitement page 0
  const allRecords: BoampRecord[] = [...firstPage.results]

  // Pages suivantes (avec délai pour respecter le rate limit)
  for (let page = 1; page < totalPages; page++) {
    await sleep(DELAY_MS)
    try {
      const pageData = await fetchBoampPage(page * PAGE_SIZE, dateFrom, dateTo)
      allRecords.push(...pageData.results)
    } catch (e) {
      console.error(`[sync-boamp] Erreur page ${page}:`, e)
      result.errors++
      // On continue avec les autres pages
    }
  }

  result.fetched = allRecords.length

  // Upsert en base par lots de 50
  const BATCH_SIZE = 50
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE).map(transformRecord)

    const { error, data } = await supabaseAdmin
      .from('tenders')
      .upsert(batch, { onConflict: 'idweb', ignoreDuplicates: false })
      .select('idweb')

    if (error) {
      console.error(`[sync-boamp] Upsert error batch ${i}:`, error.message)
      result.errors += batch.length
    } else {
      result.inserted += (data?.length ?? 0)
    }
  }

  result.skipped = result.fetched - result.inserted - result.errors
  console.log(`[sync-boamp] Résultat:`, result)
  return result
}
