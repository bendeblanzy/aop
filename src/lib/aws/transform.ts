import type { AwsMpiApifyItem, AwsMpiLot } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Transformation : item Apify AWS MPI → record `tenders` (Supabase).
//
// Convention idweb :
//   `aws-mpi-{reference}`  ex. "aws-mpi-20260871430"
//
// Le préfixe "aws-mpi-" garantit l'absence de collision avec :
//   - BOAMP (idweb numérique court, ex "26-XXXXX")
//   - TED   (idweb préfixé "ted-")
//   - Atexo (idweb préfixé "atx-")
// ─────────────────────────────────────────────────────────────────────────────

/** Slug-safe pour idweb : alphanumérique + tiret/underscore. */
function slugRef(ref: string): string {
  return ref.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._/-]/g, '_').slice(0, 80)
}

/** Date string → "YYYY-MM-DD" ou null. */
function toDate(v: string | null | undefined): string | null {
  if (!v || typeof v !== 'string') return null
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** Date string → ISO timestamptz ou null. */
function toTimestamptz(v: string | null | undefined): string | null {
  if (!v || typeof v !== 'string') return null
  const trimmed = v.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return trimmed
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00+00:00`
  return trimmed
}

/** Lots Apify → tableau de titres pour le champ `lots_titres`. */
function lotsToTitres(lots: AwsMpiLot[] | null | undefined): string[] {
  if (!Array.isArray(lots)) return []
  return lots
    .map(l => {
      if (!l) return null
      const t = (l.intitule ?? '').trim()
      return t ? (l.numero ? `Lot ${l.numero}: ${t}` : t) : null
    })
    .filter((s): s is string => !!s)
}

/** "Services" → "SERVICES", "Travaux" → "TRAVAUX", etc. */
function normalizeTypeMarche(v: string | null | undefined): string | null {
  if (!v || typeof v !== 'string') return null
  const upper = v.trim().toUpperCase()
  if (!upper) return null
  if (upper.startsWith('SERV')) return 'SERVICES'
  if (upper.startsWith('TRAV')) return 'TRAVAUX'
  if (upper.startsWith('FOURN')) return 'FOURNITURES'
  return upper
}

/**
 * Transforme un item Apify AWS MPI en record compatible avec la table `tenders`.
 * Retourne null si l'item est vide ou inexploitable.
 */
export function transformAwsMpiItem(item: AwsMpiApifyItem) {
  if (!item || typeof item !== 'object') return null
  const ref = (item.reference ?? '').toString().trim()
  if (!ref) return null

  const idweb = `aws-mpi-${slugRef(ref)}`

  // L'objet principal : on préfère la description longue (fiche détail),
  // sinon l'intitulé de la page listing.
  const objet = (item.objet ?? item.intitule ?? null) || null
  // Si les deux sont différents, on met l'objet en description_detail
  const descriptionDetail = item.objet && item.intitule && item.objet !== item.intitule
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
    source: 'aws' as const,
    objet,
    nomacheteur: item.organisme ?? null,
    famille: null,
    nature: null,
    nature_libelle: typeMarche,
    dateparution: toDate(item.date_publication),
    datelimitereponse: toTimestamptz(item.date_limite_remise),
    datefindiffusion: null,
    descripteur_codes: [] as string[],
    descripteur_libelles: [] as string[],
    type_marche: typeMarche,
    url_avis: item.url_consultation || null,
    url_profil_acheteur: item.url_consultation || null,
    description_detail: descriptionDetail,
    valeur_estimee: valeur,
    budget_estime: valeur,
    duree_mois: null,
    cpv_codes: cpvCodes,
    code_nuts: null,
    code_departement: codeDept,
    type_procedure: item.procedure_type ?? null,
    procedure_libelle: item.procedure_type ?? null,
    nb_lots: typeof item.nb_lots === 'number' ? (item.nb_lots || null) : (Array.isArray(item.lots) ? (item.lots.length || null) : null),
    lots_titres: lotsTitres,
    updated_at: new Date().toISOString(),
  }
}

export type AwsMpiTenderRecord = NonNullable<ReturnType<typeof transformAwsMpiItem>>
