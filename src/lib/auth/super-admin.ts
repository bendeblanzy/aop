import { createClient } from '@/lib/supabase/server'

/**
 * Vérifie si l'utilisateur courant est super_admin (rôle plateforme).
 * Le flag est stocké dans `auth.users.raw_user_meta_data.is_super_admin`.
 *
 * Utilisé par les layouts/routes du backoffice `/admin/monitoring/*`.
 *
 * Renvoie `null` si non authentifié, sinon `{ userId, email, isSuperAdmin }`.
 */
export async function getSuperAdminContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return {
    userId: user.id,
    email: user.email ?? null,
    isSuperAdmin: user.user_metadata?.is_super_admin === true,
  }
}
