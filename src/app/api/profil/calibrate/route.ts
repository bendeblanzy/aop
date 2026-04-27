import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { callClaude } from '@/lib/ai/claude-client'

/**
 * POST /api/profil/calibrate
 *
 * Body: { feedback: [{ tender_idweb: string, verdict: "match"|"maybe"|"no", reason?: string }] }
 *
 * Persiste le feedback utilisateur. Si au moins un "no", on appelle Claude
 * pour dériver des exclusions_globales depuis les AO refusés (lecture des
 * objets), et on les fusionne avec les exclusions existantes du profil.
 * Le profil est invalidé (embedding NULL + tender_scores DELETE) pour
 * forcer un recalcul au prochain accès.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  let feedback: { tender_idweb: string; verdict: string; reason?: string }[]
  try {
    const body = await request.json()
    if (!Array.isArray(body?.feedback)) {
      return NextResponse.json({ error: 'feedback array required' }, { status: 400 })
    }
    feedback = body.feedback
      .filter((f: any) => f && typeof f.tender_idweb === 'string' && ['match', 'maybe', 'no'].includes(f.verdict))
      .slice(0, 20)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (feedback.length === 0) {
    return NextResponse.json({ error: 'no valid feedback entries' }, { status: 400 })
  }

  // 1. Persister
  const upsertData = feedback.map(f => ({
    organization_id: orgId,
    tender_idweb: f.tender_idweb,
    verdict: f.verdict,
    reason: f.reason ?? null,
  }))

  const { error: upErr } = await adminClient
    .from('tender_calibration_feedback')
    .upsert(upsertData, { onConflict: 'organization_id,tender_idweb' })

  if (upErr) {
    console.error('[calibrate] upsert error:', upErr.message)
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  // 2. Si au moins un "no" : dériver des exclusions globales via Claude
  const noFeedback = feedback.filter(f => f.verdict === 'no')
  let newExclusions: string[] = []

  if (noFeedback.length > 0) {
    const noIdwebs = noFeedback.map(f => f.tender_idweb)
    const { data: noTenders } = await adminClient
      .from('tenders')
      .select('idweb, objet, descripteur_libelles')
      .in('idweb', noIdwebs)

    if (noTenders && noTenders.length > 0) {
      const tendersForClaude = noTenders.map(t => ({
        objet: t.objet,
        domaines: (t.descripteur_libelles ?? []).join(', '),
        raison_user: noFeedback.find(f => f.tender_idweb === t.idweb)?.reason || '',
      }))

      try {
        const raw = await callClaude(
          `Tu analyses des appels d'offres que l'utilisateur a explicitement REJETÉS.
Ta mission : extraire 1 à 5 mots-clés / sujets / secteurs courts (1-3 mots) que l'utilisateur veut éviter.
Ces exclusions seront utilisées pour pénaliser les AO similaires dans le futur.

Sois CONCRET et SPÉCIFIQUE : "BTP gros œuvre", "restauration scolaire", "désamiantage", "vidéosurveillance".
Évite les termes génériques comme "travaux" ou "services".

Réponds en JSON pur : {"exclusions": ["term1", "term2", ...]}`,
          `AO rejetés :\n${JSON.stringify(tendersForClaude, null, 2)}`,
          'haiku' // pas besoin de Sonnet pour ça
        )
        const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed?.exclusions)) {
          newExclusions = parsed.exclusions
            .filter((e: any) => typeof e === 'string' && e.trim().length > 0)
            .map((e: string) => e.trim())
            .slice(0, 8)
        }
      } catch (e) {
        console.error('[calibrate] Claude exclusion extraction failed:', e)
        // Pas critique — on persiste juste le feedback brut
      }
    }
  }

  // 3. Fusionner avec exclusions_globales existantes
  if (newExclusions.length > 0) {
    const { data: prof } = await adminClient
      .from('profiles')
      .select('exclusions_globales')
      .eq('organization_id', orgId)
      .maybeSingle()

    const existing: string[] = Array.isArray(prof?.exclusions_globales)
      ? prof!.exclusions_globales
      : []
    // Dédoublonne (case-insensitive)
    const merged = Array.from(new Set([
      ...existing,
      ...newExclusions.filter(ne => !existing.some(e => e.toLowerCase() === ne.toLowerCase())),
    ]))

    await adminClient
      .from('profiles')
      .update({
        exclusions_globales: merged,
        // Forcer recalcul de l'embedding au prochain accès (les exclusions
        // sont injectées dans le texte d'embedding via buildProfileText)
        embedding: null,
        embedding_updated_at: null,
      })
      .eq('organization_id', orgId)

    // Invalider le cache des scores
    await adminClient.from('tender_scores').delete().eq('organization_id', orgId)
  }

  return NextResponse.json({
    success: true,
    saved: feedback.length,
    new_exclusions: newExclusions,
  })
}
