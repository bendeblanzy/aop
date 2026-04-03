import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const aoId = formData.get('ao_id') as string
  const type = formData.get('type') as string

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const fileName = `${user.id}/${aoId}/${Date.now()}-${file.name}`

  const { data, error } = await supabase.storage
    .from('ao-fichiers-source')
    .upload(fileName, buffer, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('ao-fichiers-source').getPublicUrl(data.path)
  return NextResponse.json({ url: publicUrl, path: data.path })
}
