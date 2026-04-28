import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { syncAtexoTenders } from '@/lib/atexo/sync'
import { getEmbeddingsBatch, buildTenderText } from '@/lib/ai/embeddings'

/**
 * Route cron Atexo MPE — appelée par Vercel Cron chaque jour à 7h (Europe/Paris).
 * Protégée par Authorization: Bearer {CRON_SECRET}.
 *
 * Flow :
 *   1. Trigger un run Apify de `atexo-mpe-scraper` qui scrape PLACE + Maximilien
 *   2. Récupère le dataset, upsert dans `tenders` (source='atexo')
 *   3. Embedd les nouveaux tenders Atexo sans embedding (batch 100 OpenAI)
 *
 * Peut aussi être déclenchée manuellement :
 *   curl -X POST .../api/cron/sync-atexo \
 *     -H "Authorization: Bearer VOTRE_CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"daysBack": 30}'
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let daysBack = 7
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body?.daysBack === 'number') {
      daysBack = Math.min(Math.max(1, body.daysBack), 30)
    }
  } catch {
    // body optionnel
  }

  console.log(`[cron/sync-atexo] Démarrage, daysBack=${daysBack}`)

  try {
    // Étape 1-2 : Sync Atexo (Apify run + upsert)
    const result = await syncAtexoTenders(adminClient, { daysBack })

    // Étape 3 : Embedder les nouveaux tenders Atexo sans embedding
    let embedded = 0
    try {
      const { data: unembedded } = await adminClient
        .from('tenders')
        .select('idweb, objet, description_detail, short_summary, nomacheteur, descripteur_libelles, nature_libelle, type_marche, cpv_codes, lots_titres')
        .eq('source', 'atexo')
        .is('embedding', null)
        .order('dateparution', { ascending: false })
        .limit(200)

      if (unembedded && unembedded.length > 0) {
        console.log(`[cron/sync-atexo] Embedding ${unembedded.length} new Atexo tenders...`)
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
        console.log(`[cron/sync-atexo] Embedded ${embedded} Atexo tenders`)
      }
    } catch (embedErr) {
      console.error('[cron/sync-atexo] Embedding error (non-fatal):', embedErr)
    }

    // Étape 4 : Purge des AO Atexo clos depuis plus de 7 jours
    let purged = 0
    try {
      const { data: purgeData, error: purgeErr } = await adminClient
        .from('tenders')
        .delete()
        .eq('source', 'atexo')
        .lt('datelimitereponse', new Date(Date.now() - 7 * 86400 * 1000).toISOString())
        .select('idweb')
      if (purgeErr) console.error('[cron/sync-atexo] Purge error:', purgeErr.message)
      else purged = purgeData?.length ?? 0
      if (purged > 0) console.log(`[cron/sync-atexo] Purgé ${purged} AO Atexo clos`)
    } catch (purgeErr) {
      console.error('[cron/sync-atexo] Purge exception (non-fatal):', purgeErr)
    }

    return NextResponse.json({ success: true, result, embedded, purged })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron/sync-atexo] Erreur:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Vercel Cron appelle aussi en GET selon la config vercel.json
export async function GET(request: NextRequest) {
  return POST(request)
}
