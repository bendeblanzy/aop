import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { generateDocx } from '@/lib/documents/docx-generator'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ao_id } = await request.json()
  const [{ data: ao }, { data: profile }] = await Promise.all([
    supabase.from('appels_offres').select('*').eq('id', ao_id).single(),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
  ])

  if (!ao || !profile) return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })

  const sousTraitants = profile.sous_traitants || []
  if (sousTraitants.length === 0) {
    return NextResponse.json({ error: 'Aucun sous-traitant dans le profil' }, { status: 400 })
  }

  const userMsg = `
Titulaire : ${profile.raison_sociale} — SIRET: ${profile.siret}
Marché : ${ao.titre} — Acheteur : ${ao.acheteur || 'N/A'}
Sous-traitants :
${JSON.stringify(sousTraitants, null, 2)}
`

  const raw = await callClaude(PROMPTS.generateDC4, userMsg, 'sonnet')
  let sections: { title: string; content: string }[]
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    sections = Object.entries(parsed).map(([k, v]) => ({ title: k, content: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }))
  } catch {
    sections = [{ title: 'DC4 — Déclaration de sous-traitance', content: raw }]
  }

  const buffer = await generateDocx(`DC4 — Déclaration de sous-traitance\n${ao.titre}`, sections)
  const fileName = `${user.id}/${ao_id}/DC4-${Date.now()}.docx`
  const { data: uploadData, error } = await supabase.storage.from('ao-documents-generes').upload(fileName, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: { publicUrl } } = supabase.storage.from('ao-documents-generes').getPublicUrl(uploadData.path)
  return NextResponse.json({ url: publicUrl, nom: `DC4-${ao.titre}.docx` })
}
