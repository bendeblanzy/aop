import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { syncBoampTenders } from '@/lib/boamp/sync'
import { getEmbeddingsBatch, buildTenderText } from '@/lib/ai/embeddings'

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
  // Vérification du secret cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  try {
    // Étape 1 : Sync BOAMP
    const result = await syncBoampTenders(adminClient, daysBack)

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
        }
        console.log(`[cron/sync-boamp] Embedded ${embedded} tenders`)
      }
    } catch (embedErr) {
      console.error('[cron/sync-boamp] Embedding error (non-fatal):', embedErr)
    }

    return NextResponse.json({ success: true, result, embedded })
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
