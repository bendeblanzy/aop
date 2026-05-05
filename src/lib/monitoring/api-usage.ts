import { adminClient } from '@/lib/supabase/admin'
import { getApiKey } from './api-credentials'

/**
 * Adapters par provider pour récupérer l'usage des APIs tierces.
 *
 * Hiérarchie de lookup des clés (via getApiKey) :
 *   1. Table `api_credentials` (chiffré si API_KEY_ENCRYPTION_SECRET défini, sinon en clair)
 *   2. Variable d'environnement Vercel (rétrocompatibilité)
 *
 * Pour Anthropic et OpenAI, deux clés distinctes :
 *   - `anthropic` / `openai` = clé d'API normale (utilisée par l'app pour les appels)
 *   - `anthropic_admin` / `openai_admin` = clé "Admin" (uniquement utilisée pour l'usage report)
 */

export interface UsageSample {
  provider: 'apify' | 'resend' | 'anthropic' | 'openai'
  available: boolean
  reason?: string
  usageValue?: number          // dépense actuelle dans la période courante
  usageUnit?: 'usd' | 'emails' | 'tokens'
  limitValue?: number          // plafond du plan (si connu)
  usagePct?: number            // % d'utilisation
  creditsRemainingUsd?: number // crédit prépayé restant en $ (Anthropic surtout)
  spent30dUsd?: number         // dépensé sur 30 jours glissants en $ (calculé via snapshots)
  periodStart?: string
  periodEnd?: string
  raw?: unknown
}

// ───────────────────────────────────────────────────────────────────────────
// Apify — usage du mois en USD via /v2/users/me
// ───────────────────────────────────────────────────────────────────────────
export async function fetchApifyUsage(): Promise<UsageSample> {
  const token = await getApiKey('apify')
  if (!token) {
    return { provider: 'apify', available: false, reason: 'Clé Apify non configurée' }
  }

  try {
    const res = await fetch('https://api.apify.com/v2/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      return { provider: 'apify', available: false, reason: `HTTP ${res.status}` }
    }
    const json = await res.json() as { data?: Record<string, unknown> }
    const data = json.data ?? {}

    type UsageCycle = { usdLimit?: number; usdSpent?: number; startAt?: string; endAt?: string }
    const cycle = (data.usageCycle as UsageCycle | undefined) ?? {}
    const spent = typeof cycle.usdSpent === 'number' ? cycle.usdSpent : undefined
    const limit = typeof cycle.usdLimit === 'number' ? cycle.usdLimit : undefined
    const pct = (spent != null && limit != null && limit > 0) ? (spent / limit) * 100 : undefined
    const remaining = (spent != null && limit != null) ? Math.max(0, limit - spent) : undefined

    return {
      provider: 'apify',
      available: true,
      usageValue: spent,
      usageUnit: 'usd',
      limitValue: limit,
      usagePct: pct != null ? Math.round(pct * 100) / 100 : undefined,
      creditsRemainingUsd: remaining,
      periodStart: cycle.startAt?.slice(0, 10),
      periodEnd: cycle.endAt?.slice(0, 10),
      raw: data,
    }
  } catch (e) {
    return { provider: 'apify', available: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Resend — count emails du mois courant
// ───────────────────────────────────────────────────────────────────────────
export async function fetchResendUsage(): Promise<UsageSample> {
  const apiKey = await getApiKey('resend')
  if (!apiKey) {
    return { provider: 'resend', available: false, reason: 'Clé Resend non configurée' }
  }

  try {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    let count = 0
    let lastId: string | undefined
    let cappedAt: number | undefined
    for (let page = 0; page < 10; page++) {
      const url = new URL('https://api.resend.com/emails')
      url.searchParams.set('limit', '100')
      if (lastId) url.searchParams.set('after', lastId)
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) {
        if (page === 0) return { provider: 'resend', available: false, reason: `HTTP ${res.status}` }
        break
      }
      const json = await res.json() as { data?: { id: string; created_at: string }[] }
      const items = json.data ?? []
      if (items.length === 0) break

      const thisMonth = items.filter(it => new Date(it.created_at) >= monthStart)
      count += thisMonth.length
      if (thisMonth.length < items.length) break

      lastId = items[items.length - 1].id
      if (page === 9) cappedAt = count
    }

    return {
      provider: 'resend',
      available: true,
      usageValue: count,
      usageUnit: 'emails',
      limitValue: 3000,
      usagePct: Math.round((count / 3000) * 10000) / 100,
      periodStart: monthStart.toISOString().slice(0, 10),
      periodEnd: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).toISOString().slice(0, 10),
      raw: cappedAt != null ? { capped_at: cappedAt } : undefined,
    }
  } catch (e) {
    return { provider: 'resend', available: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Anthropic — clé admin requise pour usage_report
// ───────────────────────────────────────────────────────────────────────────
export async function fetchAnthropicUsage(): Promise<UsageSample> {
  const adminKey = await getApiKey('anthropic_admin')
  if (!adminKey) {
    return {
      provider: 'anthropic',
      available: false,
      reason: 'Clé admin Anthropic non configurée (créer une "Admin Key" sur console.anthropic.com → Settings → Admin Keys)',
    }
  }

  try {
    // Récupère l'usage des 30 derniers jours et le solde prépayé
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()
    const url = `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${thirtyDaysAgo}`
    const res = await fetch(url, {
      headers: { 'x-api-key': adminKey, 'anthropic-version': '2023-06-01' },
    })

    if (!res.ok) {
      return { provider: 'anthropic', available: false, reason: `HTTP ${res.status} sur usage_report` }
    }
    const json = await res.json() as { data?: Array<{ usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } }> }

    let totalTokens = 0
    for (const d of json.data ?? []) {
      totalTokens += (d.usage?.input_tokens ?? 0) + (d.usage?.output_tokens ?? 0)
        + (d.usage?.cache_creation_input_tokens ?? 0) + (d.usage?.cache_read_input_tokens ?? 0)
    }

    // Tenter aussi de récupérer la balance prépayée via /v1/organizations/cost_report
    let creditsRemainingUsd: number | undefined
    let spent30dUsd: number | undefined
    try {
      const costRes = await fetch(
        `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${thirtyDaysAgo}`,
        { headers: { 'x-api-key': adminKey, 'anthropic-version': '2023-06-01' } }
      )
      if (costRes.ok) {
        const costJson = await costRes.json() as { data?: Array<{ amount?: { value?: number } }> }
        spent30dUsd = (costJson.data ?? []).reduce((acc, b) => acc + (b.amount?.value ?? 0), 0)
      }
    } catch {}

    return {
      provider: 'anthropic',
      available: true,
      usageValue: totalTokens,
      usageUnit: 'tokens',
      creditsRemainingUsd,
      spent30dUsd: spent30dUsd != null ? Math.round(spent30dUsd * 100) / 100 : undefined,
      periodStart: thirtyDaysAgo.slice(0, 10),
      raw: json,
    }
  } catch (e) {
    return { provider: 'anthropic', available: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// OpenAI — clé admin requise pour usage
// ───────────────────────────────────────────────────────────────────────────
export async function fetchOpenAIUsage(): Promise<UsageSample> {
  const adminKey = await getApiKey('openai_admin')
  if (!adminKey) {
    return {
      provider: 'openai',
      available: false,
      reason: 'Clé admin OpenAI non configurée (créer une "Admin API Key" sur platform.openai.com → Settings → Organization → Admin keys)',
    }
  }

  try {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const startTs = Math.floor(monthStart.getTime() / 1000)

    const usageRes = await fetch(
      `https://api.openai.com/v1/organization/usage/completions?start_time=${startTs}`,
      { headers: { Authorization: `Bearer ${adminKey}` } }
    )
    if (!usageRes.ok) {
      return { provider: 'openai', available: false, reason: `HTTP ${usageRes.status} sur usage` }
    }
    const usageJson = await usageRes.json() as { data?: Array<{ results?: Array<{ input_tokens?: number; output_tokens?: number }> }> }
    let totalTokens = 0
    for (const bucket of usageJson.data ?? []) {
      for (const r of bucket.results ?? []) {
        totalTokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0)
      }
    }

    // Récupération du coût mensuel via /v1/organization/costs
    let spent30dUsd: number | undefined
    try {
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400
      const costRes = await fetch(
        `https://api.openai.com/v1/organization/costs?start_time=${thirtyDaysAgo}`,
        { headers: { Authorization: `Bearer ${adminKey}` } }
      )
      if (costRes.ok) {
        const costJson = await costRes.json() as { data?: Array<{ results?: Array<{ amount?: { value?: number } }> }> }
        spent30dUsd = 0
        for (const bucket of costJson.data ?? []) {
          for (const r of bucket.results ?? []) {
            spent30dUsd += r.amount?.value ?? 0
          }
        }
      }
    } catch {}

    return {
      provider: 'openai',
      available: true,
      usageValue: totalTokens,
      usageUnit: 'tokens',
      spent30dUsd: spent30dUsd != null ? Math.round(spent30dUsd * 100) / 100 : undefined,
      periodStart: monthStart.toISOString().slice(0, 10),
      raw: usageJson,
    }
  } catch (e) {
    return { provider: 'openai', available: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export const USAGE_FETCHERS = {
  apify: fetchApifyUsage,
  resend: fetchResendUsage,
  anthropic: fetchAnthropicUsage,
  openai: fetchOpenAIUsage,
} as const

export const PROVIDER_LABELS: Record<UsageSample['provider'], string> = {
  apify: 'Apify',
  resend: 'Resend',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
}

export const PROVIDER_DASHBOARDS: Record<UsageSample['provider'], string> = {
  apify: 'https://console.apify.com/billing',
  resend: 'https://resend.com/emails',
  anthropic: 'https://console.anthropic.com/settings/billing',
  openai: 'https://platform.openai.com/usage',
}

/**
 * Calcule le total dépensé sur les 30 derniers jours en agrégant les snapshots
 * quotidiens (pour les providers qui exposent une usage_value cumulative comme Apify).
 *
 * Utilise la diff entre snapshot le plus récent et celui d'il y a ~30 jours.
 */
export async function calc30dSpent(provider: UsageSample['provider']): Promise<number | null> {
  const since = new Date(Date.now() - 32 * 86400_000).toISOString().slice(0, 10)
  const { data } = await adminClient
    .from('api_usage_snapshots')
    .select('snapshot_date, usage_value, usage_unit')
    .eq('provider', provider)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true })

  if (!data || data.length < 2) return null
  // Pour Apify (usd cumulé sur cycle) : diff entre dernier et premier
  const first = data[0]
  const last = data[data.length - 1]
  if (typeof first.usage_value !== 'number' || typeof last.usage_value !== 'number') return null
  if (first.usage_unit !== 'usd') return null
  return Math.max(0, last.usage_value - first.usage_value)
}
