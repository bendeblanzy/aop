import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { fetchBoampByIdweb, transformRecord } from '@/lib/boamp/sync'
import { withSyncRun } from '@/lib/monitoring/sync-run'
import { checkCronGuard } from '@/lib/monitoring/cron-guard'

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
  const guard = await checkCronGuard(request, 'enrich-tenders')
  if (!guard.ok) return guard.response

  let limit = 200
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body?.limit === 'number') limit = Math.min(Math.max(1, body.limit), 500)
  } catch {}

  const triggeredBy = request.headers.get('x-triggered-by') ?? 'cron'

  try {
    const payload = await withSyncRun<Record<string, unknown>>({ source: 'enrich-tenders', triggeredBy }, async () => {
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
      throw new Error(`DB read error: ${readErr.message}`)
    }
    if (!targets || targets.length === 0) {
      return {
        metrics: { fetched: 0, metadata: { limit } },
        response: { success: true, enriched: 0, message: 'No tenders need enrichment' },
      }
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
        const recordPayload = transformRecord(record)
        const { error: upErr } = await adminClient
          .from('tenders')
          .update({
            description_detail: recordPayload.description_detail,
            url_profil_acheteur: recordPayload.url_profil_acheteur,
            duree_mois: recordPayload.duree_mois,
            valeur_estimee: recordPayload.valeur_estimee,
            budget_estime: recordPayload.budget_estime,
            cpv_codes: recordPayload.cpv_codes,
            code_nuts: recordPayload.code_nuts,
            nb_lots: recordPayload.nb_lots,
            lots_titres: recordPayload.lots_titres,
            donnees: recordPayload.donnees,
            updated_at: recordPayload.updated_at,
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

    return {
      metrics: {
        fetched: targets.length,
        updated: enriched,
        errors: failed,
        errorMessages: errors,
        metadata: { limit, processed: targets.length, enriched, skipped, failed },
      },
      response: {
        success: true,
        processed: targets.length,
        enriched,
        skipped,
        failed,
        errors: errors.length > 0 ? errors : undefined,
      },
    }
    })
    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron/enrich-tenders] Erreur:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
