import { createClient } from '@/lib/supabase/server'
import { adminClient, uploadGeneratedDoc, getOrFallbackProfile } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { generateMemoireDocx } from '@/lib/documents/docx-generator'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ao_id } = await request.json()

  const [{ data: ao }, profile, { data: references }, { data: collaborateurs }] = await Promise.all([
    adminClient.from('appels_offres').select('*').eq('id', ao_id).eq('profile_id', user.id).single(),
    getOrFallbackProfile(user.id),
    adminClient.from('references').select('*').eq('profile_id', user.id),
    adminClient.from('collaborateurs').select('*').eq('profile_id', user.id),
  ])
  if (!ao) return NextResponse.json({ error: 'AO introuvable' }, { status: 404 })

  const selectedRefs = references?.filter(r => ao.references_selectionnees?.includes(r.id)) ?? references?.slice(0, 5) ?? []
  const selectedCollabs = collaborateurs?.filter(c => ao.collaborateurs_selectionnes?.includes(c.id)) ?? collaborateurs?.slice(0, 3) ?? []

  const userMsg = `
Profil entreprise : ${JSON.stringify(profile)}
Analyse RC : ${JSON.stringify(ao.analyse_rc || {})}
Analyse CCTP : ${JSON.stringify(ao.analyse_cctp || {})}
Références : ${JSON.stringify(selectedRefs)}
Collaborateurs : ${JSON.stringify(selectedCollabs)}
Notes : ${ao.notes_utilisateur || 'Aucune'}
AO : ${ao.titre} — Acheteur : ${ao.acheteur || 'N/A'}
`

  let raw: string
  try {
    raw = await callClaude(PROMPTS.generateMemoire, userMsg, 'sonnet')
  } catch (e) {
    return NextResponse.json({ error: 'Erreur IA' }, { status: 500 })
  }

  let sections: { title: string; content: string }[] = []
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    const parsed = m ? JSON.parse(m[0]) : {}
    sections = Object.entries(parsed).map(([k, v]) => ({
      title: k,
      content: typeof v === 'string' ? v : JSON.stringify(v, null, 2),
    }))
  } catch {
    sections = [{ title: 'Mémoire technique', content: raw }]
  }
  if (sections.length === 0) sections = [{ title: 'Contenu', content: raw }]

  const buffer = await generateMemoireDocx(ao.titre, sections)
  try {
    const publicUrl = await uploadGeneratedDoc(user.id, ao_id, 'Memoire', buffer)
    return NextResponse.json({ url: publicUrl, nom: `Memoire-${ao.titre}.docx` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
