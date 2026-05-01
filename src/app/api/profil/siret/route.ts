import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/profil/siret?q=<siren_or_siret>
 * Recherche une entreprise via l'Annuaire des Entreprises (data.gouv.fr)
 * et retourne les champs normalisés pour pré-remplir le profil.
 * Exécuté côté serveur pour éviter les problèmes CORS en production.
 * Pas d'auth requise : API publique, appelée dès l'étape 1 de l'onboarding.
 */
export async function GET(request: NextRequest) {

  const q = new URL(request.url).searchParams.get('q')?.replace(/\s/g, '')
  if (!q || q.length < 9) {
    return NextResponse.json({ error: 'SIREN/SIRET invalide (minimum 9 chiffres)' }, { status: 400 })
  }

  // Retry helper with exponential backoff (handles 429 rate-limiting)
  async function fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
    let lastRes: Response | null = null
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 500ms, 1000ms
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AOP-App/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (res.status !== 429) return res
      lastRes = res
    }
    return lastRes!
  }

  try {
    const res = await fetchWithRetry(
      `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&page=1&per_page=1`
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const isRateLimit = res.status === 429
      return NextResponse.json(
        {
          error: isRateLimit
            ? "Limite de requêtes atteinte sur l'annuaire des entreprises. Réessayez dans quelques secondes."
            : `API Annuaire des Entreprises indisponible (HTTP ${res.status})`,
          retryable: isRateLimit,
          detail: body.slice(0, 200),
        },
        { status: isRateLimit ? 429 : 502 }
      )
    }

    const json = await res.json()
    const company = json.results?.[0]
    if (!company) {
      return NextResponse.json({ error: 'Aucune entreprise trouvée pour ce SIREN/SIRET' }, { status: 404 })
    }

    // Mapping forme juridique — fallback n3 → n2 → n1 → code nature_juridique
    const libelleNJ: string = (
      company.libelle_nature_juridique_n3 ||
      company.libelle_nature_juridique_n2 ||
      company.libelle_nature_juridique_n1 ||
      ''
    )
    // Mapping code nature_juridique → forme courte (fiable, complémentaire au libellé)
    const codeNJMap: Record<string, string> = {
      '5710': 'SAS', '5720': 'SASU', '5498': 'SARL', '5499': 'SARL',
      '5308': 'EURL', '5306': 'SARL', '5485': 'EURL',
      '5596': 'SA', '5599': 'SA', '5605': 'SA', '5610': 'SA',
      '5695': 'SNC', '5631': 'SNC',
      '1': 'EI', '1000': 'EI', '1100': 'EI',
      '9220': 'Association', '9221': 'Association', '9222': 'Association',
    }
    const formeMap: Record<string, string> = {
      'société par actions simplifiée unipersonnelle': 'SASU',
      'société par actions simplifiée': 'SAS',
      'société à responsabilité limitée': 'SARL',
      'entreprise unipersonnelle à responsabilité limitée': 'EURL',
      'entrepreneur individuel': 'EI',
      'société anonyme': 'SA',
      'société en nom collectif': 'SNC',
      'association': 'Association',
      'groupement d\'intérêt économique': 'GIE',
    }
    const formeJuridique =
      codeNJMap[String(company.nature_juridique ?? '')] ??
      Object.entries(formeMap).find(([k]) =>
        libelleNJ.toLowerCase().includes(k.toLowerCase())
      )?.[1] ??
      'Autre'

    // Calcul TVA intracommunautaire
    const siren = company.siren ?? q.slice(0, 9)
    const tvaKey = (12 + 3 * (parseInt(siren) % 97)) % 97
    const numeroTva = `FR${String(tvaKey).padStart(2, '0')}${siren}`

    // Conversion tranche effectif → valeur numérique médiane
    const trancheToEffectif: Record<string, number> = {
      '00': 0, '01': 1, '02': 4, '03': 7, '11': 14, '12': 34,
      '21': 74, '22': 149, '31': 224, '32': 374, '41': 749,
      '42': 1499, '51': 3499, '52': 7499, '53': 10000,
    }
    const tranche: string = company.tranche_effectif_salarie ?? ''
    const effectifEstime = trancheToEffectif[tranche] ?? null

    // Représentant légal — premier dirigeant de la liste (si présent)
    const dirigeant = Array.isArray(company.dirigeants) ? company.dirigeants[0] : null
    const dirigeantNom: string | null = dirigeant?.nom ?? null
    const dirigeantPrenom: string | null = dirigeant?.prenom ?? null
    const dirigeantQualite: string | null = dirigeant?.qualite ?? null

    return NextResponse.json({
      nom_complet: company.nom_complet,
      siren: company.siren,
      forme_juridique: formeJuridique,
      code_naf: company.activite_principale,
      libelle_naf: company.libelle_activite_principale ?? null,
      adresse_siege: company.siege?.adresse ?? company.siege?.libelle_voie ?? null,
      code_postal: company.siege?.code_postal ?? null,
      ville: company.siege?.libelle_commune ?? null,
      numero_tva: numeroTva,
      date_creation: company.date_creation ? company.date_creation.substring(0, 10) : null,
      capital_social: company.capital ?? null,
      effectif_estime: effectifEstime,
      tranche_effectif_libelle: company.libelle_tranche_effectif_salarie ?? null,
      dirigeant_nom: dirigeantNom,
      dirigeant_prenom: dirigeantPrenom,
      dirigeant_qualite: dirigeantQualite,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur interne'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
