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

  const userMsg = `
Profil entreprise :
${JSON.stringify(profile, null, 2)}

Analyse du RC :
${JSON.stringify(ao.analyse_rc || {}, null, 2)}

AO : ${ao.titre}
`

  let raw: string
  try {
    raw = await callClaude(PROMPTS.generateDUME, userMsg, 'sonnet')
  } catch (e) {
    return NextResponse.json({ error: 'Erreur IA' }, { status: 500 })
  }

  let sections: { title: string; content: string }[]
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    // Aplatir récursivement les objets imbriqués en texte lisible
    function flattenValue(v: unknown, depth = 0): string {
      if (typeof v === 'string') return v
      if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
      if (typeof v === 'number') return String(v)
      if (Array.isArray(v)) return v.map(item => `- ${flattenValue(item, depth + 1)}`).join('\n')
      if (v && typeof v === 'object') {
        return Object.entries(v as Record<string, unknown>)
          .map(([key, val]) => {
            const indent = '  '.repeat(depth)
            return `${indent}${key} : ${flattenValue(val, depth + 1)}`
          })
          .join('\n')
      }
      return String(v ?? '')
    }

    sections = Object.entries(parsed).map(([k, v]) => ({
      title: k,
      content: flattenValue(v),
    }))
  } catch {
    sections = [{ title: 'DUME', content: raw }]
  }
  if (sections.length === 0) sections = [{ title: 'DUME', content: raw }]

  const buffer = await generateDocx(`DUME — Document Unique de Marché Européen\n${ao.titre}`, sections)

  try {
    const publicUrl = await uploadGeneratedDoc(user.id, ao_id, 'DUME', buffer)
    return NextResponse.json({ url: publicUrl, nom: `DUME-${ao.titre}.docx` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
