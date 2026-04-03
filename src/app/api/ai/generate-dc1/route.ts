import { createClient } from '@/lib/supabase/server'
import { adminClient, uploadGeneratedDoc, getOrFallbackProfile } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { generateDocx } from '@/lib/documents/docx-generator'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ao_id } = await request.json()

  const [{ data: ao }, profile] = await Promise.all([
    adminClient.from('appels_offres').select('*').eq('id', ao_id).eq('profile_id', user.id).single(),
    getOrFallbackProfile(user.id),
  ])

  if (!ao) return NextResponse.json({ error: 'AO introuvable' }, { status: 404 })

  const userMsg = `
Profil entreprise :
${JSON.stringify(profile, null, 2)}

Analyse du RC :
${JSON.stringify(ao.analyse_rc || {}, null, 2)}

Informations de l'AO :
- Titre: ${ao.titre}
- Acheteur: ${ao.acheteur || 'Non précisé'}
- Référence: ${ao.reference_marche || 'Non précisée'}
`

  let raw: string
  try {
    raw = await callClaude(PROMPTS.generateDC1, userMsg, 'sonnet')
  } catch (e) {
    console.error('[generate-dc1] Claude error:', e)
    return NextResponse.json({ error: 'Erreur IA' }, { status: 500 })
  }

  let sections: { title: string; content: string }[]
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    sections = Object.entries(parsed).map(([k, v]) => ({ title: k, content: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }))
  } catch {
    sections = [{ title: 'DC1 — Lettre de candidature', content: raw }]
  }
  if (sections.length === 0) sections = [{ title: 'DC1', content: raw }]

  const buffer = await generateDocx(`DC1 — Lettre de candidature\n${ao.titre}`, sections)

  try {
    const publicUrl = await uploadGeneratedDoc(user.id, ao_id, 'DC1', buffer)
    return NextResponse.json({ url: publicUrl, nom: `DC1-${ao.titre}.docx` })
  } catch (e: any) {
    console.error('[generate-dc1] Upload error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
