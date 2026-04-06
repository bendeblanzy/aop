import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { extractTextFromPDF } from '@/lib/documents/pdf-parser'
import { extractTextFromDocx } from '@/lib/documents/docx-parser'
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

    let res: Response
    try {
      res = await safeFetch(file_url)
    } catch (fetchErr) {
      console.error('[analyze-cctp] Erreur réseau fetch:', fetchErr)
      return NextResponse.json({ error: 'Impossible de télécharger le fichier.' }, { status: 400 })
    }

    if (!res.ok) {
      console.error('[analyze-cctp] Fetch échoué:', res.status)
      return NextResponse.json({ error: `Impossible de télécharger le fichier (${res.status}).` }, { status: 400 })
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Le fichier téléchargé est vide.' }, { status: 400 })
    }

    const isDocx = file_url.toLowerCase().includes('.docx')
    let text: string
    try {
      text = isDocx ? await extractTextFromDocx(buffer) : await extractTextFromPDF(buffer)
    } catch (parseErr) {
      console.error('[analyze-cctp] Erreur extraction texte:', parseErr)
      return NextResponse.json({ error: 'Impossible d\'extraire le texte du document.' }, { status: 400 })
    }

    console.log('[analyze-cctp] Texte extrait:', text?.length ?? 0, 'caractères')

    if (!text || text.trim().length < 30) {
      return NextResponse.json({
        error: 'Le document semble vide ou illisible. Vérifiez que le PDF n\'est pas scanné sans OCR.'
      }, { status: 400 })
    }

    const truncated = text.slice(0, 60000)

    let raw: string
    try {
      raw = await callClaude(PROMPTS.analyzeCCTP, `Voici le texte du CCTP à analyser :\n\n${truncated}`, 'sonnet')
    } catch (e) {
      console.error('[analyze-cctp] Erreur Claude:', e)
      const errMsg = e instanceof Error ? e.message : String(e)
      if (errMsg.includes('429') || errMsg.includes('rate')) {
        return NextResponse.json({ error: 'Trop de requêtes IA. Réessayez dans quelques secondes.' }, { status: 429 })
      }
      return NextResponse.json({ error: 'Erreur lors de l\'appel à l\'IA Claude. Réessayez.' }, { status: 500 })
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[analyze-cctp] Pas de JSON:', raw.slice(0, 300))
      return NextResponse.json({ error: 'Réponse IA invalide. Réessayez.' }, { status: 500 })
    }

    let analyse: object
    try {
      analyse = JSON.parse(jsonMatch[0])
    } catch {
      console.error('[analyze-cctp] JSON parse error')
      return NextResponse.json({ error: 'Impossible de parser la réponse IA.' }, { status: 500 })
    }

    await adminClient.from('appels_offres').update({ analyse_cctp: analyse }).eq('id', ao_id).eq('organization_id', orgId)
    console.log('[analyze-cctp] Analyse sauvegardée pour AO:', ao_id)

    return NextResponse.json({ analyse })

  } catch (err) {
    console.error('[analyze-cctp] Erreur inattendue:', err)
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: `Erreur inattendue : ${message}` }, { status: 500 })
  }
}
