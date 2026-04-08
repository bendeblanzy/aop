import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'

const BOAMP_BASE_URL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/boamp/records'

/**
 * Parse extra info from the raw BOAMP donnees eForms JSON.
 * Returns fields not stored in our DB: conditions, contact, lieu, etc.
 */
function parseExtraEforms(donneesStr: string | null): Record<string, unknown> {
  if (!donneesStr) return {}
  try {
    const donnees = typeof donneesStr === 'string' ? JSON.parse(donneesStr) : donneesStr
    const eforms = donnees?.EFORMS
    if (!eforms) return {}

    const cn = eforms.ContractNotice ?? eforms.ContractAwardNotice ?? eforms.PriorInformationNotice
    if (!cn) return {}

    const extra: Record<string, unknown> = {}
    const txt = (v: unknown): string | undefined => {
      if (!v) return undefined
      if (typeof v === 'string') return v || undefined
      if (typeof v === 'object' && v !== null && '#text' in v) return String((v as Record<string, unknown>)['#text']) || undefined
      return undefined
    }

    // ── Conditions de participation ───────────────────────────
    try {
      const lots = cn['cac:ProcurementProjectLot']
      const lot = Array.isArray(lots) ? lots[0] : lots
      const terms = lot?.['cac:TenderingTerms']

      // Conditions économiques et financières
      const qualCriteria = terms?.['cac:TendererQualificationRequest']
      const qualList = Array.isArray(qualCriteria) ? qualCriteria : qualCriteria ? [qualCriteria] : []
      const conditions: string[] = []
      for (const q of qualList) {
        const desc = txt(q?.['cbc:CompanyLegalForm'])
        if (desc) conditions.push(desc)
        const techAbility = q?.['cac:TechnicalEvaluationCriteria']
        const techList = Array.isArray(techAbility) ? techAbility : techAbility ? [techAbility] : []
        for (const t of techList) {
          const d = txt(t?.['cbc:Description'])
          if (d) conditions.push(d)
        }
        const finAbility = q?.['cac:FinancialEvaluationCriteria']
        const finList = Array.isArray(finAbility) ? finAbility : finAbility ? [finAbility] : []
        for (const f of finList) {
          const d = txt(f?.['cbc:Description'])
          if (d) conditions.push(d)
        }
      }
      if (conditions.length > 0) extra.conditions_participation = conditions
    } catch { /* ignore */ }

    // ── Critères d'attribution ────────────────────────────────
    try {
      const lots = cn['cac:ProcurementProjectLot']
      const lot = Array.isArray(lots) ? lots[0] : lots
      const terms = lot?.['cac:TenderingTerms']
      const award = terms?.['cac:AwardingTerms']
      const awardCriteria = award?.['cac:AwardingCriterion']
      const critList = Array.isArray(awardCriteria) ? awardCriteria : awardCriteria ? [awardCriteria] : []
      const criteres: { nom: string; poids?: string }[] = []
      for (const c of critList) {
        const subCriteria = c?.['cac:SubordinateAwardingCriterion']
        const subList = Array.isArray(subCriteria) ? subCriteria : subCriteria ? [subCriteria] : []
        for (const sc of subList) {
          const name = txt(sc?.['cbc:Name']) ?? txt(sc?.['cbc:Description'])
          const weight = txt(sc?.['cbc:WeightNumeric']) ?? txt(sc?.['cbc:Weight'])
          if (name) criteres.push({ nom: name, poids: weight ?? undefined })
        }
      }
      if (criteres.length > 0) extra.criteres_attribution = criteres
    } catch { /* ignore */ }

    // ── Description de chaque lot ─────────────────────────────
    try {
      const lots = cn['cac:ProcurementProjectLot']
      const lotList = Array.isArray(lots) ? lots : lots ? [lots] : []
      if (lotList.length > 1) {
        const lotsDetails: { titre: string; description?: string; cpv?: string }[] = []
        for (const lot of lotList) {
          const proj = lot?.['cac:ProcurementProject']
          const titre = txt(proj?.['cbc:Name']) ?? 'Sans titre'
          const desc = txt(proj?.['cbc:Description'])
          const cpv = txt(proj?.['cac:MainCommodityClassification']?.['cbc:ItemClassificationCode'])
          lotsDetails.push({ titre, description: desc, cpv: cpv })
        }
        extra.lots_details = lotsDetails
      }
    } catch { /* ignore */ }

    // ── Lieu d'exécution textuel ──────────────────────────────
    try {
      const project = cn['cac:ProcurementProject']
      const loc = project?.['cac:RealizedLocation']
      const locList = Array.isArray(loc) ? loc : loc ? [loc] : []
      const lieux: string[] = []
      for (const l of locList) {
        const desc = txt(l?.['cbc:Description'])
        const city = txt(l?.['cac:Address']?.['cbc:CityName'])
        const country = txt(l?.['cac:Address']?.['cac:Country']?.['cbc:Name'])
        const parts = [desc, city, country].filter(Boolean)
        if (parts.length > 0) lieux.push(parts.join(', '))
      }
      if (lieux.length > 0) extra.lieu_execution = lieux.join(' ; ')
    } catch { /* ignore */ }

    // ── Organisme acheteur (contact) ─────────────────────────
    try {
      const party = cn['cac:ContractingParty']?.['cac:Party']
      const contact = party?.['cac:Contact']
      const contactInfo: Record<string, string> = {}
      const name = txt(contact?.['cbc:Name'])
      const phone = txt(contact?.['cbc:Telephone'])
      const email = txt(contact?.['cbc:ElectronicMail'])
      if (name) contactInfo.nom = name
      if (phone) contactInfo.telephone = phone
      if (email) contactInfo.email = email

      const address = party?.['cac:PostalAddress']
      const street = txt(address?.['cbc:StreetName'])
      const city = txt(address?.['cbc:CityName'])
      const zip = txt(address?.['cbc:PostalZone'])
      if (street || city || zip) {
        contactInfo.adresse = [street, zip, city].filter(Boolean).join(' ')
      }

      if (Object.keys(contactInfo).length > 0) extra.contact_acheteur = contactInfo
    } catch { /* ignore */ }

    // ── Modalités de remise des offres ────────────────────────
    try {
      const lots = cn['cac:ProcurementProjectLot']
      const lot = Array.isArray(lots) ? lots[0] : lots
      const terms = lot?.['cac:TenderingTerms']
      const notes: string[] = []
      const note = txt(terms?.['cbc:Note'])
      if (note) notes.push(note)
      const procNote = txt(terms?.['cac:TenderingProcess']?.['cbc:Description'])
      if (procNote) notes.push(procNote)
      if (notes.length > 0) extra.modalites_remise = notes.join('\n')
    } catch { /* ignore */ }

    return extra
  } catch {
    return {}
  }
}

/**
 * GET /api/veille/tenders/[idweb]
 * Retourne le détail d'un tender BOAMP par idweb,
 * enrichi du score pour l'organisation courante + données eForms supplémentaires.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ idweb: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { idweb } = await params

  // Récupérer le tender de notre DB
  const { data: tender, error } = await adminClient
    .from('tenders')
    .select('*')
    .eq('idweb', idweb)
    .maybeSingle()

  if (error || !tender) {
    return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
  }

  // Récupérer le score pour cette org
  const { data: scoreData } = await adminClient
    .from('tender_scores')
    .select('score, reason')
    .eq('tender_idweb', idweb)
    .eq('organization_id', orgId)
    .maybeSingle()

  // Récupérer le profil pour le matching
  const { data: profile } = await adminClient
    .from('profiles')
    .select('activite_metier, raison_sociale, domaines_competences')
    .eq('organization_id', orgId)
    .maybeSingle()

  // Fetch live BOAMP data for extra eForms info (non-blocking)
  let extraEforms: Record<string, unknown> = {}
  try {
    const boampParams = new URLSearchParams({
      where: `idweb="${idweb}"`,
      select: 'donnees',
      limit: '1',
    })
    const boampRes = await fetch(`${BOAMP_BASE_URL}?${boampParams}`, {
      headers: { 'User-Agent': 'AOP-App/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (boampRes.ok) {
      const boampData = await boampRes.json()
      const record = boampData?.results?.[0]
      if (record?.donnees) {
        extraEforms = parseExtraEforms(record.donnees)
      }
    }
  } catch {
    // Non-blocking: si l'API BOAMP est lente ou down, on continue sans
  }

  return NextResponse.json({
    tender: {
      ...tender,
      score: scoreData?.score ?? null,
      reason: scoreData?.reason ?? null,
    },
    profile: profile ? {
      activite_metier: profile.activite_metier,
      raison_sociale: profile.raison_sociale,
      domaines_competences: profile.domaines_competences,
    } : null,
    extra: extraEforms,
  })
}
