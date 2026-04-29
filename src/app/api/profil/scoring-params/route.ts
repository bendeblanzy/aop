import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { SIMILARITY_MIN, SIMILARITY_MAX, SCORE_CURVE_EXPONENT } from '@/lib/ai/embeddings'

/**
 * Phase 3.B — Calibration auto des seuils (PREVIEW uniquement).
 *
 * GET /api/profil/scoring-params
 *
 * Lit `tender_calibration_feedback` + similarités cosinus correspondantes
 * (via embeddings tender × embedding profil) et propose des seuils ajustés.
 *
 * Ne MODIFIE rien : retourne `{ current, suggested, sample_size, confidence }`.
 * L'application auto sera implémentée en Phase 3.B-2 quand on aura assez
 * de feedback réel pour valider que la suggestion est stable.
 *
 * Heuristique :
 *   - On collecte (sim, verdict) pour tous les feedbacks de l'org.
 *   - SIM_MIN suggéré = sim médian des "no" (en dessous, on plancher à 0).
 *   - SIM_MAX suggéré = sim au 95e percentile des "match".
 *   - EXP suggéré = 1.0 (tant qu'on n'a pas de signal pour le bouger).
 *   - Confidence = bas si moins de 20 feedbacks, moyen 20-50, haut > 50.
 */

interface FeedbackRow {
  tender_idweb: string
  verdict: 'match' | 'maybe' | 'no'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // 1. Récupérer le feedback
  const { data: feedback } = await adminClient
    .from('tender_calibration_feedback')
    .select('tender_idweb, verdict')
    .eq('organization_id', orgId)

  const rows: FeedbackRow[] = Array.isArray(feedback) ? feedback : []
  const sample_size = rows.length

  if (sample_size < 5) {
    return NextResponse.json({
      current: { simMin: SIMILARITY_MIN, simMax: SIMILARITY_MAX, exp: SCORE_CURVE_EXPONENT },
      suggested: null,
      sample_size,
      confidence: 'insufficient',
      message: 'Au moins 5 feedbacks requis pour suggérer une calibration.',
    })
  }

  // 2. Lire l'embedding profil
  const { data: profile } = await adminClient
    .from('profiles')
    .select('embedding')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!profile?.embedding) {
    return NextResponse.json({
      current: { simMin: SIMILARITY_MIN, simMax: SIMILARITY_MAX, exp: SCORE_CURVE_EXPONENT },
      suggested: null,
      sample_size,
      confidence: 'insufficient',
      message: 'Embedding profil manquant — recalibrer le profil.',
    })
  }

  const profileEmb: number[] = typeof profile.embedding === 'string'
    ? JSON.parse(profile.embedding)
    : profile.embedding

  // 3. Lire les embeddings des tenders du feedback
  const idwebs = rows.map(r => r.tender_idweb)
  const { data: tenders } = await adminClient
    .from('tenders')
    .select('idweb, embedding')
    .in('idweb', idwebs)

  const tenderEmbByIdweb = new Map<string, number[]>()
  for (const t of tenders ?? []) {
    if (!t?.embedding) continue
    const emb: number[] = typeof t.embedding === 'string' ? JSON.parse(t.embedding) : t.embedding
    if (Array.isArray(emb) && emb.length > 0) tenderEmbByIdweb.set(t.idweb, emb)
  }

  // 4. Calculer (sim, verdict) pour chaque feedback
  const simByVerdict: Record<'match' | 'maybe' | 'no', number[]> = {
    match: [],
    maybe: [],
    no: [],
  }

  for (const r of rows) {
    const tEmb = tenderEmbByIdweb.get(r.tender_idweb)
    if (!tEmb) continue
    const sim = cosineSim(profileEmb, tEmb)
    simByVerdict[r.verdict].push(sim)
  }

  // 5. Suggestions
  const matches = simByVerdict.match
  const nos = simByVerdict.no

  const suggested = {
    simMin: nos.length >= 3 ? roundTo(median(nos), 2) : SIMILARITY_MIN,
    simMax: matches.length >= 3 ? roundTo(percentile(matches, 0.95), 2) : SIMILARITY_MAX,
    exp: SCORE_CURVE_EXPONENT,
  }

  // Garde-fous : on n'autorise pas un MIN >= MAX, ni des valeurs aberrantes.
  if (suggested.simMin >= suggested.simMax) suggested.simMin = SIMILARITY_MIN
  if (suggested.simMax > 0.95) suggested.simMax = 0.95
  if (suggested.simMin < 0) suggested.simMin = 0

  const confidence = sample_size >= 50 ? 'high' : sample_size >= 20 ? 'medium' : 'low'

  return NextResponse.json({
    current: { simMin: SIMILARITY_MIN, simMax: SIMILARITY_MAX, exp: SCORE_CURVE_EXPONENT },
    suggested,
    sample_size,
    confidence,
    breakdown: {
      match_count: matches.length,
      maybe_count: simByVerdict.maybe.length,
      no_count: nos.length,
      match_sim_median: matches.length ? roundTo(median(matches), 3) : null,
      no_sim_median: nos.length ? roundTo(median(nos), 3) : null,
    },
    message: 'Suggestions générées en preview. Application manuelle uniquement pour l\'instant.',
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d === 0 ? 0 : dot / d
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))
  return sorted[idx]
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}
