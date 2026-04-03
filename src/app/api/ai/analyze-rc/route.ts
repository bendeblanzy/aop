import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { extractTextFromPDF } from '@/lib/documents/pdf-parser'
import { extractTextFromDocx } from '@/lib/documents/docx-parser'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ao_id, file_url } = await request.json()

  // Download file from Supabase Storage
  const res = await fetch(file_url)
  if (!res.ok) return NextResponse.json({ error: 'Cannot fetch file' }, { status: 400 })

  const buffer = Buffer.from(await res.arrayBuffer())
  const isDocx = file_url.toLowerCase().includes('.docx') || file_url.toLowerCase().includes('.doc')
  const text = isDocx ? await extractTextFromDocx(buffer) : await extractTextFromPDF(buffer)

  if (!text || text.trim().length < 50) {
    return NextResponse.json({ error: 'Document vide ou illisible' }, { status: 400 })
  }

  // Truncate to ~60k chars to avoid token limits
  const truncated = text.slice(0, 60000)

  const raw = await callClaude(PROMPTS.analyzeRC, `Voici le texte du RC à analyser :\n\n${truncated}`, 'sonnet')

  // Extract JSON
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return NextResponse.json({ error: 'Invalid AI response' }, { status: 500 })

  const analyse = JSON.parse(jsonMatch[0])

  // Save to DB
  await supabase.from('appels_offres').update({ analyse_rc: analyse }).eq('id', ao_id).eq('profile_id', user.id)

  return NextResponse.json({ analyse })
}
