import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'

/**
 * GET /api/profil/calibration-set
 *
 * Retourne 5 AO échantillonnés à présenter à l'utilisateur pour calibrer son
 * profil. Sélection : on tire un AO dans chaque "bucket" de pertinence
 * (très haut, haut, moyen, bas, très bas) selon la similarité avec
 * l'embedding du profil. L'utilisateur les note ✓ / ? / ✗ via
 * POST /api/profil/calibrate.
 *
 * Idempotent — on exclut systématiquement les AO déjà notés.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // 1. Embedding du profil
  const { data: profile } = await adminClient
    .from('profiles')
    .select('embedding')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!profile?.embedding) {
    return NextResponse.json({
      tenders: [],
      message: 'Profil sans embedding — complète d\'abord ton onboarding.',
    })
  }

  const profileEmbedding = typeof profile.embedding === 'string'
    ? profile.embedding
    : JSON.stringify(profile.embedding)

  // 2. Récupérer les AO déjà notés pour cette org (à exclure)
  const { data: alreadyRated } = await adminClient
    .from('tender_calibration_feedback')
    .select('tender_idweb')
    .eq('organization_id', orgId)
  const excludeIdwebs = (alreadyRated ?? []).map(r => r.tender_idweb)

  // 3. Pour chaque "bucket" de pertinence, tirer 1 AO
  // On utilise un large pool puis on prend des positions échantillonnées
  // (top 1 / 25 / 50 / 100 / 200 par exemple).
  const POOL = 250
  const { data: pool, error } = await adminClient.rpc('match_tenders_by_embedding', {
    query_embedding: profileEmbedding,
    match_threshold: 0.05,
    match_count: POOL,
    filter_codes: null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const filteredPool = (pool ?? []).filter((t: any) => !excludeIdwebs.includes(t.idweb))
  if (filteredPool.length === 0) {
    return NextResponse.json({ tenders: [], message: 'Aucun AO disponible pour calibration.' })
  }

  // Échantillonnage stratifié : top1, position 25, 50, 100, fin du pool
  const targetIndices = [0, 24, 49, 99, Math.max(0, filteredPool.length - 1)]
    .filter((i, idx, arr) => arr.indexOf(i) === idx) // dédoublonne si pool court
    .filter(i => i < filteredPool.length)
  const sampled = targetIndices.map(i => filteredPool[i])
  const sampledIdwebs = sampled.map((s: any) => s.idweb)

  // 4. Charger les détails complets des AO sélectionnés
  const { data: tenders } = await adminClient
    .from('tenders')
    .select('idweb, objet, nomacheteur, description_detail, short_summary, valeur_estimee, descripteur_libelles, descripteur_codes, datelimitereponse, code_departement')
    .in('idweb', sampledIdwebs)

  // Préserver l'ordre du sampling (du plus pertinent au moins pertinent)
  const orderedTenders = sampledIdwebs
    .map(id => (tenders ?? []).find(t => t.idweb === id))
    .filter(Boolean)
    .map((t: any, i: number) => ({
      ...t,
      similarity_rank: i + 1, // 1 = meilleur match, 5 = plus loin
    }))

  return NextResponse.json({ tenders: orderedTenders })
}
