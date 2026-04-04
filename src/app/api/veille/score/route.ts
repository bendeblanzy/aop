import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { scoreTenders } from '@/lib/boamp/scoring'
import type { Tender } from '@/lib/boamp/types'

/**
 * POST /api/veille/score
 * Score un lot d'annonces avec Claude Haiku et persiste les résultats.
 *
 * Body: { idwebs: string[] }  — max 20 idwebs par appel
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // Lire les idwebs à scorer
  let idwebs: string[]
  try {
    const body = await request.json()
    if (!Array.isArray(body?.idwebs) || body.idwebs.length === 0) {
      return NextResponse.json({ error: 'idwebs array required' }, { status: 400 })
    }
    idwebs = body.idwebs.slice(0, 20).map(String) // max 20
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Récupérer le profil métier
  const { data: profile } = await adminClient
    .from('profiles')
    .select('activite_metier')
    .eq('organization_id', orgId)
    .maybeSingle()

  const activiteMetier = profile?.activite_metier ?? ''

  // Récupérer les tenders depuis la base
  const { data: tenders, error: tErr } = await adminClient
    .from('tenders')
    .select('*')
    .in('idweb', idwebs)

  if (tErr || !tenders || tenders.length === 0) {
    return NextResponse.json({ error: 'Tenders not found' }, { status: 404 })
  }

  // Scorer avec Claude Haiku
  const scores = await scoreTenders(tenders as Tender[], activiteMetier)

  // Persister en base (upsert)
  const upsertData = scores.map(s => ({
    tender_idweb: s.idweb,
    organization_id: orgId,
    score: s.score,
    reason: s.raison,
    scored_at: new Date().toISOString(),
  }))

  const { error: uErr } = await adminClient
    .from('tender_scores')
    .upsert(upsertData, { onConflict: 'tender_idweb,organization_id' })

  if (uErr) {
    console.error('[veille/score] upsert error:', uErr.message)
    // On retourne quand même les scores calculés même si la persistance a échoué
  }

  return NextResponse.json({ scores })
}
