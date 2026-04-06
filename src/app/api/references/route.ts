import { adminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { apiError, apiSuccess, getAuthContext, parseBody, getPaginationParams } from '@/lib/api-utils'
import { createReferenceSchema, updateReferenceSchema, deleteByIdSchema } from '@/lib/validations'

export async function GET(request: NextRequest) {
  const { user, orgId } = await getAuthContext()
  if (!user) return apiError('Unauthorized', 401)
  if (!orgId) return apiError('No organization', 403)

  const { from, to } = getPaginationParams(request)
  const { data, error, count } = await adminClient
    .from('references')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) return apiError(error.message)
  return apiSuccess({ items: data || [], total: count ?? 0 })
}

export async function POST(request: NextRequest) {
  const { user, orgId } = await getAuthContext()
  if (!user) return apiError('Unauthorized', 401)
  if (!orgId) return apiError('No organization', 403)

  const parsed = await parseBody(request, createReferenceSchema)
  if (parsed.error) return parsed.error

  const { data, error } = await adminClient
    .from('references')
    .insert({ ...parsed.data, organization_id: orgId })
    .select()
    .single()

  if (error) return apiError(error.message)
  return apiSuccess(data, 201)
}

export async function PUT(request: NextRequest) {
  const { user, orgId } = await getAuthContext()
  if (!user) return apiError('Unauthorized', 401)
  if (!orgId) return apiError('No organization', 403)

  const parsed = await parseBody(request, updateReferenceSchema)
  if (parsed.error) return parsed.error

  const { id, ...rest } = parsed.data
  const { error } = await adminClient
    .from('references')
    .update(rest)
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return apiError(error.message)
  return apiSuccess({ success: true })
}

export async function DELETE(request: NextRequest) {
  const { user, orgId } = await getAuthContext()
  if (!user) return apiError('Unauthorized', 401)
  if (!orgId) return apiError('No organization', 403)

  const parsed = await parseBody(request, deleteByIdSchema)
  if (parsed.error) return parsed.error

  const { error } = await adminClient
    .from('references')
    .delete()
    .eq('id', parsed.data.id)
    .eq('organization_id', orgId)

  if (error) return apiError(error.message)
  return apiSuccess({ success: true })
}
