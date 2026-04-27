import type { AtexoApifyItem, AtexoLot } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Transformation : item Apify Atexo → record `tenders` (Supabase).
//
// Convention idweb :
//   `atx-{provider}-{ref}`  ex. "atx-place-2025-0154-00-00-MPF", "atx-mxm-26U044"
//
// Le préfixe "atx-" garantit l'absence de collision avec :
//   - BOAMP (idweb numérique court, ex "26-XXXXX")
//   - TED   (idweb préfixé "ted-")
// ─────────────────────────────────────────────────────────────────────────────

/** Slug-safe pour idweb : on garde alphanumérique + tiret/_, pas d'espaces. */
function slugRef(ref: string): string {
  return ref.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._/-]/g, '_').slice(0, 80)
}

/** Date string → "YYYY-MM-DD" (date) ou null. */
function toDate(v: string | null | undefined): string | null {
  if (!v || typeof v !== 'string') return null
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** Date string → ISO timestamptz ou null (préserve TZ si présente). */
function toTimestamptz(v: string | null | undefined): string | null {
  if (!v || typeof v !== 'string') return null
  const trimmed = v.trim()
  if (!trimmed) return null
  // Si déjà ISO complet (avec heure et TZ) → on retourne tel quel
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return trimmed
  // Si juste une date → on ajoute l'heure 00:00 Europe/Paris (+02:00 par défaut, été)
  // NB : pour un timestamptz Postgres prend l'instant absolu, le décalage n'est qu'un
  // moyen d'exprimer l'instant. On utilise +00:00 par sécurité.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00+00:00`
  return trimmed
}

/** Lots Apify → tableau de titres (string[]) pour le champ `lots_titres`. */
function lotsToTitres(lots: AtexoLot[] | null | undefined): string[] {
  if (!Array.isArray(lots)) return []
  return lots
    .map(l => {
      if (!l) return null
      const t = (l.intitule ?? l.description ?? '').trim()
      return t ? (l.numero ? `Lot ${l.numero}: ${t}` : t) : null
    })
    .filter((s): s is string => !!s)
}

/** Map "services" → "SERVICES" pour rester homogène avec BOAMP/TED. */
function normalizeTypeMarche(v: string | null | undefined): string | null {
  if (!v || typeof v !== 'string') return null
  const upper = v.trim().toUpperCase()
  if (!upper) return null
  // Accepte déjà mappé (SERVICES/TRAVAUX/FOURNITURES) ou les variantes FR
  if (upper.startsWith('SERV')) return 'SERVICES'
  if (upper.startsWith('TRAV')) return 'TRAVAUX'
  if (upper.startsWith('FOURN')) return 'FOURNITURES'
  return upper
}

/**
 * Transforme un item Apify en record compatible avec la table `tenders`.
 *
 * Filtres appliqués :
 *   - reference & provider obligatoires
 *   - retourne null si vide ou inutilisable
 *
 * Le caller décide ensuite s'il filtre `type_marche === 'SERVICES'` (pour
 * rester aligné avec le scope BOAMP/TED) ou s'il accepte tout.
 */
export function transformAtexoItem(item: AtexoApifyItem) {
  if (!item || typeof item !== 'object') return null
  const ref = (item.reference ?? '').toString().trim()
  const provider = (item.provider ?? '').toString().trim()
  if (!ref || !provider) return null

  const idweb = `atx-${provider}-${slugRef(ref)}`
  const objet = (item.objet ?? item.intitule ?? null) || null
  const description = item.objet && item.intitule && item.objet !== item.intitule
    ? item.objet
    : null

  const cpvCodes = Array.isArray(item.cpv_codes) ? item.cpv_codes.filter(Boolean) : []
  const codeDept = Array.isArray(item.code_departement) ? item.code_departement.filter(Boolean) : []
  const lotsTitres = lotsToTitres(item.lots)
  const typeMarche = normalizeTypeMarche(item.type_marche)

  const valeur = (() => {
    const v = item.valeur_estimee
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
    return Math.round(v)
  })()

  return {
    idweb,
    source: 'atexo' as const,
    objet,
    nomacheteur: item.organisme ?? null,
    famille: null,
    nature: null,
    nature_libelle: typeMarche,            // ex "SERVICES" ; améliore l'embed
    dateparution: toDate(item.date_publication),
    datelimitereponse: toTimestamptz(item.date_limite_remise),
    datefindiffusion: null,
    descripteur_codes: [] as string[],
    descripteur_libelles: [] as string[],
    type_marche: typeMarche,
    url_avis: item.url_consultation || null,
    url_profil_acheteur: item.url_dce ?? item.url_consultation ?? null,
    description_detail: description,
    valeur_estimee: valeur,
    budget_estime: valeur,
    duree_mois: null,
    cpv_codes: cpvCodes,
    code_nuts: null,
    code_departement: codeDept,
    type_procedure: item.procedure_type ?? null,
    procedure_libelle: item.procedure_type ?? null,
    nb_lots: Array.isArray(item.lots) ? (item.lots.length || null) : null,
    lots_titres: lotsTitres,
    updated_at: new Date().toISOString(),
  }
}

export type AtexoTenderRecord = NonNullable<ReturnType<typeof transformAtexoItem>>
