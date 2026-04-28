import type { AtexoProviderId } from './types'

/**
 * Configuration des plateformes Atexo MPE supportées par notre scraper.
 *
 * Le moteur PRADO d'Atexo est partagé entre toutes ces plateformes : seuls
 * `baseUrl` et la regex de référence changent. L'actor itère sur cette liste.
 *
 * Liste de plateformes additionnelles disponibles :
 *   cf. plateformes.csv de github.com/ColinMaudry/atexo-decp-scraper
 */
export interface AtexoProviderConfig {
  id: AtexoProviderId
  name: string
  baseUrl: string
  /** Activé par défaut dans le run quotidien */
  enabled: boolean
  /**
   * Mode de scraping :
   *   - 'keyword' : 1 sub-run par mot-clé (ATEXO_KEYWORDS_COMM). Ciblé,
   *     adapté aux plateformes à gros volume (PLACE = 2000+ AO actifs)
   *     où on doit filtrer côté actor.
   *   - 'listing' : 1 sub-run unique sur /AllCons (tous les services).
   *     Adapté aux petites plateformes régionales où le keyword loop
   *     prend trop de temps (~50s/keyword × 22 = 1100s) sans gain de
   *     filtrage. Le scoring vectoriel filtre côté Next.js.
   */
  mode: 'keyword' | 'listing'
}

// V3/V4 (Playwright, 2026-04-28/29) : grâce au scraper navigateur, le hard-cap
// PRADO 3 pages est levé et on peut couvrir toute la résultset. Bilan des
// plateformes Atexo testées :
//
//   ✅ Actives PRADO standard (mêmes sélecteurs) :
//      - PLACE, Maximilien, Bouches-du-Rhône, Pays de la Loire (PdL), Adullact.
//   ✅ Alsace réactivée (P2, 2026-04-29) : baseUrl corrigé vers le sous-domaine
//      plateforme.alsacemarchespublics.eu (le site vitrine ≠ moteur PRADO).
//   ⛔ Désactivée — moteur incompatible :
//      - Grand Est : ColdFusion (/avis/index.cfm) + AWSolutions (≠ PRADO).
//        Nécessite un scraper dédié, hors scope actuel.
//   ⛔ Désactivée — 0 AO services actifs :
//      - Montpellier Métropole (mtp3m) : peut réactiver si situation change.
//   🪦 Domaine mort (ERR_NAME_NOT_RESOLVED, plateforme migrée ou retirée) :
//      - Le Nord (retiré le 2026-04-28).
export const ATEXO_PROVIDERS: ReadonlyArray<AtexoProviderConfig> = [
  // ─── Plateformes actives — mode keyword (gros volume, filtrage utile) ─
  {
    id: 'place',
    name: "PLACE — Plateforme des Achats de l'État",
    baseUrl: 'https://www.marches-publics.gouv.fr',
    enabled: true,
    mode: 'keyword', // 2000+ AO actifs : filtrage par keyword obligatoire
  },
  {
    id: 'mxm',
    name: 'Maximilien — Marchés franciliens (Île-de-France)',
    baseUrl: 'https://marches.maximilien.fr',
    enabled: true,
    mode: 'keyword', // 500+ AO actifs : filtrage utile
  },

  // ─── Plateformes actives — mode listing (petit volume, keyword trop lent) ─
  {
    id: 'bdr',
    name: 'Marchés du département des Bouches-du-Rhône (13)',
    baseUrl: 'https://marches.departement13.fr',
    enabled: true,
    mode: 'listing', // V3 : keyword loop timeout sans push — listing mode plus pertinent
  },
  {
    id: 'pdl',
    name: 'Marchés publics Pays de la Loire',
    baseUrl: 'https://marchespublics.paysdelaloire.fr',
    enabled: true,
    mode: 'listing', // ~50s/keyword × 22 = 1100s : trop, listing global plus rapide
  },
  {
    id: 'adullact',
    name: "Adullact — Centrale d'achat collectivités",
    baseUrl: 'https://webmarche.adullact.org',
    enabled: true,
    mode: 'listing',
  },
  {
    id: 'mtp3m',
    name: 'Marchés Montpellier Méditerranée Métropole',
    baseUrl: 'https://marches.montpellier3m.fr',
    // Désactivé : 0 AO de services actifs trouvés en listing (vérifié 2026-04-28).
    // La plateforme répond et le formulaire fonctionne, mais le filtre
    // categorie='services' ne remonte aucun résultat. À réactiver si la
    // situation change ou si on teste sans filtre catégorie.
    enabled: false,
    mode: 'listing',
  },

  // ─── Alsace — PRADO standard sur sous-domaine plateforme.* ──────────────────
  // Diagnostic P2 (2026-04-29) : alsacemarchespublics.eu est un site CMS vitrine.
  // Le vrai moteur PRADO est sur plateforme.alsacemarchespublics.eu — le formulaire
  // AdvancedSearch y est identique à PLACE/Maximilien (mêmes sélecteurs $name).
  // Fix : corriger baseUrl de alsacemarchespublics.eu → plateforme.alsacemarchespublics.eu.
  {
    id: 'alsace',
    name: 'Alsace Marchés Publics',
    baseUrl: 'https://plateforme.alsacemarchespublics.eu', // ← sous-domaine PRADO (vitrine ≠ PRADO)
    enabled: true,
    mode: 'keyword',
  },

  // ─── Grand Est — moteur incompatible (ColdFusion + AWSolutions) ─────────────
  // Diagnostic P2 (2026-04-29) :
  //   - marchespublics.grandest.fr/avis/index.cfm → moteur ColdFusion custom
  //     avec des champs `txtLibre`, `IDN` (radio) — incompatible Atexo PRADO.
  //   - L'espace fournisseurs redirige vers awsolutions.fr (OpenID Connect),
  //     anciennement marches-publics.info — plateforme AWSolutions ≠ PRADO.
  // → Nécessite un scraper ColdFusion dédié — hors scope session V4.
  //   À réactiver uniquement après implémentation d'un adapter spécifique.
  {
    id: 'grandest',
    name: 'Marchés publics Grand Est',
    baseUrl: 'https://marchespublics.grandest.fr',
    enabled: false, // moteur ColdFusion — incompatible scraper PRADO, voir diagnostic P2
    mode: 'keyword',
  },

  // Note : lenord (marchespublics.lenord.fr) retiré le 2026-04-28 — domaine mort
  // (ERR_NAME_NOT_RESOLVED). La plateforme du département du Nord a migré.
] as const

/** Helper : retourne uniquement les providers actifs. */
export function activeProviders(): ReadonlyArray<AtexoProviderConfig> {
  return ATEXO_PROVIDERS.filter(p => p.enabled)
}

/**
 * Mots-clés métier ciblant les AO d'agences de communication / événementiel /
 * audiovisuel / design. Sans accents (PRADO Atexo ne supporte pas UTF-8 dans
 * le champ keywordSearch).
 *
 * Chaque entrée génère UN sub-run sur le formulaire de recherche avancée Atexo.
 * PRADO fait de l'OR implicite sur les mots séparés par des espaces : envoyer
 * "communication evenementiel publicite" retourne les AO qui contiennent AU
 * MOINS UN de ces mots (validé empiriquement le 2026-04-28 avec 30 items/66s).
 *
 * STRATÉGIE V4 (2026-04-28) — keyword OR groupé :
 * On réduit de 22 sub-runs individuels à 5 groupes thématiques. Bénéfice :
 *   - Avant : 22 sub-runs × ~67s/run = 1474s théoriques → PLACE timeout à ~7 keywords
 *   - Après : 5 sub-runs × ~65s/run = ~325s << 420s → couverture COMPLÈTE des 22 termes
 *
 * La déduplication par idweb dans sync.ts absorbe les recouvrements entre groupes.
 * Le scoring vectoriel pgvector filtre le noise côté Next.js.
 */
export const ATEXO_KEYWORDS_COMM: ReadonlyArray<string> = [
  // Groupe 1 — Communication & marketing (large)
  'communication publicite marketing relations publiques',
  // Groupe 2 — Événementiel (manifestations, congrès, cérémonies)
  'evenementiel salon seminaire festival exposition',
  // Groupe 3 — Audiovisuel & vidéo (production, captation, podcast)
  'audiovisuel video film podcast',
  // Groupe 4 — Design & identité visuelle (graphisme, signalétique)
  'design graphisme identite visuelle signaletique',
  // Groupe 5 — Édition, web & réseaux sociaux
  'scenographie edition magazine site internet reseaux sociaux',
] as const
