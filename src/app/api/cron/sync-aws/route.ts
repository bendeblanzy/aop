import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { syncAwsMpiTenders } from '@/lib/aws/sync'
import { getEmbeddingsBatch, buildTenderText } from '@/lib/ai/embeddings'

/**
 * Route cron AWS MPI — appelée par Vercel Cron chaque jour à 9h (Europe/Paris).
 * Protégée par Authorization: Bearer {CRON_SECRET}.
 *
 * Flow :
 *   1. Trigger un run Apify de `aws-mpi-scraper` (22 keywords métier)
 *   2. Récupère le dataset, upsert dans `tenders` (source='aws')
 *   3. Embed les nouveaux tenders AWS sans embedding (batch 100 OpenAI)
 *   4. Purge les AO AWS clos depuis plus de 7 jours
 *
 * Peut aussi être déclenchée manuellement :
 *   curl -X POST .../api/cron/sync-aws \
 *     -H "Authorization: Bearer VOTRE_CRON_SECRET"
 *
 * Variable d'environnement requise :
 *   APIFY_AWS_ACTOR_ID — ex: "username~aws-mpi-scraper"
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron/sync-aws] Démarrage')

  try {
    // ── Étape 1-2 : Sync AWS MPI (Apify run + upsert) ─────────────────────
    const result = await syncAwsMpiTenders(adminClient)

    // ── Étape 3 : Embedder les nouveaux tenders AWS sans embedding ─────────
    let embedded = 0
    try {
      const { data: unembedded } = await adminClient
        .from('tenders')
        .select('idweb, objet, description_detail, short_summary, nomacheteur, descripteur_libelles, nature_libelle, type_marche, cpv_codes, lots_titres')
        .eq('source', 'aws')
        .is('embedding', null)
        .order('dateparution', { ascending: false })
        .limit(200)

      if (unembedded && unembedded.length > 0) {
        console.log(`[cron/sync-aws] Embedding ${unembedded.length} new AWS tenders...`)
        const texts = unembedded.map((t: Record<string, unknown>) => buildTenderText(t))

        for (let i = 0; i < texts.length; i += 100) {
          const chunkTexts = texts.slice(i, i + 100)
          const chunkTenders = unembedded.slice(i, i + 100)
          const embeddings = await getEmbeddingsBatch(chunkTexts)

          const promises = chunkTenders.map((t: { idweb: string }, idx: number) =>
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
        console.log(`[cron/sync-aws] Embedded ${embedded} AWS tenders`)
      }
    } catch (embedErr) {
      console.error('[cron/sync-aws] Embedding error (non-fatal):', embedErr)
    }

    // ── Étape 4 : Purge des AO AWS clos depuis plus de 7 jours ───────────
    let purged = 0
    try {
      const { data: purgeData, error: purgeErr } = await adminClient
        .from('tenders')
        .delete()
        .eq('source', 'aws')
        .lt('datelimitereponse', new Date(Date.now() - 7 * 86400 * 1000).toISOString())
        .select('idweb')
      if (purgeErr) console.error('[cron/sync-aws] Purge error:', purgeErr.message)
      else purged = purgeData?.length ?? 0
      if (purged > 0) console.log(`[cron/sync-aws] Purgé ${purged} AO AWS clos`)
    } catch (purgeErr) {
      console.error('[cron/sync-aws] Purge exception (non-fatal):', purgeErr)
    }

    return NextResponse.json({ success: true, result, embedded, purged })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron/sync-aws] Erreur:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Vercel Cron appelle aussi en GET selon la config vercel.json
export async function GET(request: NextRequest) {
  return POST(request)
}
