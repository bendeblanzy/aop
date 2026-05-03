import { apiError, apiSuccess, getAuthContext } from '@/lib/api-utils'
import { getEnrichmentContext } from '@/lib/enrichment'

/**
 * GET /api/profil/enrichment
 *
 * Retourne le contexte d'enrichissement existant pour l'organisation courante,
 * sans déclencher de calcul. Si l'organisation n'a jamais été enrichie, retourne
 * `{ context: null, sources: null, enriched_at: null, is_stale: true }`.
 *
 * `is_stale` indique si l'enrichissement est plus vieux que `ENRICHMENT_CACHE_TTL_DAYS`
 * — l'UI peut suggérer un "Régénérer".
 */
export async function GET() {
  const { user, orgId } = await getAuthContext()
  if (!user) return apiError('Unauthorized', 401)
  if (!orgId) return apiError('No organization', 403)

  try {
    const result = await getEnrichmentContext(orgId)
    if (!result) return apiSuccess({ context: null, sources: null, enriched_at: null, is_stale: true })
    return apiSuccess(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api/profil/enrichment] error:', msg)
    return apiError(`Lecture enrichment échouée : ${msg}`, 500)
  }
}
