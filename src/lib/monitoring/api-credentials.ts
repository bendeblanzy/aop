import { adminClient } from '@/lib/supabase/admin'

/**
 * Gestion des clés API tierces.
 *
 * Stockage : table `api_credentials` chiffrée via pgcrypto (`pgp_sym_encrypt`)
 * avec une clé maître stockée dans l'env var `API_KEY_ENCRYPTION_SECRET`.
 *
 * Lookup hiérarchique pour `getApiKey()` :
 *   1. DB chiffrée (si la clé maître est définie ET la clé est en base)
 *   2. Variable d'environnement Vercel (rétrocompatibilité)
 *
 * Sans la clé maître configurée, on stocke EN CLAIR avec un warning UI.
 * À éviter en prod, mais permet d'utiliser l'UI immédiatement.
 */

export type Provider = 'apify' | 'resend' | 'anthropic' | 'openai' | 'anthropic_admin' | 'openai_admin'

const ENV_FALLBACK: Record<Provider, string> = {
  apify: 'APIFY_API_TOKEN',
  resend: 'RESEND_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic_admin: 'ANTHROPIC_ADMIN_KEY',
  openai_admin: 'OPENAI_ADMIN_KEY',
}

function getMasterSecret(): string | null {
  return process.env.API_KEY_ENCRYPTION_SECRET || null
}

/**
 * Récupère la valeur en clair pour un provider donné.
 * Renvoie null si aucune source n'a la clé.
 */
export async function getApiKey(provider: Provider): Promise<string | null> {
  const secret = getMasterSecret()

  // 1. Tenter la DB
  try {
    if (secret) {
      // Clé maître présente → décrypter via pgp_sym_decrypt côté Postgres
      const { data, error } = await adminClient.rpc('decrypt_api_key', {
        p_provider: provider,
        p_secret: secret,
      })
      if (!error && data) return data as string
    } else {
      // Pas de clé maître → on a stocké en clair (cast bytea→text)
      const { data, error } = await adminClient
        .from('api_credentials')
        .select('encrypted_value')
        .eq('provider', provider)
        .maybeSingle()
      if (!error && data?.encrypted_value) {
        // encrypted_value est en bytea ; en plain mode on a stocké le texte UTF-8 brut
        const buf = Buffer.from(data.encrypted_value as unknown as string, 'hex')
        return buf.toString('utf-8') || null
      }
    }
  } catch (e) {
    console.error(`[api-credentials/${provider}] DB lookup failed:`, e instanceof Error ? e.message : e)
  }

  // 2. Fallback env var
  return process.env[ENV_FALLBACK[provider]] || null
}

/**
 * Stocke une clé API (chiffrée si la clé maître est dispo, en clair sinon).
 */
export async function setApiKey(provider: Provider, value: string, updatedBy?: string): Promise<{ ok: boolean; error?: string }> {
  if (!value || value.trim().length === 0) {
    return { ok: false, error: 'Clé vide' }
  }
  const secret = getMasterSecret()

  try {
    if (secret) {
      // Encrypt via Postgres
      const { error } = await adminClient.rpc('encrypt_api_key', {
        p_provider: provider,
        p_value: value,
        p_secret: secret,
        p_updated_by: updatedBy ?? null,
      })
      if (error) return { ok: false, error: error.message }
    } else {
      // Stockage en clair (bytea hex de l'utf-8)
      const hex = '\\x' + Buffer.from(value, 'utf-8').toString('hex')
      const { error } = await adminClient.from('api_credentials').upsert({
        provider,
        encrypted_value: hex,
        updated_by: updatedBy ?? null,
        last_validated_at: null,
        last_validation_ok: null,
        last_validation_error: null,
      })
      if (error) return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Supprime une clé API stockée en DB (revient au fallback env si présent).
 */
export async function deleteApiKey(provider: Provider): Promise<{ ok: boolean; error?: string }> {
  const { error } = await adminClient.from('api_credentials').delete().eq('provider', provider)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Teste qu'une clé est valide en faisant un appel ping au provider.
 * Renvoie {ok, error} et update last_validated_at en DB.
 */
export async function validateApiKey(provider: Provider, value: string): Promise<{ ok: boolean; error?: string; details?: unknown }> {
  try {
    let res: Response
    switch (provider) {
      case 'apify':
        res = await fetch('https://api.apify.com/v2/users/me', {
          headers: { Authorization: `Bearer ${value}` },
        })
        break
      case 'resend':
        // Pas de /me. On tente /domains qui requiert auth.
        res = await fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${value}` },
        })
        break
      case 'anthropic':
      case 'anthropic_admin':
        // /v1/models requiert juste une clé valide
        res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': value, 'anthropic-version': '2023-06-01' },
        })
        break
      case 'openai':
      case 'openai_admin':
        res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${value}` },
        })
        break
      default:
        return { ok: false, error: `Provider inconnu: ${provider}` }
    }

    if (res.ok) {
      // Update validation stamp
      try {
        await adminClient.from('api_credentials').update({
          last_validated_at: new Date().toISOString(),
          last_validation_ok: true,
          last_validation_error: null,
        }).eq('provider', provider)
      } catch {}
      return { ok: true }
    }
    const errTxt = await res.text().catch(() => `HTTP ${res.status}`)
    try {
      await adminClient.from('api_credentials').update({
        last_validated_at: new Date().toISOString(),
        last_validation_ok: false,
        last_validation_error: errTxt.slice(0, 500),
      }).eq('provider', provider)
    } catch {}
    return { ok: false, error: `HTTP ${res.status} — ${errTxt.slice(0, 300)}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Retourne le statut de configuration de chaque provider (sans révéler les clés).
 * Utilisé par la page Crédits API pour afficher l'état.
 */
export async function listCredentialsStatus(): Promise<Array<{
  provider: Provider
  hasDbValue: boolean
  hasEnvFallback: boolean
  lastValidatedAt: string | null
  lastValidationOk: boolean | null
  lastValidationError: string | null
}>> {
  const { data } = await adminClient
    .from('api_credentials')
    .select('provider, encrypted_value, last_validated_at, last_validation_ok, last_validation_error')

  const dbMap = new Map<string, {
    encrypted_value: unknown
    last_validated_at: string | null
    last_validation_ok: boolean | null
    last_validation_error: string | null
  }>()
  for (const row of (data ?? []) as Array<{
    provider: string
    encrypted_value: unknown
    last_validated_at: string | null
    last_validation_ok: boolean | null
    last_validation_error: string | null
  }>) {
    dbMap.set(row.provider, row)
  }

  const providers: Provider[] = ['apify', 'resend', 'anthropic', 'openai', 'anthropic_admin', 'openai_admin']
  return providers.map(p => {
    const db = dbMap.get(p)
    return {
      provider: p,
      hasDbValue: !!db?.encrypted_value,
      hasEnvFallback: !!process.env[ENV_FALLBACK[p]],
      lastValidatedAt: db?.last_validated_at ?? null,
      lastValidationOk: db?.last_validation_ok ?? null,
      lastValidationError: db?.last_validation_error ?? null,
    }
  })
}

export function isMasterSecretConfigured(): boolean {
  return !!getMasterSecret()
}
