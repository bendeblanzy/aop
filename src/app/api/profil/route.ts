import { adminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { apiError, apiSuccess, getAuthContext, parseBody } from '@/lib/api-utils'
import { upsertProfileSchema } from '@/lib/validations'

// Migration depuis /api/profile (anglais) → /api/profil (français), pour
// homogénéité avec /api/profil/deep-research et /api/profil/siret.
// Au moment de la migration (2026-04-26), aucun appelant front n'utilisait
// /api/profile — la route lit/écrit la table `profiles` directement via
// adminClient, et le front passe par le client Supabase côté navigateur.

export async function GET() {
  const { user, orgId } = await getAuthContext()
  if (!user) return apiError('Unauthorized', 401)
  if (!orgId) return apiError('No organization', 403)

  const { data, error } = await adminClient
    .from('profiles')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) return apiError(error.message)
  return apiSuccess(data)
}

export async function PUT(request: NextRequest) {
  const { user, orgId } = await getAuthContext()
  if (!user) return apiError('Unauthorized', 401)
  if (!orgId) return apiError('No organization', 403)

  const parsed = await parseBody(request, upsertProfileSchema)
  if (parsed.error) return parsed.error

  const { error } = await adminClient
    .from('profiles')
    .upsert({ ...parsed.data, organization_id: orgId })

  if (error) return apiError(error.message)
  return apiSuccess({ success: true })
}
