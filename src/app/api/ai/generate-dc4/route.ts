import { createClient } from '@/lib/supabase/server'
import { adminClient, uploadGeneratedDoc, getOrgIdForUser, getOrgProfile } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { generateDocx } from '@/lib/documents/docx-generator'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { ao_id } = await request.json()

  const [{ data: ao }, profile] = await Promise.all([
    adminClient.from('appels_offres').select('*').eq('id', ao_id).eq('organization_id', orgId).single(),
    getOrgProfile(orgId),
  ])

  if (!ao) return NextResponse.json({ error: 'AO introuvable' }, { status: 404 })

  const sousTraitants = (profile as any).sous_traitants || []

  // DC4 est optionnel : si pas de sous-traitants, on génère un document vide/explicatif
  const userMsg = sousTraitants.length > 0
    ? `
Titulaire : ${(profile as any).raison_sociale} — SIRET: ${(profile as any).siret}
Marché : ${ao.titre} — Acheteur : ${ao.acheteur || 'N/A'}
Sous-traitants :
${JSON.stringify(sousTraitants, null, 2)}
`
    : `
Titulaire : ${(profile as any).raison_sociale}
Marché : ${ao.titre}
Note : Pas de sous-traitance prévue pour ce marché.
`

  let raw: string
  try {
    raw = await callClaude(PROMPTS.generateDC4, userMsg, 'sonnet')
  } catch (e) {
    return NextResponse.json({ error: 'Erreur IA' }, { status: 500 })
  }

  let sections: { title: string; content: string }[]
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    sections = Object.entries(parsed).map(([k, v]) => ({ title: k, content: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }))
  } catch {
    sections = [{ title: 'DC4 — Déclaration de sous-traitance', content: raw }]
  }
  if (sections.length === 0) sections = [{ title: 'DC4', content: raw }]

  const buffer = await generateDocx(`DC4 — Déclaration de sous-traitance\n${ao.titre}`, sections)

  try {
    const publicUrl = await uploadGeneratedDoc(orgId, ao_id, 'DC4', buffer)
    return NextResponse.json({ url: publicUrl, nom: `DC4-${ao.titre}.docx` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
