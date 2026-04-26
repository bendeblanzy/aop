import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/api-utils'

const BUCKET = 'ao-fichiers-source'

// ─── Validation ──────────────────────────────────────────────────────────────
// aoId vient du client → doit être un UUID strict pour empêcher path traversal
// dans le path Storage `${user.id}/${aoId}/...` (sinon "../other-user/abc"
// permettrait d'écrire dans le namespace d'un autre user).
const aoIdSchema = z.uuid()

// fileName : on refuse explicitement les séparateurs de chemin et `..` AVANT
// passage dans sanitizeFileName (défense en profondeur — sanitizeFileName les
// neutraliserait, mais on échoue tôt avec un message clair).
function isFileNameSafe(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0 || name.length > 255) return false
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false
  if (name.includes('\0')) return false
  return true
}

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // supprime les accents
    .replace(/[^a-z0-9.\-_]/gi, '_')   // espaces et caractères spéciaux → _
    .replace(/_+/g, '_')
    .replace(/^_|_$/, '')
}

/**
 * POST /api/upload
 *
 * Deux modes :
 * 1. { fileName, aoId, contentType } → retourne une signed upload URL (recommandé, contourne la limite 4.5MB Vercel)
 * 2. FormData avec file + ao_id → upload legacy via le serveur (limité à 4.5MB sur Vercel Hobby)
 */
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

  // Client admin (service_role) pour le storage — pas de restrictions RLS
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Créer le bucket s'il n'existe pas encore
  const { error: bucketError } = await adminClient.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/zip',
      'image/png',
      'image/jpeg',
      'image/tiff',
      'image/bmp',
    ],
    fileSizeLimit: 52428800, // 50 MB
  })
  if (bucketError && !bucketError.message.includes('already exists') && !bucketError.message.includes('duplicate')) {
    console.error('[upload] Bucket create error:', bucketError.message)
  }

  const contentTypeHeader = request.headers.get('content-type') || ''

  // ─── Mode 1 : Signed URL (JSON body) ───
  if (contentTypeHeader.includes('application/json')) {
    const { fileName, aoId, contentType } = await request.json()
    if (!fileName || !aoId) return NextResponse.json({ error: 'fileName and aoId required' }, { status: 400 })

    // Sécurité : aoId doit être un UUID, fileName ne doit pas contenir de
    // séquences de path traversal (`/`, `\`, `..`).
    if (!aoIdSchema.safeParse(aoId).success) {
      return apiError('aoId invalide', 400)
    }
    if (!isFileNameSafe(fileName)) {
      return apiError('fileName invalide', 400)
    }

    const safeName = sanitizeFileName(fileName)
    const storagePath = `${user.id}/${aoId}/${Date.now()}-${safeName}`

    const { data, error } = await adminClient.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath)

    if (error) {
      console.error('[upload] Signed URL error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: { publicUrl } } = adminClient.storage.from(BUCKET).getPublicUrl(storagePath)

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
      publicUrl,
    })
  }

  // ─── Mode 2 : Upload legacy via FormData (fallback, limité 4.5MB sur Vercel) ───
  const formData = await request.formData()
  const file = formData.get('file') as File
  const aoId = formData.get('ao_id') as string

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  // Sécurité : aoId doit être un UUID strict (path traversal via le path Storage).
  if (!aoIdSchema.safeParse(aoId).success) {
    return apiError('aoId invalide', 400)
  }

  const buffer = await file.arrayBuffer()
  const safeName = sanitizeFileName(file.name)
  const fileName = `${user.id}/${aoId}/${Date.now()}-${safeName}`

  const ext = file.name.split('.').pop()?.toLowerCase()
  const contentType =
    ext === 'pdf'  ? 'application/pdf' :
    ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
    ext === 'doc'  ? 'application/msword' :
    ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
    ext === 'xls'  ? 'application/vnd.ms-excel' :
    ext === 'zip'  ? 'application/zip' :
    ext === 'png'  ? 'image/png' :
    ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
    ext === 'tiff' || ext === 'tif' ? 'image/tiff' :
    ext === 'bmp'  ? 'image/bmp' :
    file.type || 'application/octet-stream'

  const { data, error } = await adminClient.storage
    .from(BUCKET)
    .upload(fileName, buffer, { contentType, upsert: true })

  if (error) {
    console.error('[upload] Storage error:', error.message, '| path:', fileName)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = adminClient.storage.from(BUCKET).getPublicUrl(data.path)
  return NextResponse.json({ url: publicUrl, path: data.path })
}
