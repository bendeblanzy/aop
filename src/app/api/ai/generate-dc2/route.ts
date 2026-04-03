import { createClient } from '@/lib/supabase/server'
import { adminClient, uploadGeneratedDoc, getOrgIdForUser, getOrgProfile } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { generateDC2Docx } from '@/lib/documents/docx-generator'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { ao_id } = await request.json()

  const [{ data: ao }, profile, { data: references }] = await Promise.all([
    adminClient.from('appels_offres').select('*').eq('id', ao_id).eq('organization_id', orgId).single(),
    getOrgProfile(orgId),
    adminClient.from('references').select('*').eq('organization_id', orgId).limit(10),
  ])
  if (!ao) return NextResponse.json({ error: 'AO introuvable' }, { status: 404 })

  const p = profile as any
  const selectedRefs = references?.filter(r => ao.references_selectionnees?.includes(r.id))
    ?? references?.slice(0, 5) ?? []

  const data: Record<string, any> = {
    raison_sociale: p.raison_sociale,
    siret: p.siret,
    forme_juridique: p.forme_juridique,
    date_creation: p.date_creation_entreprise,
    capital_social: p.capital_social,
    adresse_siege: p.adresse_siege,
    code_postal: p.code_postal,
    ville: p.ville,
    numero_tva: p.numero_tva,
    code_naf: p.code_naf,
    representant_prenom: p.prenom_representant,
    representant_nom: p.nom_representant,
    representant_qualite: p.qualite_representant,
    declaration_non_interdiction: p.declaration_non_interdiction,
    declaration_a_jour_fiscal: p.declaration_a_jour_fiscal,
    declaration_a_jour_social: p.declaration_a_jour_social,
    ca_n1: p.ca_annee_n1,
    ca_n2: p.ca_annee_n2,
    ca_n3: p.ca_annee_n3,
    effectif: p.effectif_moyen,
    certifications: Array.isArray(p.certifications) ? p.certifications : (p.certifications ? [String(p.certifications)] : []),
    assurance_rc_numero: p.assurance_rc_numero,
    assurance_rc_compagnie: p.assurance_rc_compagnie,
    assurance_rc_expiration: p.assurance_rc_expiration,
    references_selectionnees: selectedRefs,
    lieu_signature: p.ville,
    date_signature: new Date().toLocaleDateString('fr-FR'),
    acheteur_nom: ao.acheteur || '',
    objet_marche: ao.analyse_rc?.objet || ao.titre,
    lots_candidats: Array.isArray(ao.analyse_rc?.lots)
      ? ao.analyse_rc.lots.map((l: any) => `Lot ${l.numero} — ${l.intitule}`).join(', ')
      : 'Marché global',
  }

  const buffer = await generateDC2Docx(data)
  try {
    const publicUrl = await uploadGeneratedDoc(user.id, ao_id, 'DC2', buffer)
    return NextResponse.json({ url: publicUrl, nom: `DC2-${ao.titre}.docx` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
