import type { AtexoProviderId } from './types'

/**
 * Configuration des plateformes Atexo MPE supportées par notre scraper.
 *
 * Le moteur PRADO d'Atexo est partagé entre toutes ces plateformes : seuls
 * `baseUrl` et la regex de référence changent. L'actor itère sur cette liste.
 *
 * Plateformes ajoutables (toutes Atexo Local Trust MPE) :
 *   - megalis-bretagne.org
 *   - achats.entrepot-data.gouv.fr
 *   - mpe.bretagne.bzh
 *   - … cf. plateformes.csv de github.com/ColinMaudry/atexo-decp-scraper
 */
export interface AtexoProviderConfig {
  id: AtexoProviderId
  name: string
  baseUrl: string
  /** Activé par défaut dans le run quotidien */
  enabled: boolean
}

export const ATEXO_PROVIDERS: ReadonlyArray<AtexoProviderConfig> = [
  {
    id: 'place',
    name: "PLACE — Plateforme des Achats de l'État",
    baseUrl: 'https://www.marches-publics.gouv.fr',
    enabled: true,
  },
  {
    id: 'mxm',
    name: 'Maximilien — Marchés franciliens',
    baseUrl: 'https://marches.maximilien.fr',
    enabled: true,
  },
] as const

/** Helper : retourne uniquement les providers actifs. */
export function activeProviders(): ReadonlyArray<AtexoProviderConfig> {
  return ATEXO_PROVIDERS.filter(p => p.enabled)
}
