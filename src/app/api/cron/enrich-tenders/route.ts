import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { fetchBoampByIdweb, transformRecord } from '@/lib/boamp/sync'

/**
 * Route cron — enrichit les tenders BOAMP existants en base qui ont
 * des champs manquants (donnees brut null OU description_detail null
 * OU url_profil_acheteur null), en re-frappant l'API BOAMP.
 * Protégée par CRON_SECRET.
 *
 * Usage :
 *   curl -X POST /api/cron/enrich-tenders \
 *     -H "Authorization: Bearer VOTRE_CRON_SECRET" \
 *     -d '{"limit": 200}'
 *
 * Rate limit BOAMP : 60 req/min → délai ~600 ms entre appels.
 * Pour ~3500 AOP → ~35 min de runtime, à découper en plusieurs invocations.
 */

const DELAY_MS = 600

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let limit = 200
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body?.limit === 'number') limit = Math.min(Math.max(1, body.limit), 500)
  } catch {}

  // Cible : tenders BOAMP actifs avec donnees brut manquant
  const { data: targets, error: readErr } = await adminClient
    .from('tenders')
    .select('idweb')
    .eq('source', 'boamp')
    .gt('datelimitereponse', new Date().toISOString())
    .is('donnees', null)
    .order('datelimitereponse', { ascending: true })
    .limit(limit)

  if (readErr) {
    return NextResponse.json({ error: `DB read error: ${readErr.message}` }, { status: 500 })
  }
  if (!targets || targets.length === 0) {
    return NextResponse.json({ success: true, enriched: 0, message: 'No tenders need enrichment' })
  }

  console.log(`[cron/enrich-tenders] ${targets.length} tenders to enrich`)

  let enriched = 0
  let failed = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < targets.length; i++) {
    const { idweb } = targets[i]
    try {
      if (i > 0) await sleep(DELAY_MS)
      const record = await fetchBoampByIdweb(idweb)
      if (!record) {
        skipped++
        continue
      }
      const payload = transformRecord(record)
      const { error: upErr } = await adminClient
        .from('tenders')
        .update({
          description_detail: payload.description_detail,
          url_profil_acheteur: payload.url_profil_acheteur,
          duree_mois: payload.duree_mois,
          valeur_estimee: payload.valeur_estimee,
          budget_estime: payload.budget_estime,
          cpv_codes: payload.cpv_codes,
          code_nuts: payload.code_nuts,
          nb_lots: payload.nb_lots,
          lots_titres: payload.lots_titres,
          donnees: payload.donnees,
          updated_at: payload.updated_at,
        })
        .eq('idweb', idweb)

      if (upErr) {
        failed++
        if (errors.length < 5) errors.push(`${idweb}: ${upErr.message}`)
      } else {
        enriched++
      }
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : String(e)
      if (errors.length < 5) errors.push(`${idweb}: ${msg}`)
    }

    if ((i + 1) % 50 === 0) {
      console.log(`[cron/enrich-tenders] ${i + 1}/${targets.length} done (enriched=${enriched})`)
    }
  }

  return NextResponse.json({
    success: true,
    processed: targets.length,
    enriched,
    skipped,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
