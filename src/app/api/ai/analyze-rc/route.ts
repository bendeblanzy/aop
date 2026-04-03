import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { extractTextFromPDF } from '@/lib/documents/pdf-parser'
import { extractTextFromDocx } from '@/lib/documents/docx-parser'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { ao_id, file_url } = await request.json()
  console.log('[analyze-rc] Téléchargement:', file_url)

  // Télécharger le fichier depuis Supabase Storage (URL publique)
  const res = await fetch(file_url)
  if (!res.ok) {
    console.error('[analyze-rc] Impossible de télécharger le fichier:', res.status, res.statusText)
    return NextResponse.json({ error: `Cannot fetch file: ${res.status}` }, { status: 400 })
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  console.log('[analyze-rc] Fichier téléchargé, taille:', buffer.length, 'bytes')

  const url = file_url.toLowerCase()
  const isDocx = url.includes('.docx') || url.includes('.doc')
  const text = isDocx ? await extractTextFromDocx(buffer) : await extractTextFromPDF(buffer)

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
    return NextResponse.json({ error: 'Erreur lors de l\'appel à l\'IA Claude. Vérifiez la clé API.' }, { status: 500 })
  }

  // Extraire le JSON de la réponse
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[analyze-rc] Pas de JSON dans la réponse Claude:', raw.slice(0, 200))
    return NextResponse.json({ error: 'Réponse IA invalide' }, { status: 500 })
  }

  let analyse: object
  try {
    analyse = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('[analyze-rc] JSON invalide:', jsonMatch[0].slice(0, 200))
    return NextResponse.json({ error: 'Impossible de parser la réponse IA' }, { status: 500 })
  }

  await adminClient.from('appels_offres').update({ analyse_rc: analyse }).eq('id', ao_id).eq('organization_id', orgId)
  console.log('[analyze-rc] Analyse sauvegardée pour AO:', ao_id)

  return NextResponse.json({ analyse })
}
