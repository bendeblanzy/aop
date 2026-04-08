import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { getEmbedding, buildProfileText } from '@/lib/ai/embeddings'

/**
 * GET /api/veille/tenders
 *
 * MATCHING VECTORIEL : Retourne les annonces BOAMP triées par pertinence
 * sémantique (similarité cosinus entre l'embedding du profil et celui du tender).
 *
 * Les codes BOAMP et le type de marché sont des filtres secondaires optionnels.
 * Le tri principal est la similarité vectorielle.
 *
 * Query params:
 *   - page: number (défaut: 0)
 *   - limit: number (défaut: 30, max: 50)
 *   - search: string (filtre textuel sur objet/nomacheteur)
 *   - min_score: number (seuil de similarité minimum, défaut: 30)
 *   - active_only: boolean (défaut: true — exclut les dates limites passées)
 *   - favorites_only: boolean
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // Récupérer le profil complet pour embedding + filtres
  const { data: profile } = await adminClient
    .from('profiles')
    .select('boamp_codes, activite_metier, types_marche_filtres, embedding, raison_sociale, domaines_competence, certifications, positionnement, atouts_differenciants, moyens_techniques')
    .eq('organization_id', orgId)
    .maybeSingle()

  const boampCodes: string[] = Array.isArray(profile?.boamp_codes) ? profile.boamp_codes : []
  const typesMarche: string[] = Array.isArray((profile as any)?.types_marche_filtres) ? (profile as any).types_marche_filtres : []

  // Paramètres de requête
  const url = new URL(request.url)
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0'))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '30')))
  const search = url.searchParams.get('search') ?? ''
  const minScore = url.searchParams.get('min_score') ? parseInt(url.searchParams.get('min_score')!) : null
  const activeOnly = url.searchParams.get('active_only') !== 'false'
  const favoritesOnly = url.searchParams.get('favorites_only') === 'true'

  const hasActiviteMetier = !!profile?.activite_metier?.trim()

  // ── Favoris : chemin dédié ──
  if (favoritesOnly) {
    const { data: favData } = await adminClient
      .from('tender_favorites')
      .select('tender_idweb')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
    const favIdwebs = (favData ?? []).map(f => f.tender_idweb)
    if (favIdwebs.length === 0) {
      return NextResponse.json({ tenders: [], total: 0, filteredTotal: 0, page: 0, limit, hasBoampCodes: boampCodes.length > 0, hasActiviteMetier })
    }

    const { data: tenders } = await adminClient
      .from('tenders')
      .select('*')
      .in('idweb', favIdwebs)
      .order('dateparution', { ascending: false })

    // Ajouter les scores existants
    const { data: scores } = await adminClient
      .from('tender_scores')
      .select('tender_idweb, score, reason')
      .eq('organization_id', orgId)
      .in('tender_idweb', favIdwebs)
    const scoreMap = Object.fromEntries((scores ?? []).map(s => [s.tender_idweb, { score: s.score, reason: s.reason }]))

    const enriched = (tenders ?? []).map(t => ({ ...t, score: scoreMap[t.idweb]?.score ?? null, reason: scoreMap[t.idweb]?.reason ?? null }))
    return NextResponse.json({ tenders: enriched, total: enriched.length, filteredTotal: enriched.length, page: 0, limit, hasBoampCodes: boampCodes.length > 0, hasActiviteMetier })
  }

  // ── Matching vectoriel : chemin principal ──

  // 1. Obtenir ou calculer l'embedding du profil
  let profileEmbedding: number[] | null = null

  if (profile?.embedding) {
    profileEmbedding = typeof profile.embedding === 'string' ? JSON.parse(profile.embedding) : profile.embedding
  } else if (hasActiviteMetier) {
    // Calculer et persister l'embedding du profil
    try {
      const profileText = buildProfileText(profile as any)
      profileEmbedding = await getEmbedding(profileText)
      if (profileEmbedding.length > 0) {
        await adminClient.from('profiles').update({
          embedding: JSON.stringify(profileEmbedding),
          embedding_updated_at: new Date().toISOString(),
        }).eq('organization_id', orgId)
      }
    } catch (e) {
      console.error('[veille/tenders] profile embedding error:', e)
    }
  }

  // 2. Si pas d'embedding profil → fallback codes BOAMP classique
  if (!profileEmbedding || profileEmbedding.length === 0) {
    return fallbackCodeBased(orgId, profile, boampCodes, typesMarche, { page, limit, search, minScore, activeOnly })
  }

  // 3. Appel à la fonction SQL match_tenders_by_embedding
  //    Récupère les 300 tenders les plus pertinents sémantiquement
  const MATCH_POOL = 300
  const SIMILARITY_THRESHOLD = 0.15 // seuil bas pour avoir un pool large, on trie ensuite

  const { data: matchedRaw, error: matchError } = await adminClient
    .rpc('match_tenders_by_embedding', {
      query_embedding: JSON.stringify(profileEmbedding),
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: MATCH_POOL,
      filter_codes: boampCodes.length > 0 ? boampCodes : null,
    })

  if (matchError) {
    console.error('[veille/tenders] vector match error:', matchError.message)
    return fallbackCodeBased(orgId, profile, boampCodes, typesMarche, { page, limit, search, minScore, activeOnly })
  }

  const matchedIdwebs = (matchedRaw ?? []).map((m: any) => m.idweb)
  const similarityMap = Object.fromEntries((matchedRaw ?? []).map((m: any) => [m.idweb, m.similarity]))

  if (matchedIdwebs.length === 0) {
    return NextResponse.json({ tenders: [], total: 0, filteredTotal: 0, page, limit, hasBoampCodes: boampCodes.length > 0, hasActiviteMetier })
  }

  // 4. Récupérer les tenders complets pour les IDs matchés
  let query = adminClient
    .from('tenders')
    .select('*')
    .in('idweb', matchedIdwebs)

  // Filtre date limite
  if (activeOnly) {
    query = query.gte('datelimitereponse', new Date().toISOString())
  }

  // Filtre type de marché (si configuré)
  if (typesMarche.length > 0) {
    query = query.or(`type_marche.in.(${typesMarche.join(',')}),type_marche.is.null`)
  }

  // Filtre recherche texte
  if (search.trim()) {
    query = query.or(`objet.ilike.%${search}%,nomacheteur.ilike.%${search}%`)
  }

  const { data: tenders, error: tErr } = await query
  if (tErr) {
    console.error('[veille/tenders] DB error:', tErr.message)
    return NextResponse.json({ error: tErr.message }, { status: 500 })
  }

  // 5. Exclure les tenders déjà en cours de réponse
  const { data: existingAOs } = await adminClient
    .from('appels_offres')
    .select('tender_idweb')
    .eq('organization_id', orgId)
    .not('tender_idweb', 'is', null)
  const aoTenderIds = new Set((existingAOs ?? []).map(ao => ao.tender_idweb).filter(Boolean))
  const filteredTenders = (tenders ?? []).filter(t => !aoTenderIds.has(t.idweb))

  // 6. Récupérer les scores existants
  const idwebs = filteredTenders.map(t => t.idweb)
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

  // 7. Convertir similarité en score 0-100 et enrichir
  function simToScore(sim: number): number {
    const normalized = (sim - 0.15) / (0.55 - 0.15)
    return Math.max(0, Math.min(100, Math.round(normalized * 100)))
  }

  const tendersWithScores = filteredTenders.map(t => {
    const sim = similarityMap[t.idweb] ?? 0
    const vectorScore = simToScore(sim)
    // Si on a un score Claude existant, on l'utilise ; sinon on utilise le vectoriel
    const existingScore = scoreMap[t.idweb]
    return {
      ...t,
      score: existingScore?.score ?? vectorScore,
      reason: existingScore?.reason ?? (vectorScore >= 70 ? 'Forte correspondance sémantique.' : vectorScore >= 40 ? 'Correspondance partielle.' : 'Faible correspondance.'),
      similarity: Math.round(sim * 1000) / 1000,
    }
  })

  // 8. Trier par score décroissant (pertinence)
  tendersWithScores.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  // 9. Filtre min_score
  const afterMinScore = minScore !== null
    ? tendersWithScores.filter(t => t.score !== null && t.score >= minScore)
    : tendersWithScores

  // 10. Pagination
  const totalFiltered = afterMinScore.length
  const paginated = afterMinScore.slice(page * limit, (page + 1) * limit)

  return NextResponse.json({
    tenders: paginated,
    total: totalFiltered,
    filteredTotal: paginated.length,
    page,
    limit,
    hasBoampCodes: boampCodes.length > 0,
    hasActiviteMetier,
  })
}

// ── Fallback : filtrage par codes BOAMP (si pas d'embedding) ──
async function fallbackCodeBased(
  orgId: string,
  profile: any,
  boampCodes: string[],
  typesMarche: string[],
  opts: { page: number; limit: number; search: string; minScore: number | null; activeOnly: boolean }
) {
  let query = adminClient
    .from('tenders')
    .select('*', { count: 'exact' })
    .order('dateparution', { ascending: false })
    .range(opts.page * opts.limit, (opts.page + 1) * opts.limit - 1)

  if (opts.activeOnly) {
    query = query.gte('datelimitereponse', new Date().toISOString())
  }
  if (boampCodes.length > 0) {
    query = query.overlaps('descripteur_codes', boampCodes)
  }
  if (typesMarche.length > 0) {
    query = query.or(`type_marche.in.(${typesMarche.join(',')}),type_marche.is.null`)
  }
  if (opts.search.trim()) {
    query = query.or(`objet.ilike.%${opts.search}%,nomacheteur.ilike.%${opts.search}%`)
  }

  const { data: tenders, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Scores existants
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

  const enriched = (tenders ?? []).map(t => ({
    ...t,
    score: scoreMap[t.idweb]?.score ?? null,
    reason: scoreMap[t.idweb]?.reason ?? null,
  }))

  const filtered = opts.minScore !== null
    ? enriched.filter(t => t.score !== null && t.score >= opts.minScore!)
    : enriched

  return NextResponse.json({
    tenders: filtered,
    total: count ?? 0,
    filteredTotal: filtered.length,
    page: opts.page,
    limit: opts.limit,
    hasBoampCodes: boampCodes.length > 0,
    hasActiviteMetier: !!profile?.activite_metier?.trim(),
  })
}
