import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { getEmbedding, buildProfileText, simToScore } from '@/lib/ai/embeddings'
import {
  getCommunicationEmbedding,
  getNonCommunicationEmbedding,
  blendEmbeddings,
} from '@/lib/boamp/communication-domain'

/**
 * GET /api/veille/tenders
 *
 * MATCHING VECTORIEL : Retourne les annonces BOAMP triées par pertinence
 * sémantique, restreintes aux prestations de SERVICES en communication.
 *
 * Deux modes de recherche :
 *  - Profil (défaut) : embedding profil × 60% + domaine communication × 40%
 *  - Recherche IA (semantic_query) : embedding requête × 70% + domaine communication × 30%
 *
 * Le type de marché est toujours restreint aux SERVICES (ou non renseigné).
 *
 * Query params:
 *   - page: number (défaut: 0)
 *   - limit: number (défaut: 30, max: 50)
 *   - search: string (filtre textuel ILIKE sur objet/nomacheteur, mode mots-clés)
 *   - semantic_query: string (requête sémantique libre, mode Recherche IA)
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

  // Toujours restreindre aux SERVICES — règle métier L'ADN STUDIO
  // Si l'utilisateur a configuré d'autres types, on les respecte ; sinon défaut = SERVICES
  const configuredTypes: string[] = Array.isArray((profile as any)?.types_marche_filtres)
    ? (profile as any).types_marche_filtres
    : []
  const typesMarche = configuredTypes.length > 0 ? configuredTypes : ['SERVICES']

  // Paramètres de requête
  const url = new URL(request.url)
  const page    = Math.max(0, parseInt(url.searchParams.get('page')  ?? '0'))
  const limit   = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '30')))
  const search  = url.searchParams.get('search')       ?? ''
  const semanticQuery = url.searchParams.get('semantic_query') ?? ''
  const minScore      = url.searchParams.get('min_score') ? parseInt(url.searchParams.get('min_score')!) : null
  const activeOnly    = url.searchParams.get('active_only') !== 'false'
  const favoritesOnly = url.searchParams.get('favorites_only') === 'true'

  const hasActiviteMetier = !!profile?.activite_metier?.trim()

  // ── Favoris : chemin dédié ────────────────────────────────────────────────
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

    let favQuery = adminClient
      .from('tenders')
      .select('*')
      .in('idweb', favIdwebs)
      .order('dateparution', { ascending: false })

    // Filtre SERVICES même sur les favoris
    favQuery = favQuery.or(`type_marche.in.(${typesMarche.join(',')}),type_marche.is.null`)

    const { data: tenders } = await favQuery

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

  // ── Construction de l'embedding de requête ────────────────────────────────
  //
  // On utilise toujours un blend avec l'embedding "domaine communication" pour
  // biaiser les résultats vers les prestations de communication/numérique/événementiel.
  //
  //  Mode Recherche IA (semantic_query renseigné) :
  //    query_embedding = 70% requête utilisateur + 30% domaine communication
  //
  //  Mode Profil (défaut) :
  //    query_embedding = 60% profil entreprise + 40% domaine communication

  let profileEmbedding: number[] | null = null

  if (profile?.embedding) {
    profileEmbedding = typeof profile.embedding === 'string' ? JSON.parse(profile.embedding) : profile.embedding
  } else if (hasActiviteMetier) {
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

  // Vérifier si on est en mode Recherche IA avec une vraie requête
  const isSemanticSearch = semanticQuery.trim().length > 0

  // Si ni embedding profil ni requête sémantique → fallback codes BOAMP
  if (!profileEmbedding && !isSemanticSearch) {
    return fallbackCodeBased(orgId, profile, boampCodes, typesMarche, { page, limit, search, minScore, activeOnly }, hasActiviteMetier)
  }

  // Obtenir l'embedding du domaine communication (mis en cache entre les requêtes)
  let commEmbedding: number[] = []
  try {
    commEmbedding = await getCommunicationEmbedding()
  } catch (e) {
    console.error('[veille/tenders] communication embedding error:', e)
  }

  // Construire l'embedding de requête final (blend)
  let queryEmbedding: number[]

  if (isSemanticSearch) {
    // Mode Recherche IA : embed la requête utilisateur, blend avec domaine comm
    try {
      const queryEmb = await getEmbedding(semanticQuery.trim())
      queryEmbedding = commEmbedding.length > 0
        ? blendEmbeddings(queryEmb, commEmbedding, 0.80) // 80% requête + 20% comm (requête plus dominante)
        : queryEmb
    } catch (e) {
      console.error('[veille/tenders] semantic query embedding error:', e)
      return NextResponse.json({ error: 'Erreur calcul embedding requête' }, { status: 500 })
    }
  } else {
    // Mode Profil : blend profil + domaine communication
    queryEmbedding = commEmbedding.length > 0 && profileEmbedding!.length > 0
      ? blendEmbeddings(profileEmbedding!, commEmbedding, 0.70) // 70% profil + 30% comm (profil plus dominant)
      : profileEmbedding!
  }

  // ── Matching vectoriel pgvector ───────────────────────────────────────────
  // On garde un pool LARGE (volume attrayant pour l'utilisateur) mais le scoring
  // aval est sévère : beaucoup d'AO remontent, peu scorent haut.
  const MATCH_POOL = 300
  const SIMILARITY_THRESHOLD = 0.15

  const { data: matchedRaw, error: matchError } = await adminClient
    .rpc('match_tenders_by_embedding', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: MATCH_POOL,
      filter_codes: boampCodes.length > 0 ? boampCodes : null,
    })

  if (matchError) {
    console.error('[veille/tenders] vector match error:', matchError.message)
    return fallbackCodeBased(orgId, profile, boampCodes, typesMarche, { page, limit, search, minScore, activeOnly }, hasActiviteMetier)
  }

  const matchedIdwebs = (matchedRaw ?? []).map((m: any) => m.idweb)
  const similarityMap = Object.fromEntries((matchedRaw ?? []).map((m: any) => [m.idweb, m.similarity]))

  // ── Pénalité anti-domaine ────────────────────────────────────────────────
  // Pour chaque tender matché, on calcule sa similarité avec l'anti-domaine
  // (fournitures, travaux, infogérance pure…). Si elle est élevée, on applique
  // une pénalité au score final pour écarter les faux positifs "communication".
  const antiSimilarityMap: Record<string, number> = {}
  if (matchedIdwebs.length > 0) {
    try {
      const antiEmbedding = await getNonCommunicationEmbedding()
      if (antiEmbedding.length > 0) {
        const { data: antiRows } = await adminClient
          .rpc('similarity_for_idwebs', {
            query_embedding: JSON.stringify(antiEmbedding),
            target_idwebs: matchedIdwebs,
          })
        for (const row of antiRows ?? []) {
          antiSimilarityMap[row.idweb] = row.similarity
        }
      }
    } catch (e) {
      console.error('[veille/tenders] anti-domain similarity error:', e)
    }
  }

  if (matchedIdwebs.length === 0) {
    return NextResponse.json({ tenders: [], total: 0, filteredTotal: 0, page, limit, hasBoampCodes: boampCodes.length > 0, hasActiviteMetier, searchMode: isSemanticSearch ? 'semantic' : 'profile' })
  }

  // ── Récupérer les tenders complets ────────────────────────────────────────
  let query = adminClient
    .from('tenders')
    .select('*')
    .in('idweb', matchedIdwebs)

  // Filtre date limite
  if (activeOnly) {
    query = query.gte('datelimitereponse', new Date().toISOString())
  }

  // Filtre type de marché — TOUJOURS restreindre aux SERVICES (+ null)
  query = query.or(`type_marche.in.(${typesMarche.join(',')}),type_marche.is.null`)

  // Filtre recherche texte (mode mots-clés uniquement)
  if (search.trim() && !isSemanticSearch) {
    query = query.or(`objet.ilike.%${search}%,nomacheteur.ilike.%${search}%,description_detail.ilike.%${search}%`)
  }

  const { data: tenders, error: tErr } = await query
  if (tErr) {
    console.error('[veille/tenders] DB error:', tErr.message)
    return NextResponse.json({ error: tErr.message }, { status: 500 })
  }

  // ── Exclure les tenders déjà en cours de réponse ─────────────────────────
  const { data: existingAOs } = await adminClient
    .from('appels_offres')
    .select('tender_idweb')
    .eq('organization_id', orgId)
    .not('tender_idweb', 'is', null)
  const aoTenderIds = new Set((existingAOs ?? []).map(ao => ao.tender_idweb).filter(Boolean))
  const filteredTenders = (tenders ?? []).filter(t => !aoTenderIds.has(t.idweb))

  // ── Scores existants ──────────────────────────────────────────────────────
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

  // ── Conversion similarité → score 0-100 et enrichissement ────────────────
  // Principe : score = simToScore(sim) × pénalité_anti_domaine.
  // Pénalité = 1.0 si le tender est loin de l'anti-domaine, descend jusqu'à ~0.35
  // si le tender ressemble fortement à des fournitures/travaux/infogérance.
  const tendersWithScores = filteredTenders.map(t => {
    const sim = similarityMap[t.idweb] ?? 0
    const antiSim = antiSimilarityMap[t.idweb] ?? 0
    const baseScore = simToScore(sim)

    // Pénalité anti-domaine : on la déclenche si antiSim > 0.30
    // et si antiSim > sim (le tender ressemble plus à l'anti-domaine qu'au profil).
    // Pénalité linéaire douce : de 1.0 (pas de pénalité) à 0.35 (grosse pénalité).
    let penalty = 1.0
    if (antiSim > 0.30) {
      const delta = antiSim - sim
      if (delta > 0) {
        // delta typiquement dans [0, 0.25]. Pénalité = 1 - 2.6 × delta (clamp 0.35-1.0)
        penalty = Math.max(0.35, 1.0 - 2.6 * delta)
      } else if (antiSim > 0.45) {
        // Très fortement anti-domaine, même si sim est plus haute : pénalité légère
        penalty = 0.85
      }
    }

    const vectorScore = Math.round(baseScore * penalty)
    const existingScore = scoreMap[t.idweb]
    return {
      ...t,
      score: existingScore?.score ?? vectorScore,
      reason: existingScore?.reason ?? (
        vectorScore >= 75 ? 'Forte correspondance sémantique avec votre profil.' :
        vectorScore >= 50 ? 'Correspondance intéressante, à évaluer.' :
        vectorScore >= 25 ? 'Correspondance partielle, probablement hors cœur de métier.' :
        'Faible correspondance.'
      ),
      similarity: Math.round(sim * 1000) / 1000,
      antiSimilarity: Math.round(antiSim * 1000) / 1000,
    }
  })

  // Tri par score décroissant
  tendersWithScores.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  // Filtre min_score
  const afterMinScore = minScore !== null
    ? tendersWithScores.filter(t => t.score !== null && t.score >= minScore)
    : tendersWithScores

  // Pagination
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
    searchMode: isSemanticSearch ? 'semantic' : 'profile',
  })
}

// ── Fallback : filtrage par codes BOAMP (si pas d'embedding) ─────────────────
async function fallbackCodeBased(
  orgId: string,
  profile: any,
  boampCodes: string[],
  typesMarche: string[],
  opts: { page: number; limit: number; search: string; minScore: number | null; activeOnly: boolean },
  hasActiviteMetier: boolean,
) {
  let query = adminClient
    .from('tenders')
    .select('*', { count: 'exact' })
    .order('dateparution', { ascending: false })
    .range(opts.page * opts.limit, (opts.page + 1) * opts.limit - 1)

  if (opts.activeOnly) {
    query = query.gte('datelimitereponse', new Date().toISOString())
  }

  // Filtre SERVICES — toujours appliqué (avec les types configurés ou SERVICES par défaut)
  query = query.or(`type_marche.in.(${typesMarche.join(',')}),type_marche.is.null`)

  if (boampCodes.length > 0) {
    query = query.overlaps('descripteur_codes', boampCodes)
  }
  if (opts.search.trim()) {
    query = query.or(`objet.ilike.%${opts.search}%,nomacheteur.ilike.%${opts.search}%,description_detail.ilike.%${opts.search}%`)
  }

  const { data: tenders, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
    hasActiviteMetier,
    searchMode: 'fallback',
  })
}
