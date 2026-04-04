import type { BoampApiResponse, BoampRecord, ParsedEforms, SyncResult } from './types'

const BOAMP_BASE_URL = 'https://www.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records'
const PAGE_SIZE = 100
const DELAY_MS = 600 // Respecter le rate limit BOAMP (~60 req/min)

/** Parse le champ descripteur_code (JSON string) en tableau */
function parseJsonArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
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

    // Description détaillée
    let description: string | undefined
    try {
      const lots = cn['cac:ProcurementProjectLot']
      const lot = Array.isArray(lots) ? lots[0] : lots
      const desc = lot?.['cac:ProcurementProject']?.['cbc:Description']
      description = desc?.['#text'] ?? desc ?? undefined
    } catch {
      // ignore
    }

    // Valeur estimée
    let valeur_estimee: number | undefined
    try {
      const project = cn['cac:ProcurementProject']
      const maxAmt =
        project?.['cbc:RequestedTenderElement']?.['cbc:MaximumAmount']?.['#text'] ??
        project?.['cac:RequestedTenderElement']?.['cbc:MaximumAmount']?.['#text']
      if (maxAmt) valeur_estimee = Math.round(parseFloat(maxAmt))
    } catch {
      // ignore
    }

    // Durée
    let duree_mois: number | undefined
    try {
      const lots = cn['cac:ProcurementProjectLot']
      const lot = Array.isArray(lots) ? lots[0] : lots
      const dur = lot?.['cac:TenderingTerms']?.['cbc:DurationMeasure']?.['#text']
      if (dur) duree_mois = parseInt(dur)
    } catch {
      // ignore
    }

    // Type de marché
    let type_marche: string | undefined
    try {
      const typeCode = cn['cbc:ContractTypeCode']?.['#text'] ?? cn['cbc:ContractTypeCode']
      if (typeCode) type_marche = String(typeCode)
    } catch {
      // ignore
    }

    return { description, valeur_estimee, duree_mois, type_marche }
  } catch {
    return {}
  }
}

/** Attend N millisecondes */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Construit les paramètres de requête BOAMP */
function buildBoampParams(offset: number, dateFrom: string, dateTo: string): URLSearchParams {
  const params = new URLSearchParams()
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(offset))
  params.set(
    'where',
    `dateparution >= "${dateFrom}" AND datelimitereponse >= "${dateTo}"`
  )
  params.set(
    'select',
    'idweb,objet,famille,nature,dateparution,datelimitereponse,nomacheteur,descripteur_code,descripteur_libelle,url_avis,donnees'
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
    dateparution: record.dateparution ?? null,
    datelimitereponse: record.datelimitereponse ?? null,
    descripteur_codes: parseJsonArray(record.descripteur_code),
    descripteur_libelles: parseJsonArray(record.descripteur_libelle),
    type_marche: eforms.type_marche ?? null,
    url_avis: record.url_avis ?? null,
    description_detail: eforms.description ?? null,
    valeur_estimee: eforms.valeur_estimee ?? null,
    duree_mois: eforms.duree_mois ?? null,
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
