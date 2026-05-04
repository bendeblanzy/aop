import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { getSuperAdminContext } from '@/lib/auth/super-admin'

const VALID_STATUS = ['new', 'in_progress', 'resolved', 'wontfix'] as const

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sa = await getSuperAdminContext()
  if (!sa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!sa.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await ctx.params
  let body: { status?: string; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalide' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(body.status as typeof VALID_STATUS[number])) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }
    patch.status = body.status
    if (body.status === 'resolved') {
      patch.resolved_at = new Date().toISOString()
      patch.resolved_by = sa.userId
    } else if (body.status === 'new' || body.status === 'in_progress') {
      patch.resolved_at = null
      patch.resolved_by = null
    }
  }
  if (body.notes !== undefined) {
    patch.notes = body.notes?.slice(0, 5000) || null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 })
  }

  const { error } = await adminClient.from('bug_reports').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sa = await getSuperAdminContext()
  if (!sa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!sa.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const { error } = await adminClient.from('bug_reports').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
