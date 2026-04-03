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
  const [{ data: ao }, { data: profile }, { data: references }, { data: collaborateurs }] = await Promise.all([
    supabase.from('appels_offres').select('*').eq('id', ao_id).single(),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('references').select('*').eq('profile_id', user.id),
    supabase.from('collaborateurs').select('*').eq('profile_id', user.id),
  ])

  if (!ao || !profile) return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })

  const selectedRefs = references?.filter(r => ao.references_selectionnees?.includes(r.id)) || references?.slice(0, 5) || []
  const selectedCollabs = collaborateurs?.filter(c => ao.collaborateurs_selectionnes?.includes(c.id)) || collaborateurs?.slice(0, 3) || []

  const userMsg = `
Profil entreprise :
${JSON.stringify(profile, null, 2)}

Analyse du RC :
${JSON.stringify(ao.analyse_rc || {}, null, 2)}

Analyse du CCTP :
${JSON.stringify(ao.analyse_cctp || {}, null, 2)}

Références sélectionnées :
${JSON.stringify(selectedRefs, null, 2)}

Collaborateurs assignés :
${JSON.stringify(selectedCollabs, null, 2)}

Notes de l'utilisateur :
${ao.notes_utilisateur || 'Aucune'}

AO : ${ao.titre} — Acheteur : ${ao.acheteur || 'N/A'}
`

  const raw = await callClaude(PROMPTS.generateMemoire, userMsg, 'sonnet')
  let sections: { title: string; content: string }[]
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    sections = Object.entries(parsed).map(([k, v]) => ({ title: k, content: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }))
  } catch {
    sections = [{ title: 'Mémoire technique', content: raw }]
  }

  const buffer = await generateDocx(`Mémoire technique\n${ao.titre}`, sections)
  const fileName = `${user.id}/${ao_id}/Memoire-${Date.now()}.docx`
  const { data: uploadData, error } = await supabase.storage.from('ao-documents-generes').upload(fileName, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: { publicUrl } } = supabase.storage.from('ao-documents-generes').getPublicUrl(uploadData.path)
  return NextResponse.json({ url: publicUrl, nom: `Memoire-${ao.titre}.docx` })
}
