import { NextResponse } from 'next/server'
import { ZodError, ZodSchema } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgIdForUser } from '@/lib/supabase/admin'

// ── Standard API response helpers ────────────────────────────────────────────

export function apiError(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status })
}

export function apiSuccess<T>(data: T, status: number = 200) {
  return NextResponse.json({ data }, { status })
}

// ── Auth + org guard ─────────────────────────────────────────────────────────

export async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, orgId: null }

  const orgId = await getOrgIdForUser(user.id)
  return { user, orgId }
}

// ── Request body validation ──────────────────────────────────────────────────

export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { data: null, error: apiError('Corps de requête JSON invalide', 400) }
  }

  try {
    const data = schema.parse(body)
    return { data, error: null }
  } catch (e) {
    if (e instanceof ZodError) {
      const messages = e.issues.map((issue) => `${String(issue.path?.join('.') ?? '')}: ${issue.message}`).join(', ')
      return { data: null, error: apiError(`Validation : ${messages}`, 400) }
    }
    return { data: null, error: apiError('Données invalides', 400) }
  }
}

// ── URL safety ───────────────────────────────────────────────────────────────

const ALLOWED_FETCH_DOMAINS = [
  '.supabase.co',
  '.supabase.in',
  'supabase.co',
  'supabase.in',
]

/**
 * Validates that a URL is safe to fetch (not internal network, not file://, etc.)
 * Only allows Supabase storage URLs by default.
 */
export function isUrlSafeToFetch(urlString: string): boolean {
  try {
    const url = new URL(urlString)

    // Block non-http(s) schemes
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false

    // Block localhost / private IPs
    const hostname = url.hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.') ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false
    }

    // Allow only whitelisted domains
    return ALLOWED_FETCH_DOMAINS.some(domain => hostname.endsWith(domain))
  } catch {
    return false
  }
}

/**
 * Fetch with URL validation and timeout
 */
export async function safeFetch(url: string, timeoutMs: number = 30000): Promise<Response> {
  if (!isUrlSafeToFetch(url)) {
    throw new Error('URL non autorisée. Seules les URLs Supabase Storage sont acceptées.')
  }
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
}

// ── Pagination helpers ───────────────────────────────────────────────────────

export function getPaginationParams(request: Request): { from: number; to: number; limit: number } {
  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')))
  const from = (page - 1) * limit
  const to = from + limit - 1
  return { from, to, limit }
}
