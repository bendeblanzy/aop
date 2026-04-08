import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { getEmbeddingsBatch, buildTenderText } from '@/lib/ai/embeddings'

/**
 * Route cron — embedde les tenders qui n'ont pas encore d'embedding.
 * Protégée par CRON_SECRET.
 *
 * Appelée après le sync BOAMP, ou manuellement :
 *   curl -X POST /api/cron/embed-tenders \
 *     -H "Authorization: Bearer VOTRE_CRON_SECRET" \
 *     -d '{"limit": 200}'
 */
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

  console.log(`[cron/embed-tenders] Embedding up to ${limit} tenders...`)

  try {
    // 1. Récupérer les tenders sans embedding
    const { data: tenders, error } = await adminClient
      .from('tenders')
      .select('idweb, objet, description_detail, short_summary, nomacheteur, descripteur_libelles, nature_libelle, type_marche, cpv_codes, lots_titres')
      .is('embedding', null)
      .order('dateparution', { ascending: false })
      .limit(limit)

    if (error) throw new Error(`DB read error: ${error.message}`)
    if (!tenders || tenders.length === 0) {
      return NextResponse.json({ success: true, embedded: 0, message: 'All tenders already embedded' })
    }

    console.log(`[cron/embed-tenders] Found ${tenders.length} tenders to embed`)

    // 2. Construire les textes
    const texts = tenders.map(t => buildTenderText(t))

    // 3. Batch embedding (par lots de 100 pour éviter les timeouts)
    const CHUNK_SIZE = 100
    let totalEmbedded = 0

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunkTexts = texts.slice(i, i + CHUNK_SIZE)
      const chunkTenders = tenders.slice(i, i + CHUNK_SIZE)

      const embeddings = await getEmbeddingsBatch(chunkTexts)

      // 4. Mettre à jour en batch
      const updates = chunkTenders.map((t, idx) => ({
        idweb: t.idweb,
        embedding: JSON.stringify(embeddings[idx]),
      }))

      // Upsert par lots de 20 (limite Supabase sur la taille du payload)
      for (let j = 0; j < updates.length; j += 20) {
        const batch = updates.slice(j, j + 20)
        const promises = batch.map(u =>
          adminClient
            .from('tenders')
            .update({ embedding: u.embedding })
            .eq('idweb', u.idweb)
        )
        await Promise.all(promises)
      }

      totalEmbedded += chunkTenders.length
      console.log(`[cron/embed-tenders] Embedded ${totalEmbedded}/${tenders.length}`)
    }

    return NextResponse.json({ success: true, embedded: totalEmbedded })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron/embed-tenders] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
