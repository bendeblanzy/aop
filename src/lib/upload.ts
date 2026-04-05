/**
 * Upload un fichier directement vers Supabase Storage via signed URL.
 * Contourne la limite 4.5MB de Vercel en ne passant que les métadonnées par l'API Next.js.
 *
 * Flow :
 * 1. POST /api/upload (JSON) → obtient une signed URL + public URL
 * 2. PUT vers la signed URL (direct Supabase Storage, pas de limite Vercel)
 */
export async function uploadFileToStorage(
  file: File,
  aoId: string,
): Promise<{ url: string; path: string }> {
  // Extension → content-type fiable
  const ext = file.name.split('.').pop()?.toLowerCase()
  const contentType =
    ext === 'pdf'  ? 'application/pdf' :
    ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
    ext === 'doc'  ? 'application/msword' :
    file.type || 'application/octet-stream'

  // Étape 1 : obtenir la signed URL
  const metaRes = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, aoId, contentType }),
  })

  if (!metaRes.ok) {
    const body = await metaRes.json().catch(() => ({ error: 'Erreur serveur' }))
    throw new Error(body.error || `Erreur ${metaRes.status}`)
  }

  const { signedUrl, token, path, publicUrl } = await metaRes.json()

  // Étape 2 : upload direct vers Supabase Storage
  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      ...(token ? { 'x-upsert': 'true' } : {}),
    },
    body: file,
  })

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => 'Upload échoué')
    throw new Error(`Upload échoué (${uploadRes.status}): ${errText}`)
  }

  return { url: publicUrl, path }
}
