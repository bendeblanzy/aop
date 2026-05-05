import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminContext } from '@/lib/auth/super-admin'
import { setApiKey, deleteApiKey, validateApiKey, type Provider } from '@/lib/monitoring/api-credentials'

const VALID_PROVIDERS: Provider[] = ['apify', 'resend', 'anthropic', 'openai', 'anthropic_admin', 'openai_admin']

function parseProvider(p: string): Provider | null {
  return (VALID_PROVIDERS as string[]).includes(p) ? (p as Provider) : null
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const sa = await getSuperAdminContext()
  if (!sa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!sa.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { provider: providerParam } = await ctx.params
  const provider = parseProvider(providerParam)
  if (!provider) return NextResponse.json({ error: `Provider invalide: ${providerParam}` }, { status: 400 })

  let body: { value?: string; validate?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  const value = body.value?.trim()
  if (!value) return NextResponse.json({ error: 'Clé vide' }, { status: 400 })

  // Validation optionnelle avant save
  if (body.validate !== false) {
    const validation = await validateApiKey(provider, value)
    if (!validation.ok) {
      return NextResponse.json({ error: `Clé invalide : ${validation.error}` }, { status: 400 })
    }
  }

  const setResult = await setApiKey(provider, value, sa.userId)
  if (!setResult.ok) {
    return NextResponse.json({ error: setResult.error ?? 'Erreur stockage' }, { status: 500 })
  }

  // Re-valider après save (pour stamper last_validated_at)
  await validateApiKey(provider, value)

  return NextResponse.json({ success: true, provider })
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const sa = await getSuperAdminContext()
  if (!sa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!sa.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { provider: providerParam } = await ctx.params
  const provider = parseProvider(providerParam)
  if (!provider) return NextResponse.json({ error: 'Provider invalide' }, { status: 400 })

  const r = await deleteApiKey(provider)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ success: true })
}
