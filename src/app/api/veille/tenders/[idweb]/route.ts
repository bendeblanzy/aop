import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'

const BOAMP_BASE_URL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/boamp/records'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>

function str(v: unknown): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v.trim() || undefined
  if (typeof v === 'object' && v !== null && '#text' in v) return String((v as AnyObj)['#text']).trim() || undefined
  return undefined
}

/**
 * Parse extra info from the raw BOAMP donnees JSON.
 * Handles 3 formats: EFORMS, FNSimple, MAPA
 */
function parseBOAMPExtra(donneesStr: string | null): AnyObj {
  if (!donneesStr) return {}
  try {
    const donnees: AnyObj = typeof donneesStr === 'string' ? JSON.parse(donneesStr) : donneesStr

    // Detect format
    if (donnees.EFORMS) return parseEformsExtra(donnees.EFORMS)
    if (donnees.FNSimple) return parseFNSimpleExtra(donnees.FNSimple)
    if (donnees.MAPA) return parseMAPAExtra(donnees.MAPA)

    // Try first key as fallback
    const firstKey = Object.keys(donnees)[0]
    if (firstKey && typeof donnees[firstKey] === 'object') {
      // Could be FNS, JOUE, etc. — try generic parse
      return parseGenericExtra(donnees[firstKey])
    }
    return {}
  } catch { return {} }
}

// ── FNSimple / FNS format ──────────────────────────────────────────

function parseFNSimpleExtra(data: AnyObj): AnyObj {
  const extra: AnyObj = {}
  const initial = data?.initial
  if (!initial) return extra

  // Description détaillée
  try {
    const nm = initial.natureMarche
    if (nm?.description) extra.description_complete = nm.description
    if (nm?.lieuExecution) {
      const lieu = nm.lieuExecution
      extra.lieu_execution = typeof lieu === 'string' ? lieu : [lieu.nomvoie ?? lieu.voie?.nomvoie, lieu.cp, lieu.ville].filter(Boolean).join(' ')
    }
    if (nm?.dureeMois) extra.duree_detail = `${nm.dureeMois} mois`
    if (nm?.codeCPV?.objetPrincipal?.classPrincipale) {
      extra.cpv_principal = nm.codeCPV.objetPrincipal.classPrincipale
    }
  } catch { /* */ }

  // Procédure & critères
  try {
    const proc = initial.procedure
    if (proc) {
      if (proc.criteresAttrib) extra.criteres_attribution_texte = proc.criteresAttrib
      if (proc.capaciteTech) extra.capacite_technique = proc.capaciteTech
      if (proc.capaciteEcoFin) extra.capacite_financiere = proc.capaciteEcoFin
      if (proc.capaciteExercice) extra.capacite_exercice = proc.capaciteExercice

      const conditions: string[] = []
      if (proc.capaciteExercice && proc.capaciteExercice !== 'Renvoi au règlement de la consultation')
        conditions.push(`Capacité d'exercice : ${proc.capaciteExercice}`)
      if (proc.capaciteEcoFin && proc.capaciteEcoFin !== 'Renvoi au règlement de la consultation')
        conditions.push(`Capacité économique et financière : ${proc.capaciteEcoFin}`)
      if (proc.capaciteTech && proc.capaciteTech !== 'Renvoi au règlement de la consultation')
        conditions.push(`Capacité technique : ${proc.capaciteTech}`)
      if (conditions.length > 0) extra.conditions_participation = conditions
    }
  } catch { /* */ }

  // Contact
  try {
    const org = data.organisme
    if (org) {
      const contact: AnyObj = {}
      if (org.nomOfficiel) contact.nom = org.nomOfficiel
      if (org.ville) contact.ville = org.ville
      if (org.cp) contact.cp = org.cp
      const comm = initial.communication
      if (comm) {
        if (comm.nomContact) contact.email = comm.nomContact
        if (comm.telContact) contact.telephone = comm.telContact
        if (comm.urlDocConsul) extra.url_documents = comm.urlDocConsul
      }
      if (Object.keys(contact).length > 0) extra.contact_acheteur = contact
    }
  } catch { /* */ }

  // Info complémentaire
  try {
    const ic = initial.informComplementaire
    if (ic?.autresInformComplementaire) extra.informations_complementaires = ic.autresInformComplementaire
  } catch { /* */ }

  return extra
}

// ── MAPA format ────────────────────────────────────────────────────

function parseMAPAExtra(data: AnyObj): AnyObj {
  const extra: AnyObj = {}
  const initial = data?.initial

  // Description détaillée
  try {
    const desc = initial?.description
    if (desc) {
      if (desc.objet) extra.objet_complet = desc.objet
      const lieu = desc.lieuExecution
      if (lieu) {
        extra.lieu_execution = [lieu.voie?.nomvoie, lieu.cp, lieu.ville].filter(Boolean).join(' ')
      }
    }
    const carac = initial?.caracteristiques
    if (carac?.principales) extra.description_complete = carac.principales
  } catch { /* */ }

  // Durée
  try {
    const duree = initial?.duree
    if (duree?.nbMois) extra.duree_detail = `${duree.nbMois} mois`
    if (duree?.nbJours) extra.duree_detail = `${duree.nbJours} jours`
  } catch { /* */ }

  // Conditions
  try {
    const cond = initial?.conditions
    const conditions: string[] = []
    if (cond?.modFinancement) conditions.push(`Financement : ${cond.modFinancement}`)
    if (cond?.formeJuridique) conditions.push(`Forme juridique : ${cond.formeJuridique}`)
    if (conditions.length > 0) extra.conditions_participation = conditions

    const justif = initial?.justifications
    if (justif?.justificationAutre) extra.justifications = justif.justificationAutre
  } catch { /* */ }

  // Contact
  try {
    const org = data.organisme
    if (org) {
      const contact: AnyObj = {}
      if (org.acheteurPublic) contact.nom = org.acheteurPublic
      if (org.coord?.mel) contact.email = org.coord.mel
      if (org.coord?.tel) contact.telephone = org.coord.tel
      if (org.coord?.url) contact.site_web = org.coord.url
      const adr = org.adr
      if (adr) contact.adresse = [adr.voie?.nomvoie, adr.bp ? `BP ${adr.bp}` : null, adr.cp, adr.ville].filter(Boolean).join(' ')
      if (org.urlProfilAcheteur) extra.url_profil_acheteur_detail = org.urlProfilAcheteur
      if (org.correspondantPRM) {
        const c = org.correspondantPRM
        contact.correspondant = [c.pren, c.nom, c.fonc ? `(${c.fonc})` : null].filter(Boolean).join(' ')
      }
      if (Object.keys(contact).length > 0) extra.contact_acheteur = contact
    }
  } catch { /* */ }

  // Critères
  try {
    const crit = initial?.critAttrib
    if (crit) {
      if (typeof crit === 'string') {
        extra.criteres_attribution_texte = crit
      } else if (crit.critere) {
        const critList = Array.isArray(crit.critere) ? crit.critere : [crit.critere]
        const criteres: { nom: string; poids?: string }[] = []
        for (const c of critList) {
          if (typeof c === 'string') criteres.push({ nom: c })
          else if (c.libelle) criteres.push({ nom: c.libelle, poids: c.ponderation })
        }
        if (criteres.length > 0) extra.criteres_attribution = criteres
      }
    }
  } catch { /* */ }

  // Lots MAPA
  try {
    const lots = initial?.lots ?? initial?.tranche
    if (lots) {
      const lotList = Array.isArray(lots) ? lots : [lots]
      const lotsDetails: { titre: string; description?: string }[] = []
      for (const lot of lotList) {
        const titre = lot.intitule ?? lot.objet ?? 'Lot'
        const desc = lot.description ?? lot.principales
        lotsDetails.push({ titre, description: desc })
      }
      if (lotsDetails.length > 0) extra.lots_details = lotsDetails
    }
  } catch { /* */ }

  return extra
}

// ── EFORMS format ──────────────────────────────────────────────────

function parseEformsExtra(eforms: AnyObj): AnyObj {
  const cn = eforms.ContractNotice ?? eforms.ContractAwardNotice ?? eforms.PriorInformationNotice
  if (!cn) return {}
  const extra: AnyObj = {}

  // Description complète
  try {
    const lots = cn['cac:ProcurementProjectLot']
    const lot = Array.isArray(lots) ? lots[0] : lots
    const desc = str(lot?.['cac:ProcurementProject']?.['cbc:Description'])
    if (desc) extra.description_complete = desc
  } catch { /* */ }

  // Conditions de participation
  try {
    const lots = cn['cac:ProcurementProjectLot']
    const lot = Array.isArray(lots) ? lots[0] : lots
    const terms = lot?.['cac:TenderingTerms']
    const qualCriteria = terms?.['cac:TendererQualificationRequest']
    const qualList = Array.isArray(qualCriteria) ? qualCriteria : qualCriteria ? [qualCriteria] : []
    const conditions: string[] = []
    for (const q of qualList) {
      const desc = str(q?.['cbc:CompanyLegalForm'])
      if (desc) conditions.push(desc)
      for (const key of ['cac:TechnicalEvaluationCriteria', 'cac:FinancialEvaluationCriteria']) {
        const criteria = q?.[key]
        const list = Array.isArray(criteria) ? criteria : criteria ? [criteria] : []
        for (const c of list) { const d = str(c?.['cbc:Description']); if (d) conditions.push(d) }
      }
    }
    if (conditions.length > 0) extra.conditions_participation = conditions
  } catch { /* */ }

  // Critères d'attribution
  try {
    const lots = cn['cac:ProcurementProjectLot']
    const lot = Array.isArray(lots) ? lots[0] : lots
    const award = lot?.['cac:TenderingTerms']?.['cac:AwardingTerms']?.['cac:AwardingCriterion']
    const critList = Array.isArray(award) ? award : award ? [award] : []
    const criteres: { nom: string; poids?: string }[] = []
    for (const c of critList) {
      const subs = c?.['cac:SubordinateAwardingCriterion']
      const subList = Array.isArray(subs) ? subs : subs ? [subs] : []
      for (const sc of subList) {
        const name = str(sc?.['cbc:Name']) ?? str(sc?.['cbc:Description'])
        const weight = str(sc?.['cbc:WeightNumeric']) ?? str(sc?.['cbc:Weight'])
        if (name) criteres.push({ nom: name, poids: weight ?? undefined })
      }
    }
    if (criteres.length > 0) extra.criteres_attribution = criteres
  } catch { /* */ }

  // Lots détaillés
  try {
    const lots = cn['cac:ProcurementProjectLot']
    const lotList = Array.isArray(lots) ? lots : lots ? [lots] : []
    if (lotList.length > 1) {
      const lotsDetails: { titre: string; description?: string; cpv?: string }[] = []
      for (const lot of lotList) {
        const proj = lot?.['cac:ProcurementProject']
        lotsDetails.push({
          titre: str(proj?.['cbc:Name']) ?? 'Sans titre',
          description: str(proj?.['cbc:Description']),
          cpv: str(proj?.['cac:MainCommodityClassification']?.['cbc:ItemClassificationCode']),
        })
      }
      extra.lots_details = lotsDetails
    }
  } catch { /* */ }

  // Lieu d'exécution
  try {
    const loc = cn['cac:ProcurementProject']?.['cac:RealizedLocation']
    const locList = Array.isArray(loc) ? loc : loc ? [loc] : []
    const lieux: string[] = []
    for (const l of locList) {
      const parts = [str(l?.['cbc:Description']), str(l?.['cac:Address']?.['cbc:CityName'])].filter(Boolean)
      if (parts.length > 0) lieux.push(parts.join(', '))
    }
    if (lieux.length > 0) extra.lieu_execution = lieux.join(' ; ')
  } catch { /* */ }

  // Contact
  try {
    const party = cn['cac:ContractingParty']?.['cac:Party']
    const contact: AnyObj = {}
    const c = party?.['cac:Contact']
    if (str(c?.['cbc:Name'])) contact.nom = str(c['cbc:Name'])
    if (str(c?.['cbc:Telephone'])) contact.telephone = str(c['cbc:Telephone'])
    if (str(c?.['cbc:ElectronicMail'])) contact.email = str(c['cbc:ElectronicMail'])
    const addr = party?.['cac:PostalAddress']
    if (addr) contact.adresse = [str(addr['cbc:StreetName']), str(addr['cbc:PostalZone']), str(addr['cbc:CityName'])].filter(Boolean).join(' ')
    if (Object.keys(contact).length > 0) extra.contact_acheteur = contact
  } catch { /* */ }

  return extra
}

// ── Generic fallback (FNS, JOUE, etc.) ─────────────────────────────

function parseGenericExtra(data: AnyObj): AnyObj {
  // Try same logic as FNSimple — structure is often similar
  return parseFNSimpleExtra(data)
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
        extraEforms = parseBOAMPExtra(record.donnees)
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
