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

  const userMsg = `
Profil entreprise :
${JSON.stringify(profile, null, 2)}

Analyse du RC :
${JSON.stringify(ao.analyse_rc || {}, null, 2)}

AO : ${ao.titre}
`

  const raw = await callClaude(PROMPTS.generateDUME, userMsg, 'sonnet')
  let sections: { title: string; content: string }[]
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    sections = Object.entries(parsed).map(([k, v]) => ({ title: k, content: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }))
  } catch {
    sections = [{ title: 'DUME', content: raw }]
  }

  const buffer = await generateDocx(`DUME — Document Unique de Marché Européen\n${ao.titre}`, sections)
  const fileName = `${user.id}/${ao_id}/DUME-${Date.now()}.docx`
  const { data: uploadData, error } = await supabase.storage.from('ao-documents-generes').upload(fileName, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: { publicUrl } } = supabase.storage.from('ao-documents-generes').getPublicUrl(uploadData.path)
  return NextResponse.json({ url: publicUrl, nom: `DUME-${ao.titre}.docx` })
}
