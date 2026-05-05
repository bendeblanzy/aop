import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { syncBoampTenders } from '@/lib/boamp/sync'
import { getEmbeddingsBatch, buildTenderText } from '@/lib/ai/embeddings'
import { withSyncRun } from '@/lib/monitoring/sync-run'
import { checkCronGuard } from '@/lib/monitoring/cron-guard'

/**
 * Route cron — appellée par Vercel Cron chaque jour à 6h (Europe/Paris)
 * Protégée par Authorization: Bearer {CRON_SECRET}
 *
 * 1. Sync les tenders depuis BOAMP
 * 2. Embedd les nouveaux tenders sans embedding
 *
 * Peut aussi être déclenchée manuellement :
 *   curl -X POST /api/cron/sync-boamp \
 *     -H "Authorization: Bearer VOTRE_CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"daysBack": 30}'
 */
export async function POST(request: NextRequest) {
  const guard = await checkCronGuard(request, 'boamp')
  if (!guard.ok) return guard.response

  // Paramètre optionnel : nombre de jours à remonter
  let daysBack = 7
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body?.daysBack === 'number') {
      daysBack = Math.min(Math.max(1, body.daysBack), 90)
    }
  } catch {
    // body optionnel
  }

  console.log(`[cron/sync-boamp] Démarrage sync, daysBack=${daysBack}`)

  const triggeredBy = request.headers.get('x-triggered-by') ?? 'cron'

  try {
    const payload = await withSyncRun({ source: 'boamp', triggeredBy }, async (_runId, updateProgress) => {
    // Étape 1 : Sync BOAMP
    await updateProgress({ current: 0, total: 100, step: 'Récupération depuis API BOAMP…' })
    const result = await syncBoampTenders(adminClient, daysBack)
    await updateProgress({ current: 33, total: 100, step: `${result.fetched} AO récupérés, embedding en cours…` })

    // Étape 2 : Embedder les nouveaux tenders (sans embedding)
    let embedded = 0
    try {
      const { data: unembedded } = await adminClient
        .from('tenders')
        .select('idweb, objet, description_detail, short_summary, nomacheteur, descripteur_libelles, nature_libelle, type_marche, cpv_codes, lots_titres')
        .is('embedding', null)
        .order('dateparution', { ascending: false })
        .limit(200)

      if (unembedded && unembedded.length > 0) {
        console.log(`[cron/sync-boamp] Embedding ${unembedded.length} new tenders...`)
        const texts = unembedded.map(t => buildTenderText(t))

        // Batch par 100
        for (let i = 0; i < texts.length; i += 100) {
          const chunkTexts = texts.slice(i, i + 100)
          const chunkTenders = unembedded.slice(i, i + 100)
          const embeddings = await getEmbeddingsBatch(chunkTexts)

          const promises = chunkTenders.map((t, idx) =>
            adminClient
              .from('tenders')
              .update({ embedding: JSON.stringify(embeddings[idx]) })
              .eq('idweb', t.idweb)
          )
          // Par lots de 20 requêtes parallèles
          for (let j = 0; j < promises.length; j += 20) {
            await Promise.all(promises.slice(j, j + 20))
          }
          embedded += chunkTenders.length
          await updateProgress({ current: 33 + Math.round((embedded / unembedded.length) * 33), total: 100, step: `Embedded ${embedded}/${unembedded.length}` })
        }
        console.log(`[cron/sync-boamp] Embedded ${embedded} tenders`)
      }
    } catch (embedErr) {
      console.error('[cron/sync-boamp] Embedding error (non-fatal):', embedErr)
    }
    await updateProgress({ current: 80, total: 100, step: 'Purge des AO clos…' })

    // Étape 3 : Purge des AO BOAMP clos depuis plus de 7 jours
    // Évite l'accumulation d'AO morts et de leurs embeddings inutilisables.
    let purged = 0
    try {
      const { data: purgeData, error: purgeErr } = await adminClient
        .from('tenders')
        .delete()
        .eq('source', 'boamp')
        .lt('datelimitereponse', new Date(Date.now() - 7 * 86400 * 1000).toISOString())
        .select('idweb')
      if (purgeErr) console.error('[cron/sync-boamp] Purge error:', purgeErr.message)
      else purged = purgeData?.length ?? 0
      if (purged > 0) console.log(`[cron/sync-boamp] Purgé ${purged} AO BOAMP clos`)
    } catch (purgeErr) {
      console.error('[cron/sync-boamp] Purge exception (non-fatal):', purgeErr)
    }

    await updateProgress({ current: 90, total: 100, step: 'Auto-chaînage enrich-tenders…' })
    // Étape 4 : Auto-chaînage — déclenche enrich-tenders en arrière-plan pour
    // récupérer les détails (description, montant, lots) des nouveaux AO.
    // Best-effort, on n'attend pas la fin (peut prendre plusieurs minutes).
    try {
      const cronSecret = process.env.CRON_SECRET
      if (cronSecret && (result.inserted ?? 0) > 0) {
        const enrichUrl = new URL('/api/cron/enrich-tenders', request.nextUrl.origin).toString()
        // Fire-and-forget : on lance mais on n'attend pas (limit 50 pour rester rapide)
        fetch(enrichUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cronSecret}`,
            'Content-Type': 'application/json',
            'x-triggered-by': 'auto-chain:sync-boamp',
          },
          body: JSON.stringify({ limit: 50 }),
        }).catch(err => console.error('[sync-boamp auto-chain] enrich fetch failed:', err))
      }
    } catch (chainErr) {
      console.error('[sync-boamp auto-chain] exception:', chainErr)
    }

    return {
      metrics: {
        fetched: result.fetched ?? 0,
        inserted: result.inserted ?? 0,
        updated: (result.updated ?? 0) + embedded,
        errors: result.errors ?? 0,
        metadata: { daysBack, embedded, purged, autoChainedEnrich: (result.inserted ?? 0) > 0 },
      },
      response: { success: true, result, embedded, purged },
    }
    })
    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron/sync-boamp] Erreur:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Vercel Cron appelle en GET aussi selon la config vercel.json
export async function GET(request: NextRequest) {
  return POST(request)
}
