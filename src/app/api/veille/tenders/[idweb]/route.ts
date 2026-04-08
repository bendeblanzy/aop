import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'

/**
 * GET /api/veille/tenders/[idweb]
 * Retourne le détail d'un tender BOAMP par idweb,
 * enrichi du score pour l'organisation courante.
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

  // Récupérer le tender
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
  })
}
