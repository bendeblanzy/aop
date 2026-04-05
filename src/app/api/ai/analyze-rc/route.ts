import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { extractTextFromPDF } from '@/lib/documents/pdf-parser'
import { extractTextFromDocx } from '@/lib/documents/docx-parser'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgId = await getOrgIdForUser(user.id)
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

    const { ao_id, file_url } = await request.json()
    if (!ao_id || !file_url) {
      return NextResponse.json({ error: 'ao_id et file_url sont requis' }, { status: 400 })
    }
    console.log('[analyze-rc] Téléchargement:', file_url)

    // Télécharger le fichier depuis Supabase Storage (URL publique)
    let res: Response
    try {
      res = await fetch(file_url)
    } catch (fetchErr) {
      console.error('[analyze-rc] Erreur réseau fetch:', fetchErr)
      return NextResponse.json({ error: 'Impossible de télécharger le fichier. Vérifiez l\'URL.' }, { status: 400 })
    }

    if (!res.ok) {
      console.error('[analyze-rc] Impossible de télécharger le fichier:', res.status, res.statusText)
      return NextResponse.json({ error: `Impossible de télécharger le fichier (${res.status}). Le fichier a peut-être été supprimé.` }, { status: 400 })
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    console.log('[analyze-rc] Fichier téléchargé, taille:', buffer.length, 'bytes')

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Le fichier téléchargé est vide.' }, { status: 400 })
    }

    // Extraction du texte
    const url = file_url.toLowerCase()
    const isDocx = url.includes('.docx') || url.includes('.doc')
    let text: string
    try {
      text = isDocx ? await extractTextFromDocx(buffer) : await extractTextFromPDF(buffer)
    } catch (parseErr) {
      console.error('[analyze-rc] Erreur extraction texte:', parseErr)
      return NextResponse.json({
        error: 'Impossible d\'extraire le texte du document. Vérifiez que le fichier n\'est pas corrompu.'
      }, { status: 400 })
    }

    console.log('[analyze-rc] Texte extrait:', text?.length ?? 0, 'caractères')

    if (!text || text.trim().length < 30) {
      return NextResponse.json({
        error: 'Le document semble vide ou illisible. Vérifiez que le PDF n\'est pas protégé ou scanné sans OCR.'
      }, { status: 400 })
    }

    // Limiter à ~60k caractères pour éviter de dépasser les tokens
    const truncated = text.slice(0, 60000)

    let raw: string
    try {
      raw = await callClaude(PROMPTS.analyzeRC, `Voici le texte du RC à analyser :\n\n${truncated}`, 'sonnet')
    } catch (e) {
      console.error('[analyze-rc] Erreur Claude:', e)
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
      console.error('[analyze-rc] Pas de JSON dans la réponse Claude:', raw.slice(0, 300))
      return NextResponse.json({ error: 'La réponse IA ne contient pas de données exploitables. Réessayez.' }, { status: 500 })
    }

    let analyse: object
    try {
      analyse = JSON.parse(jsonMatch[0])
    } catch (e) {
      console.error('[analyze-rc] JSON invalide:', jsonMatch[0].slice(0, 300))
      return NextResponse.json({ error: 'Impossible de parser la réponse IA. Réessayez.' }, { status: 500 })
    }

    await adminClient.from('appels_offres').update({ analyse_rc: analyse }).eq('id', ao_id).eq('organization_id', orgId)
    console.log('[analyze-rc] Analyse sauvegardée pour AO:', ao_id)

    return NextResponse.json({ analyse })

  } catch (err) {
    console.error('[analyze-rc] Erreur inattendue:', err)
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: `Erreur inattendue : ${message}` }, { status: 500 })
  }
}
