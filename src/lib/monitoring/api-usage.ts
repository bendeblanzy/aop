/**
 * Adapters par provider pour récupérer l'usage des APIs tierces.
 *
 * Pour les providers nécessitant une clé "Admin" (Anthropic, OpenAI), on
 * retourne `available: false` si la clé n'est pas configurée — la page
 * /admin/monitoring/api affiche alors un message clair invitant à la créer.
 *
 * Apify et Resend marchent out-of-the-box avec les clés API standard.
 */

export interface UsageSample {
  provider: 'apify' | 'resend' | 'anthropic' | 'openai'
  available: boolean
  reason?: string
  usageValue?: number
  usageUnit?: 'usd' | 'emails' | 'tokens'
  limitValue?: number
  usagePct?: number
  periodStart?: string  // YYYY-MM-DD
  periodEnd?: string    // YYYY-MM-DD
  raw?: unknown
}

// ───────────────────────────────────────────────────────────────────────────
// Apify — usage du mois en USD via /v2/users/me
// ───────────────────────────────────────────────────────────────────────────
export async function fetchApifyUsage(): Promise<UsageSample> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    return { provider: 'apify', available: false, reason: 'APIFY_API_TOKEN absent' }
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

    // Champs renvoyés par Apify (cf doc) :
    //  data.usageCycle.usdLimit         — plafond USD du cycle (peut être null)
    //  data.usageCycle.startAt / endAt  — dates du cycle
    //  data.usageCycle.usdSpent         — dépense actuelle
    //  Selon le tier, la structure peut différer ; on défensif sur tout.
    type UsageCycle = {
      usdLimit?: number
      usdSpent?: number
      startAt?: string
      endAt?: string
    }
    const cycle = (data.usageCycle as UsageCycle | undefined) ?? {}
    const spent = typeof cycle.usdSpent === 'number' ? cycle.usdSpent : undefined
    const limit = typeof cycle.usdLimit === 'number' ? cycle.usdLimit : undefined
    const pct = (spent != null && limit != null && limit > 0) ? (spent / limit) * 100 : undefined

    return {
      provider: 'apify',
      available: true,
      usageValue: spent,
      usageUnit: 'usd',
      limitValue: limit,
      usagePct: pct != null ? Math.round(pct * 100) / 100 : undefined,
      periodStart: cycle.startAt?.slice(0, 10),
      periodEnd: cycle.endAt?.slice(0, 10),
      raw: data,
    }
  } catch (e) {
    return { provider: 'apify', available: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Resend — compte des emails du mois courant via /v1/emails
// (l'API n'expose pas un endpoint usage natif, on compte via list)
// ───────────────────────────────────────────────────────────────────────────
export async function fetchResendUsage(): Promise<UsageSample> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { provider: 'resend', available: false, reason: 'RESEND_API_KEY absent' }
  }

  try {
    // Resend API renvoie au max 100 emails par page. Pour avoir le compte total
    // du mois, on pagine. Pour rester économe (cron quotidien), on accepte une
    // limite à 1000 emails listés (10 pages max) — au-delà, on indique "1000+".
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

      // Filtre sur le mois courant
      const thisMonth = items.filter(it => new Date(it.created_at) >= monthStart)
      count += thisMonth.length
      // Dès qu'on voit un email avant le mois courant, plus la peine de pager
      if (thisMonth.length < items.length) break

      lastId = items[items.length - 1].id
      if (page === 9) cappedAt = count
    }

    return {
      provider: 'resend',
      available: true,
      usageValue: count,
      usageUnit: 'emails',
      // Resend free tier = 3000 emails/mois → on hardcode comme défaut raisonnable
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
// Anthropic — usage admin API (besoin clé Admin org séparée)
// ───────────────────────────────────────────────────────────────────────────
export async function fetchAnthropicUsage(): Promise<UsageSample> {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY
  if (!adminKey) {
    return {
      provider: 'anthropic',
      available: false,
      reason: 'ANTHROPIC_ADMIN_KEY absent — créer une "Admin Key" sur console.anthropic.com → Settings → Admin Keys',
    }
  }

  try {
    // /v1/organizations/usage_report/messages — stats par jour
    const today = new Date().toISOString().slice(0, 10)
    const url = `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${today}T00:00:00Z`
    const res = await fetch(url, {
      headers: {
        'x-api-key': adminKey,
        'anthropic-version': '2023-06-01',
      },
    })
    if (!res.ok) {
      return { provider: 'anthropic', available: false, reason: `HTTP ${res.status}` }
    }
    const json = await res.json() as { data?: Array<{ usage?: { input_tokens?: number; output_tokens?: number } }> }
    const totalTokens = (json.data ?? []).reduce((acc, d) => {
      return acc + (d.usage?.input_tokens ?? 0) + (d.usage?.output_tokens ?? 0)
    }, 0)

    return {
      provider: 'anthropic',
      available: true,
      usageValue: totalTokens,
      usageUnit: 'tokens',
      raw: json,
    }
  } catch (e) {
    return { provider: 'anthropic', available: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// OpenAI — usage admin API (besoin clé Admin org)
// ───────────────────────────────────────────────────────────────────────────
export async function fetchOpenAIUsage(): Promise<UsageSample> {
  const adminKey = process.env.OPENAI_ADMIN_KEY
  if (!adminKey) {
    return {
      provider: 'openai',
      available: false,
      reason: 'OPENAI_ADMIN_KEY absent — créer une "Admin API Key" sur platform.openai.com → Settings → Organization → Admin keys',
    }
  }

  try {
    // /v1/organization/usage/completions — usage des completions (mois courant)
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const startTs = Math.floor(monthStart.getTime() / 1000)

    const url = `https://api.openai.com/v1/organization/usage/completions?start_time=${startTs}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${adminKey}` },
    })
    if (!res.ok) {
      return { provider: 'openai', available: false, reason: `HTTP ${res.status}` }
    }
    const json = await res.json() as { data?: Array<{ results?: Array<{ input_tokens?: number; output_tokens?: number }> }> }
    let totalTokens = 0
    for (const bucket of json.data ?? []) {
      for (const r of bucket.results ?? []) {
        totalTokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0)
      }
    }

    return {
      provider: 'openai',
      available: true,
      usageValue: totalTokens,
      usageUnit: 'tokens',
      periodStart: monthStart.toISOString().slice(0, 10),
      raw: json,
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
