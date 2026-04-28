import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { getEmbedding, buildProfileText, simToScore } from '@/lib/ai/embeddings'
import {
  getCommunicationEmbedding,
  getNonCommunicationEmbedding,
  blendEmbeddings,
} from '@/lib/boamp/communication-domain'
import { getDepartementsForRegion, normalizeZoneToRegion } from '@/lib/boamp/regions'
import { buildProfileKeywords } from '@/lib/boamp/lot-matching'

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
    .select('boamp_codes, activite_metier, types_marche_filtres, embedding, raison_sociale, domaines_competence, certifications, positionnement, atouts_differenciants, moyens_techniques, profile_methodology, prestations_types, prestations_detail, exclusions_globales, clients_types, zone_intervention, region')
    .eq('organization_id', orgId)
    .maybeSingle()

  // Construire les mots-clés profil pour le matching des lots (inclus dans la réponse)
  const profileKeywords = buildProfileKeywords({
    activite_metier: profile?.activite_metier,
    domaines_competence: profile?.domaines_competence,
    positionnement: profile?.positionnement,
    atouts_differenciants: profile?.atouts_differenciants,
  })

  const boampCodes: string[] = Array.isArray(profile?.boamp_codes) ? profile.boamp_codes : []

  // Toujours restreindre aux SERVICES — règle métier L'ADN STUDIO
  // Si l'utilisateur a configuré d'autres types, on les respecte ; sinon défaut = SERVICES
  const configuredTypes: string[] = Array.isArray((profile as any)?.types_marche_filtres)
    ? (profile as any).types_marche_filtres
    : []
  const typesMarche = configuredTypes.length > 0 ? configuredTypes : ['SERVICES']

  // Paramètres de requête
  const url = new URL(request.url)
  const page    = Math.max(0, parseInt(url.searchParams.get('page') ?? '0'))
  const limit   = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '30')))
  const search  = url.searchParams.get('search')       ?? ''
  const semanticQuery = url.searchParams.get('semantic_query') ?? ''
  const minScore      = url.searchParams.get('min_score') ? parseInt(url.searchParams.get('min_score')!) : null
  const activeOnly    = url.searchParams.get('active_only') !== 'false'
  const favoritesOnly = url.searchParams.get('favorites_only') === 'true'
  // Filtre procédure : 'ouvert' | 'restreint' | '' (tous)
  const procedureFilter = url.searchParams.get('procedure') ?? ''
  // Filtre région : si fourni, on restreint aux départements de cette région
  const regionParam = url.searchParams.get('region') ?? ''
  // Si pas de param explicite : on utilise profile.region, sinon on tente de
  // dériver une région depuis profile.zone_intervention ("idf", "paca"…).
  // Cela évite que zone="idf" passe inaperçu quand region est NULL.
  const profileRegionFallback = profile?.region
    || normalizeZoneToRegion(profile?.zone_intervention)
    || ''
  const regionToApply = regionParam || profileRegionFallback
  const regionDepts = regionToApply ? getDepartementsForRegion(regionToApply) : null

  const hasActiviteMetier = !!profile?.activite_metier?.trim()

  // Filtre source explicite (UI toggle : '' | 'boamp' | 'ted' | 'atexo')
  const sourceFilter = url.searchParams.get('source') ?? ''
  const validSources = ['boamp', 'ted', 'atexo']
  const appliedSourceFilter = validSources.includes(sourceFilter) ? sourceFilter : ''

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
  // Le blend "domaine communication" est désormais très LÉGER : il ne biaise
  // plus le matching que marginalement, pour conserver un signal "services
  // créatifs" sans écraser les profils non-com (formation, conseil, IT, etc.).
  //
  //  Mode Recherche IA (semantic_query renseigné) :
  //    query_embedding = 92% requête utilisateur + 8% domaine communication
  //
  //  Mode Profil (défaut) :
  //    query_embedding = 90% profil entreprise + 10% domaine communication
  //
  // (Audit 2026-04-27 : un blend à 30% sabotait le matching pour les profils
  //  formation/IA en tirant la requête vers événementiel/brochures.)

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
    return fallbackCodeBased(orgId, profile, boampCodes, typesMarche, { page, limit, search, minScore, activeOnly, regionDepts, procedureFilter }, hasActiviteMetier, profileKeywords)
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
    // Mode Recherche IA : embed la requête utilisateur, blend très léger avec comm
    try {
      const queryEmb = await getEmbedding(semanticQuery.trim())
      queryEmbedding = commEmbedding.length > 0
        ? blendEmbeddings(queryEmb, commEmbedding, 0.92) // 92% requête + 8% comm
        : queryEmb
    } catch (e) {
      console.error('[veille/tenders] semantic query embedding error:', e)
      return NextResponse.json({ error: 'Erreur calcul embedding requête' }, { status: 500 })
    }
  } else {
    // Mode Profil : blend très léger profil + comm (90/10)
    queryEmbedding = commEmbedding.length > 0 && profileEmbedding!.length > 0
      ? blendEmbeddings(profileEmbedding!, commEmbedding, 0.90) // 90% profil + 10% comm
      : profileEmbedding!
  }

  // ── Matching vectoriel pgvector — pool diversifié par source ─────────────
  //
  // PROBLÈME HISTORIQUE : un seul appel RPC avec pool=300 sur ~4147 tenders
  // embeddés (3765 BOAMP + 284 TED + 98 Atexo) → les AO non-BOAMP étaient
  // statistiquement évincés du top 300 (ratio 39:1 en faveur de BOAMP).
  //
  // SOLUTION (2026-04-28) : 3 appels parallèles dédiés par source, avec un
  // quota par source. Les résultats sont mergés par idweb (meilleure sim gardée).
  // Si l'utilisateur choisit un filtre source explicite (ex. "Atexo"), on fait
  // un appel ciblé sur cette source avec un pool plus large.
  //
  // Quota default : BOAMP=200 + TED=60 + Atexo=40 = 300 au total.
  // Quota source unique : 150 pour la source sélectionnée.
  const SIMILARITY_THRESHOLD = 0.15

  let matchedIdwebs: string[]
  let similarityMap: Record<string, number>

  if (appliedSourceFilter) {
    // Mode source unique : pool ciblé sur cette source seulement
    const MATCH_POOL_SINGLE = 150
    const { data: matchedRaw, error: matchError } = await adminClient
      .rpc('match_tenders_by_embedding', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: MATCH_POOL_SINGLE,
        filter_codes: null,
        filter_source: appliedSourceFilter,
      })

    if (matchError) {
      console.error('[veille/tenders] vector match error (single source):', matchError.message)
      return fallbackCodeBased(orgId, profile, boampCodes, typesMarche, { page, limit, search, minScore, activeOnly, regionDepts, procedureFilter }, hasActiviteMetier, profileKeywords)
    }

    matchedIdwebs = (matchedRaw ?? []).map((m: any) => m.idweb)
    similarityMap = Object.fromEntries((matchedRaw ?? []).map((m: any) => [m.idweb, m.similarity]))
  } else {
    // Mode diversifié : 3 appels parallèles → quota garanti par source
    // BOAMP=200, TED=60, Atexo=40 — résultats mergés par idweb (meilleure sim)
    const [boampResult, tedResult, atexoResult] = await Promise.all([
      adminClient.rpc('match_tenders_by_embedding', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: 200,
        filter_codes: null,
        filter_source: 'boamp',
      }),
      adminClient.rpc('match_tenders_by_embedding', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: 60,
        filter_codes: null,
        filter_source: 'ted',
      }),
      adminClient.rpc('match_tenders_by_embedding', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: 40,
        filter_codes: null,
        filter_source: 'atexo',
      }),
    ])

    if (boampResult.error && tedResult.error && atexoResult.error) {
      // Toutes les 3 sources en erreur → fallback
      console.error('[veille/tenders] all 3 source pools failed, falling back')
      return fallbackCodeBased(orgId, profile, boampCodes, typesMarche, { page, limit, search, minScore, activeOnly, regionDepts, procedureFilter }, hasActiviteMetier, profileKeywords)
    }

    if (boampResult.error) console.error('[veille/tenders] BOAMP pool error:', boampResult.error.message)
    if (tedResult.error) console.error('[veille/tenders] TED pool error:', tedResult.error.message)
    if (atexoResult.error) console.error('[veille/tenders] Atexo pool error:', atexoResult.error.message)

    // Merge + dedup par idweb (similarité la plus haute gagnante en cas de doublon)
    const allRaw = [
      ...(boampResult.data ?? []),
      ...(tedResult.data ?? []),
      ...(atexoResult.data ?? []),
    ] as Array<{ idweb: string; objet: string; similarity: number }>

    allRaw.sort((a, b) => b.similarity - a.similarity)
    const seen = new Set<string>()
    const dedupedRaw = allRaw.filter(m => {
      if (seen.has(m.idweb)) return false
      seen.add(m.idweb)
      return true
    })

    matchedIdwebs = dedupedRaw.map(m => m.idweb)
    similarityMap = Object.fromEntries(dedupedRaw.map(m => [m.idweb, m.similarity]))
  }

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

  // Filtre région — overlaps sur code_departement
  if (regionDepts && regionDepts.length > 0) {
    query = query.overlaps('code_departement', regionDepts)
  }

  // Filtre procédure ouvert/restreint
  if (procedureFilter === 'ouvert') {
    query = query.or('procedure_libelle.ilike.%ouvert%,procedure_libelle.ilike.%MAPA%,procedure_libelle.ilike.%adapt%,type_procedure.ilike.%ouvert%,type_procedure.ilike.%MAPA%,type_procedure.ilike.%adapt%')
  } else if (procedureFilter === 'restreint') {
    query = query.or('procedure_libelle.ilike.%restreint%,procedure_libelle.ilike.%négoci%,procedure_libelle.ilike.%negoci%,type_procedure.ilike.%restreint%,type_procedure.ilike.%négoci%,type_procedure.ilike.%negoci%')
  }

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
  // Principe : score = simToScore(sim) × pénalité_anti_domaine × boost_codes.
  //  - pénalité anti-domaine : descend jusqu'à ~0.35 sur les fournitures/travaux/infogérance
  //  - boost codes BOAMP : +15% si descripteur_codes && profile.boamp_codes (signal positif
  //    plutôt qu'un filtre couperet — voir doc ci-dessus pour la raison)
  const CODE_BOOST = 1.15  // +15% si overlap des codes BOAMP
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

    // Boost codes BOAMP : +15% si l'AO a au moins un code descripteur en commun
    // avec ceux sélectionnés dans le profil. Booster au lieu de filtrer permet
    // de remonter quand même les top sémantiques même quand les codes sont
    // partiellement faux côté référentiel.
    const tenderCodes: string[] = Array.isArray((t as any).descripteur_codes)
      ? (t as any).descripteur_codes
      : []
    const codesOverlap = boampCodes.length > 0
      && tenderCodes.some((c: string) => boampCodes.includes(c))
    const boost = codesOverlap ? CODE_BOOST : 1.0

    const vectorScore = Math.min(100, Math.round(baseScore * penalty * boost))
    const existingScore = scoreMap[t.idweb]
    return {
      ...t,
      score: existingScore?.score ?? vectorScore,
      reason: existingScore?.reason ?? null,
      scored_by_claude: !!existingScore,  // true = score Claude persisté, false = score vectoriel brut
      similarity: Math.round(sim * 1000) / 1000,
      antiSimilarity: Math.round(antiSim * 1000) / 1000,
      codesOverlap,
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
    profileKeywords,
    sourceFilter: appliedSourceFilter || null,
  })
}

// ── Fallback : filtrage par codes BOAMP (si pas d'embedding) ─────────────────
async function fallbackCodeBased(
  orgId: string,
  profile: any,
  boampCodes: string[],
  typesMarche: string[],
  opts: { page: number; limit: number; search: string; minScore: number | null; activeOnly: boolean; regionDepts?: string[] | null; procedureFilter?: string },
  hasActiviteMetier: boolean,
  profileKeywords: string[] = [],
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

  // Filtre région
  if (opts.regionDepts && opts.regionDepts.length > 0) {
    query = query.overlaps('code_departement', opts.regionDepts)
  }

  // Filtre procédure
  if (opts.procedureFilter === 'ouvert') {
    query = query.or('procedure_libelle.ilike.%ouvert%,procedure_libelle.ilike.%MAPA%,procedure_libelle.ilike.%adapt%,type_procedure.ilike.%ouvert%,type_procedure.ilike.%MAPA%,type_procedure.ilike.%adapt%')
  } else if (opts.procedureFilter === 'restreint') {
    query = query.or('procedure_libelle.ilike.%restreint%,procedure_libelle.ilike.%négoci%,procedure_libelle.ilike.%negoci%,type_procedure.ilike.%restreint%,type_procedure.ilike.%négoci%,type_procedure.ilike.%negoci%')
  }

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
    profileKeywords,
  })
}
