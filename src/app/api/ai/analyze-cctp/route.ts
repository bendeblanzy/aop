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

  const res = await fetch(file_url)
  if (!res.ok) return NextResponse.json({ error: 'Cannot fetch file' }, { status: 400 })

  const buffer = Buffer.from(await res.arrayBuffer())
  const isDocx = file_url.toLowerCase().includes('.docx')
  const text = isDocx ? await extractTextFromDocx(buffer) : await extractTextFromPDF(buffer)
  const truncated = text.slice(0, 60000)

  const raw = await callClaude(PROMPTS.analyzeCCTP, `Voici le texte du CCTP à analyser :\n\n${truncated}`, 'sonnet')
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return NextResponse.json({ error: 'Invalid AI response' }, { status: 500 })

  const analyse = JSON.parse(jsonMatch[0])
  await supabase.from('appels_offres').update({ analyse_cctp: analyse }).eq('id', ao_id).eq('profile_id', user.id)

  return NextResponse.json({ analyse })
}
