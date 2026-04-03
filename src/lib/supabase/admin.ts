import { createClient } from '@supabase/supabase-js'

// Client admin (service_role) — jamais exposé côté client
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Assure que le bucket existe (public) et upload le buffer. Retourne l'URL publique. */
export async function uploadGeneratedDoc(
  userId: string,
  aoId: string,
  prefix: string,
  buffer: Buffer
): Promise<string> {
  // Créer le bucket si absent
  await adminClient.storage.createBucket('ao-documents-generes', {
    public: true,
    fileSizeLimit: 52428800,
  }).catch(() => {}) // ignore "already exists"

  const fileName = `${userId}/${aoId}/${prefix}-${Date.now()}.docx`
  const { data, error } = await adminClient.storage
    .from('ao-documents-generes')
    .upload(fileName, buffer, { contentType: DOCX_MIME, upsert: true })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = adminClient.storage
    .from('ao-documents-generes')
    .getPublicUrl(data.path)

  return publicUrl
}

/** Récupère le profil utilisateur. Si absent, retourne un objet minimal pour ne pas bloquer. */
export async function getOrFallbackProfile(userId: string) {
  const { data } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()          // retourne null (pas d'erreur) si pas de ligne

  return data ?? {
    id: userId,
    raison_sociale: 'Entreprise (profil non complété)',
    nom_representant: '',
    prenom_representant: '',
    siret: '',
    pays: 'France',
    declaration_non_interdiction: false,
    declaration_a_jour_fiscal: false,
    declaration_a_jour_social: false,
  }
}
