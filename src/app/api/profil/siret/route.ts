import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/profil/siret?q=<siren_or_siret>
 * Recherche une entreprise via l'Annuaire des Entreprises (data.gouv.fr)
 * et retourne les champs normalisés pour pré-remplir le profil.
 * Exécuté côté serveur pour éviter les problèmes CORS en production.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(request.url).searchParams.get('q')?.replace(/\s/g, '')
  if (!q || q.length < 9) {
    return NextResponse.json({ error: 'SIREN/SIRET invalide (minimum 9 chiffres)' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&page=1&per_page=1`,
      { headers: { 'User-Agent': 'AOP-App/1.0' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) {
      return NextResponse.json({ error: 'API Annuaire des Entreprises indisponible' }, { status: 502 })
    }

    const json = await res.json()
    const company = json.results?.[0]
    if (!company) {
      return NextResponse.json({ error: 'Aucune entreprise trouvée pour ce SIREN/SIRET' }, { status: 404 })
    }

    // Mapping forme juridique
    const libelleNJ: string = company.libelle_nature_juridique_n3 ?? ''
    const formeMap: Record<string, string> = {
      'société à responsabilité limitée': 'SARL',
      'société par actions simplifiée unipersonnelle': 'SASU',
      'société par actions simplifiée': 'SAS',
      'société anonyme': 'SA',
      'entreprise unipersonnelle à responsabilité limitée': 'EURL',
      'entrepreneur individuel': 'EI',
      'société en nom collectif': 'SNC',
      'association': 'Association',
    }
    const formeJuridique = Object.entries(formeMap).find(([k]) =>
      libelleNJ.toLowerCase().includes(k.toLowerCase())
    )?.[1] ?? 'Autre'

    // Calcul TVA intracommunautaire
    const siren = company.siren ?? q.slice(0, 9)
    const tvaKey = (12 + 3 * (parseInt(siren) % 97)) % 97
    const numeroTva = `FR${String(tvaKey).padStart(2, '0')}${siren}`

    return NextResponse.json({
      nom_complet: company.nom_complet,
      siren: company.siren,
      forme_juridique: formeJuridique,
      code_naf: company.activite_principale,
      adresse_siege: company.siege?.adresse ?? company.siege?.libelle_voie ?? null,
      code_postal: company.siege?.code_postal ?? null,
      ville: company.siege?.libelle_commune ?? null,
      numero_tva: numeroTva,
      date_creation: company.date_creation ? company.date_creation.substring(0, 10) : null,
      effectif: company.tranche_effectif_salarie ?? null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur interne'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
