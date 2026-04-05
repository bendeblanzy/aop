import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'

/**
 * GET /api/veille/tenders
 * Retourne les annonces BOAMP filtrées par les codes BOAMP de l'organisation,
 * enrichies des scores déjà calculés pour cette organisation.
 *
 * Query params:
 *   - page: number (défaut: 0)
 *   - limit: number (défaut: 30, max: 50)
 *   - search: string (filtre sur objet/nomacheteur)
 *   - min_score: number (filtre sur score minimum)
 *   - active_only: boolean (défaut: true — exclut les dates limites passées)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // Récupérer le profil pour les codes BOAMP
  const { data: profile } = await adminClient
    .from('profiles')
    .select('boamp_codes, activite_metier')
    .eq('organization_id', orgId)
    .maybeSingle()

  const boampCodes: string[] = Array.isArray(profile?.boamp_codes) ? profile.boamp_codes : []

  // Paramètres de requête
  const url = new URL(request.url)
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0'))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '30')))
  const search = url.searchParams.get('search') ?? ''
  const minScore = url.searchParams.get('min_score') ? parseInt(url.searchParams.get('min_score')!) : null
  const activeOnly = url.searchParams.get('active_only') !== 'false'

  // Construire la requête tenders
  let query = adminClient
    .from('tenders')
    .select('*', { count: 'exact' })
    .order('dateparution', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  // Filtre date limite
  if (activeOnly) {
    query = query.gte('datelimitereponse', new Date().toISOString())
  }

  // Filtre codes BOAMP (si l'org a des codes configurés)
  if (boampCodes.length > 0) {
    query = query.overlaps('descripteur_codes', boampCodes)
  }

  // Filtre recherche texte
  if (search.trim()) {
    query = query.or(`objet.ilike.%${search}%,nomacheteur.ilike.%${search}%`)
  }

  const { data: tenders, count, error } = await query

  if (error) {
    console.error('[veille/tenders] DB error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Récupérer les scores existants pour cette organisation
  const idwebs = (tenders ?? []).map(t => t.idweb)
  let scoreMap: Record<string, { score: number; reason: string }> = {}

  if (idwebs.length > 0) {
    const { data: scores } = await adminClient
      .from('tender_scores')
      .select('tender_idweb, score, reason')
      .eq('organization_id', orgId)
      .in('tender_idweb', idwebs)

    if (scores) {
      for (const s of scores) {
        scoreMap[s.tender_idweb] = { score: s.score, reason: s.reason }
      }
    }
  }

  // Fusionner tenders + scores
  const tendersWithScores = (tenders ?? []).map(t => ({
    ...t,
    score: scoreMap[t.idweb]?.score ?? null,
    reason: scoreMap[t.idweb]?.reason ?? null,
  }))

  // Appliquer le filtre min_score côté app (après fusion)
  const filtered = minScore !== null
    ? tendersWithScores.filter(t => t.score !== null && t.score >= minScore)
    : tendersWithScores

  return NextResponse.json({
    tenders: filtered,
    total: count ?? 0,
    filteredTotal: filtered.length,
    page,
    limit,
    hasBoampCodes: boampCodes.length > 0,
    hasActiviteMetier: !!profile?.activite_metier?.trim(),
  })
}
