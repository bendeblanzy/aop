import { createClient } from '@/lib/supabase/server'
import { adminClient, uploadGeneratedDoc, getOrgIdForUser, getOrgProfile } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { generateMemoireDocx } from '@/lib/documents/docx-generator'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { ao_id } = await request.json()

  const [{ data: ao }, profile, { data: references }, { data: collaborateurs }] = await Promise.all([
    adminClient.from('appels_offres').select('*').eq('id', ao_id).eq('organization_id', orgId).single(),
    getOrgProfile(orgId),
    adminClient.from('references').select('*').eq('organization_id', orgId),
    adminClient.from('collaborateurs').select('*').eq('organization_id', orgId),
  ])
  if (!ao) return NextResponse.json({ error: 'AO introuvable' }, { status: 404 })

  const selectedRefs = references?.filter(r => ao.references_selectionnees?.includes(r.id)) ?? references?.slice(0, 5) ?? []
  const selectedCollabs = collaborateurs?.filter(c => ao.collaborateurs_selectionnes?.includes(c.id)) ?? collaborateurs?.slice(0, 3) ?? []

  const p = profile as any
  const userMsg = `
Entreprise : ${p.raison_sociale || ''}
${p.positionnement ? `Positionnement / Philosophie : ${p.positionnement}` : ''}
Profil complet : ${JSON.stringify(profile)}
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
    // Supprimer les éventuelles balises markdown ```json ... ```
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    const parsed = m ? JSON.parse(m[0]) : {}

    // Convertir chaque valeur en texte plat lisible
    function toText(v: unknown, depth = 0): string {
      if (typeof v === 'string') return v
      if (typeof v === 'boolean' || typeof v === 'number') return String(v)
      if (Array.isArray(v)) {
        return v.map(item => {
          const t = toText(item, depth + 1)
          return t.startsWith('-') ? t : `- ${t}`
        }).join('\n')
      }
      if (v && typeof v === 'object') {
        // Pour les objets imbriqués : extraire les champs "texte", "contenu", "description" en priorité
        const obj = v as Record<string, unknown>
        const textKeys = ['texte', 'contenu', 'description', 'text', 'content']
        for (const key of textKeys) {
          if (typeof obj[key] === 'string') return obj[key] as string
        }
        // Sinon concaténer récursivement
        return Object.entries(obj)
          .map(([k, val]) => {
            const label = k.replace(/_/g, ' ')
            const text = toText(val, depth + 1)
            if (text.includes('\n')) return `### ${label}\n${text}`
            return text ? `${text}` : ''
          })
          .filter(Boolean)
          .join('\n\n')
      }
      return ''
    }

    sections = Object.entries(parsed)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => ({
        title: k.replace(/_/g, ' ').replace(/^\d+\s*/, '').trim(),
        content: toText(v),
      }))
      .filter(s => s.content.trim().length > 0)

  } catch (e) {
    console.error('[generate-memoire] JSON parse failed, using raw text:', e)
    // Fallback : utiliser le texte brut nettoyé des backticks
    const fallback = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    sections = [{ title: 'Mémoire technique', content: fallback }]
  }
  if (sections.length === 0) sections = [{ title: 'Contenu', content: raw }]

  const buffer = await generateMemoireDocx(ao.titre, sections)
  try {
    const publicUrl = await uploadGeneratedDoc(orgId, ao_id, 'Memoire', buffer)
    return NextResponse.json({ url: publicUrl, nom: `Memoire-${ao.titre}.docx` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
