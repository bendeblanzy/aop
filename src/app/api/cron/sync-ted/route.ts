import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { syncTedTenders } from '@/lib/ted/sync'
import { getEmbeddingsBatch, buildTenderText } from '@/lib/ai/embeddings'
import { withSyncRun } from '@/lib/monitoring/sync-run'
import { checkCronGuard } from '@/lib/monitoring/cron-guard'

/**
 * Route cron — appelée par Vercel Cron chaque jour à 6h (Europe/Paris).
 * Protégée par Authorization: Bearer {CRON_SECRET}.
 *
 * 1. Sync les annonces TED (Tenders Electronic Daily — UE) limitées à la France
 * 2. Embedd les nouveaux tenders sans embedding
 *
 * Peut aussi être déclenchée manuellement :
 *   curl -X POST /api/cron/sync-ted \
 *     -H "Authorization: Bearer VOTRE_CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"daysBack": 30}'
 */
export async function POST(request: NextRequest) {
  const guard = await checkCronGuard(request, 'ted')
  if (!guard.ok) return guard.response

  let daysBack = 7
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body?.daysBack === 'number') {
      daysBack = Math.min(Math.max(1, body.daysBack), 90)
    }
  } catch {
    // body optionnel
  }

  console.log(`[cron/sync-ted] Démarrage sync, daysBack=${daysBack}`)

  const triggeredBy = request.headers.get('x-triggered-by') ?? 'cron'

  try {
    const payload = await withSyncRun({ source: 'ted', triggeredBy }, async () => {
    // Étape 1 : Sync TED
    const result = await syncTedTenders(adminClient, daysBack)

    // Étape 2 : Embedder les nouveaux tenders TED sans embedding
    let embedded = 0
    try {
      const { data: unembedded } = await adminClient
        .from('tenders')
        .select('idweb, objet, description_detail, short_summary, nomacheteur, descripteur_libelles, nature_libelle, type_marche, cpv_codes, lots_titres')
        .eq('source', 'ted')
        .is('embedding', null)
        .order('dateparution', { ascending: false })
        .limit(200)

      if (unembedded && unembedded.length > 0) {
        console.log(`[cron/sync-ted] Embedding ${unembedded.length} new TED tenders...`)
        const texts = unembedded.map(t => buildTenderText(t))

        for (let i = 0; i < texts.length; i += 100) {
          const chunkTexts = texts.slice(i, i + 100)
          const chunkTenders = unembedded.slice(i, i + 100)
          const embeddings = await getEmbeddingsBatch(chunkTexts)

          const promises = chunkTenders.map((t, idx) =>
            adminClient
              .from('tenders')
              .update({ embedding: JSON.stringify(embeddings[idx]) })
              .eq('idweb', t.idweb),
          )
          for (let j = 0; j < promises.length; j += 20) {
            await Promise.all(promises.slice(j, j + 20))
          }
          embedded += chunkTenders.length
        }
        console.log(`[cron/sync-ted] Embedded ${embedded} TED tenders`)
      }
    } catch (embedErr) {
      console.error('[cron/sync-ted] Embedding error (non-fatal):', embedErr)
    }

    // Étape 3 : Purge des AO TED clos depuis plus de 7 jours
    let purged = 0
    try {
      const { data: purgeData, error: purgeErr } = await adminClient
        .from('tenders')
        .delete()
        .eq('source', 'ted')
        .lt('datelimitereponse', new Date(Date.now() - 7 * 86400 * 1000).toISOString())
        .select('idweb')
      if (purgeErr) console.error('[cron/sync-ted] Purge error:', purgeErr.message)
      else purged = purgeData?.length ?? 0
      if (purged > 0) console.log(`[cron/sync-ted] Purgé ${purged} AO TED clos`)
    } catch (purgeErr) {
      console.error('[cron/sync-ted] Purge exception (non-fatal):', purgeErr)
    }

    return {
      metrics: {
        fetched: result.fetched ?? 0,
        inserted: result.inserted ?? 0,
        updated: embedded,
        errors: result.errors ?? 0,
        metadata: { daysBack, embedded, purged, pages: result.pages },
      },
      response: { success: true, result, embedded, purged },
    }
    })
    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron/sync-ted] Erreur:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Vercel Cron appelle aussi en GET selon la config vercel.json
export async function GET(request: NextRequest) {
  return POST(request)
}
