import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { extractText } from '@/lib/documents/text-extractor'
import { getAuthContext, parseBody, safeFetch } from '@/lib/api-utils'
import { aiAnalyzeSchema } from '@/lib/validations'

export async function POST(request: NextRequest) {
  try {
    const { user, orgId } = await getAuthContext()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

    const parsed = await parseBody(request, aiAnalyzeSchema)
    if (parsed.error) return parsed.error
    const { ao_id, file_url } = parsed.data

    // Télécharger le fichier depuis Supabase Storage (URL publique)
    let res: Response
    try {
      res = await safeFetch(file_url)
    } catch (fetchErr) {
      console.error('[analyze-bpu] Erreur réseau fetch:', fetchErr)
      return NextResponse.json({ error: 'Impossible de télécharger le fichier. Vérifiez l\'URL.' }, { status: 400 })
    }

    if (!res.ok) {
      console.error('[analyze-bpu] Impossible de télécharger le fichier:', res.status, res.statusText)
      return NextResponse.json({ error: `Impossible de télécharger le fichier (${res.status}). Le fichier a peut-être été supprimé.` }, { status: 400 })
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    console.log('[analyze-bpu] Fichier téléchargé, taille:', buffer.length, 'bytes')

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Le fichier téléchargé est vide.' }, { status: 400 })
    }

    // Extraction du texte avec support de tous les formats
    let text: string
    try {
      text = await extractText(buffer, file_url.split('/').pop() || 'fichier')
    } catch (parseErr) {
      console.error('[analyze-bpu] Erreur extraction texte:', parseErr)
      return NextResponse.json({
        error: 'Impossible d\'extraire le texte du document. Vérifiez que le fichier n\'est pas corrompu.'
      }, { status: 400 })
    }

    console.log('[analyze-bpu] Texte extrait:', text?.length ?? 0, 'caractères')

    if (!text || text.trim().length < 30) {
      return NextResponse.json({
        error: 'Le document semble vide ou illisible. Vérifiez que le fichier n\'est pas protégé ou vide.'
      }, { status: 400 })
    }

    // Limiter à ~60k caractères pour éviter de dépasser les tokens
    const truncated = text.slice(0, 60000)

    let raw: string
    try {
      raw = await callClaude(PROMPTS.analyzeBPU, `Voici le texte du BPU/DPGF à analyser :\n\n${truncated}`, 'sonnet')
    } catch (e) {
      console.error('[analyze-bpu] Erreur Claude:', e)
      const errMsg = e instanceof Error ? e.message : String(e)
      if (errMsg.includes('401') || errMsg.includes('authentication')) {
        return NextResponse.json({ error: 'Clé API Anthropic invalide ou expirée. Contactez l\'administrateur.' }, { status: 500 })
      }
      if (errMsg.includes('429') || errMsg.includes('rate')) {
        return NextResponse.json({ error: 'Trop de requêtes IA en cours. Veuillez réessayer dans quelques secondes.' }, { status: 429 })
      }
      return NextResponse.json({ error: 'Erreur lors de l\'appel à l\'IA Claude. Veuillez réessayer.' }, { status: 500 })
    }

    // Extraire le JSON de la réponse
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[analyze-bpu] Pas de JSON dans la réponse Claude:', raw.slice(0, 300))
      return NextResponse.json({ error: 'La réponse IA ne contient pas de données exploitables. Réessayez.' }, { status: 500 })
    }

    let analyse: object
    try {
      analyse = JSON.parse(jsonMatch[0])
    } catch (e) {
      console.error('[analyze-bpu] JSON invalide:', jsonMatch[0].slice(0, 300))
      return NextResponse.json({ error: 'Impossible de parser la réponse IA. Réessayez.' }, { status: 500 })
    }

    await adminClient.from('appels_offres').update({ analyse_bpu: analyse }).eq('id', ao_id).eq('organization_id', orgId)
    console.log('[analyze-bpu] Analyse sauvegardée pour AO:', ao_id)

    return NextResponse.json({ analyse })

  } catch (err) {
    console.error('[analyze-bpu] Erreur inattendue:', err)
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: `Erreur inattendue : ${message}` }, { status: 500 })
  }
}
