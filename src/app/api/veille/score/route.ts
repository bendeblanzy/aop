import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { scoreWithVectors } from '@/lib/boamp/scoring-vector'

/**
 * POST /api/veille/score
 * Scoring hybride : Tier 1 vectoriel (instantané) + Tier 2 Claude (raisons).
 *
 * Body: { idwebs: string[] }  — max 50 idwebs par appel (augmenté car le vectoriel est rapide)
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
    idwebs = body.idwebs.slice(0, 50).map(String) // max 50 (vectoriel = rapide)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Scoring hybride vectoriel + Claude
  const scores = await scoreWithVectors(orgId, idwebs)

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
  }

  return NextResponse.json({ scores })
}
