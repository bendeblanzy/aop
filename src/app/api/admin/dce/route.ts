/**
 * GET  /api/admin/dce  — Liste les tenders actifs avec leur statut DCE
 * POST /api/admin/dce  — Action sur un tender (ignore / unignore)
 */
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // Paramètres de filtre
  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? 'pending' // 'pending' | 'uploaded' | 'ignored' | 'all'

  // Profil BOAMP de l'organisation
  const { data: profile } = await adminClient
    .from('profiles')
    .select('boamp_codes')
    .eq('organization_id', orgId)
    .maybeSingle()

  const boampCodes: string[] = Array.isArray(profile?.boamp_codes) ? profile.boamp_codes : []

  // 1. Récupérer les tenders actifs filtrés par codes BOAMP
  let tendersQuery = adminClient
    .from('tenders')
    .select('idweb, objet, nomacheteur, dateparution, datelimitereponse, url_profil_acheteur, url_avis, descripteur_libelles, valeur_estimee, famille, type_procedure')
    .gt('datelimitereponse', new Date().toISOString())
    .order('datelimitereponse', { ascending: true })
    .limit(200)

  if (boampCodes.length > 0) {
    tendersQuery = tendersQuery.overlaps('descripteur_codes', boampCodes)
  }

  const { data: tenders, error: tendersError } = await tendersQuery
  if (tendersError) {
    console.error('[admin/dce] tenders error:', tendersError.message)
    return NextResponse.json({ error: tendersError.message }, { status: 500 })
  }

  // 2. Récupérer tous les tender_dce de cette organisation
  const { data: dceRecords } = await adminClient
    .from('tender_dce')
    .select('*')
    .eq('organization_id', orgId)

  const dceMap: Record<string, {
    id: string
    status: string
    documents: DceDocument[]
    ao_id: string | null
    notes: string | null
    updated_at: string
  }> = {}
  for (const r of dceRecords ?? []) {
    dceMap[r.tender_idweb] = r
  }

  // 3. Récupérer les scores pour cette org
  const idwebs = (tenders ?? []).map(t => t.idweb)
  let scoreMap: Record<string, number> = {}
  if (idwebs.length > 0) {
    const { data: scores } = await adminClient
      .from('tender_scores')
      .select('tender_idweb, score')
      .eq('organization_id', orgId)
      .in('tender_idweb', idwebs)
    for (const s of scores ?? []) {
      scoreMap[s.tender_idweb] = s.score
    }
  }

  // 4. Fusionner
  const merged = (tenders ?? []).map(t => ({
    ...t,
    score: scoreMap[t.idweb] ?? null,
    dce: dceMap[t.idweb] ?? null,
    dce_status: dceMap[t.idweb]?.status ?? 'pending',
  }))

  // 5. Exclure les AOs bâtiment/travaux non pertinents pour la communication
  const EXCLUDED_LIBELLE_KEYWORDS = [
    'travaux', 'bâtiment', 'maçonnerie', 'menuiserie', 'plomberie',
    'ravalement', 'couverture', 'charpente', 'bardage', 'métallerie',
    'chauffage', 'ascenseur', 'cloison', 'gros oeuvre', 'électricité',
    'voirie', 'terrassement', 'génie civil', 'aménagement paysager',
    'nettoyage', 'gardiennage', 'restauration collective', 'traiteur',
  ]

  const relevant = merged.filter(t => {
    const libelles = (t.descripteur_libelles as string[] ?? [])
      .map(l => l.toLowerCase())
    return !libelles.some(l =>
      EXCLUDED_LIBELLE_KEYWORDS.some(kw => l.includes(kw))
    )
  })

  // 6. Filtrer par statut DCE
  const filtered = status === 'all'
    ? relevant
    : relevant.filter(t => t.dce_status === status)

  return NextResponse.json({ tenders: filtered, total: filtered.length })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { action, tender_idweb } = await request.json()
  if (!tender_idweb) return NextResponse.json({ error: 'tender_idweb required' }, { status: 400 })

  if (action === 'ignore') {
    const { error } = await adminClient
      .from('tender_dce')
      .upsert({
        tender_idweb,
        organization_id: orgId,
        status: 'ignored',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tender_idweb,organization_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'unignore') {
    const { error } = await adminClient
      .from('tender_dce')
      .upsert({
        tender_idweb,
        organization_id: orgId,
        status: 'pending',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tender_idweb,organization_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

interface DceDocument {
  filename: string
  url: string
  type: string
  label: string
  taille: number
  uploaded_at: string
}
