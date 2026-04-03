import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // supprime les accents
    .replace(/[^a-z0-9.\-_]/gi, '_')   // espaces et caractères spéciaux → _
    .replace(/_+/g, '_')
    .replace(/^_|_$/, '')
}

export async function POST(request: NextRequest) {
  // Vérifier l'authentification de l'utilisateur
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

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = await file.arrayBuffer()

  // Nom sanitisé (sans espaces ni accents)
  const safeName = sanitizeFileName(file.name)
  const fileName = `${user.id}/${aoId}/${Date.now()}-${safeName}`

  // Content-type fiable basé sur l'extension
  const ext = file.name.split('.').pop()?.toLowerCase()
  const contentType =
    ext === 'pdf'  ? 'application/pdf' :
    ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
    ext === 'doc'  ? 'application/msword' :
    file.type || 'application/octet-stream'

  // Client admin (service_role) pour le storage — pas de restrictions RLS
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Créer le bucket s'il n'existe pas encore
  const { error: bucketError } = await adminClient.storage.createBucket('ao-fichiers-source', {
    public: true,
    allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'],
    fileSizeLimit: 52428800, // 50 MB
  })
  // Ignorer l'erreur "already exists"
  if (bucketError && !bucketError.message.includes('already exists') && !bucketError.message.includes('duplicate')) {
    console.error('[upload] Bucket create error:', bucketError.message)
  }

  const { data, error } = await adminClient.storage
    .from('ao-fichiers-source')
    .upload(fileName, buffer, { contentType, upsert: true })

  if (error) {
    console.error('[upload] Storage error:', error.message, '| path:', fileName)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = adminClient.storage.from('ao-fichiers-source').getPublicUrl(data.path)
  return NextResponse.json({ url: publicUrl, path: data.path })
}
