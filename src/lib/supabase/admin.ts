import { createClient } from '@supabase/supabase-js'

// Client admin (service_role) — jamais exposé côté client
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Get organization_id for a given user_id */
export async function getOrgIdForUser(userId: string): Promise<string | null> {
  const { data } = await adminClient
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.organization_id ?? null
}

/** Get org profile, fallback to empty if not set */
export async function getOrgProfile(orgId: string) {
  const { data } = await adminClient
    .from('profiles')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()
  return data ?? {
    organization_id: orgId,
    raison_sociale: 'Entreprise (profil non complété)',
    nom_representant: '',
    prenom_representant: '',
    siret: '',
    declaration_non_interdiction: false,
    declaration_a_jour_fiscal: false,
    declaration_a_jour_social: false,
  }
}

/**
 * @deprecated Use getOrgProfile instead. Kept for backward compatibility.
 */
export async function getOrFallbackProfile(userId: string) {
  const orgId = await getOrgIdForUser(userId)
  if (!orgId) {
    return {
      organization_id: '',
      raison_sociale: 'Entreprise (profil non complété)',
      nom_representant: '',
      prenom_representant: '',
      siret: '',
      declaration_non_interdiction: false,
      declaration_a_jour_fiscal: false,
      declaration_a_jour_social: false,
    }
  }
  return getOrgProfile(orgId)
}

/** Assure que le bucket existe (public) et upload le buffer. Retourne l'URL publique. */
export async function uploadGeneratedDoc(
  orgId: string,
  aoId: string,
  prefix: string,
  buffer: Buffer
): Promise<string> {
  // Créer le bucket si absent
  await adminClient.storage.createBucket('ao-documents-generes', {
    public: true,
    fileSizeLimit: 52428800,
  }).catch(() => {}) // ignore "already exists"

  const fileName = `${orgId}/${aoId}/${prefix}-${Date.now()}.docx`
  const { data, error } = await adminClient.storage
    .from('ao-documents-generes')
    .upload(fileName, buffer, { contentType: DOCX_MIME, upsert: true })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = adminClient.storage
    .from('ao-documents-generes')
    .getPublicUrl(data.path)

  return publicUrl
}
