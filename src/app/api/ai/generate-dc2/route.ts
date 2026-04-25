import { createClient } from '@/lib/supabase/server'
import { adminClient, uploadGeneratedDoc, getOrgIdForUser, getOrgProfile } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { generateDC2Docx } from '@/lib/documents/docx-generator'

// DC2 = Déclaration du candidat individuel ou du membre du groupement
// Contenu : identification administrative, CAPACITÉS FINANCIÈRES (CA sur 3 ans, effectifs),
// déclarations légales (non-interdiction, à jour fiscal/social), assurances,
// références de marchés similaires, et présentation synthétique de l'agence.
// Ce document PROUVE LA CAPACITÉ à exécuter le marché — il diffère du DC1 qui identifie simplement le candidat.

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { ao_id } = await request.json()

  // Charger l'AO, le profil, les références ET les collaborateurs
  const [{ data: ao }, profile, { data: references }, { data: collaborateurs }] = await Promise.all([
    adminClient.from('appels_offres').select('*').eq('id', ao_id).eq('organization_id', orgId).single(),
    getOrgProfile(orgId),
    adminClient.from('references').select('*').eq('organization_id', orgId).limit(10),
    adminClient
      .from('collaborateurs')
      .select('nom, prenom, poste, role_metier, competences_cles, experience_annees')
      .eq('organization_id', orgId)
      .limit(20),
  ])
  if (!ao) return NextResponse.json({ error: 'AO introuvable' }, { status: 404 })

  const p = profile as any

  // Sélectionner les références pertinentes pour ce marché
  const selectedRefs = references?.filter(r => ao.references_selectionnees?.includes(r.id))
    ?? references?.slice(0, 5) ?? []

  // ── Bloc "Présentation de l'agence" ──
  // Construit à partir du positionnement, des atouts différenciants et de l'équipe
  const presentationParts: string[] = []
  if (p.positionnement) {
    presentationParts.push(p.positionnement)
  }
  if (p.atouts_differenciants) {
    presentationParts.push(`Atouts différenciants : ${p.atouts_differenciants}`)
  }
  if (p.activite_metier) {
    presentationParts.push(`Activité principale : ${p.activite_metier}`)
  }
  if (p.domaines_competence?.length) {
    presentationParts.push(`Domaines d'expertise : ${p.domaines_competence.join(', ')}`)
  }
  if (p.certifications?.length) {
    presentationParts.push(`Certifications : ${p.certifications.join(', ')}`)
  }
  const presentation_agence = presentationParts.join('\n\n') || ''

  // ── Bloc "Équipe" — liste structurée des collaborateurs ──
  // Format: objets {nom, role} pour un affichage propre dans le tableau DC2
  const equipe_membres = (collaborateurs ?? []).map((c: any) => {
    const nom = `${c.prenom || ''} ${c.nom || ''}`.trim()
    // Poste : on préfère role_metier (plus court) ou poste, mais pas les deux si identiques
    const poste = c.poste || c.role_metier || ''
    // Compétences : limiter aux 3 premières pour ne pas surcharger le tableau
    const competences = c.competences_cles
      ? c.competences_cles.split(',').slice(0, 3).map((s: string) => s.trim()).join(', ')
      : ''
    const experience = c.experience_annees ? `${c.experience_annees} ans` : ''
    const role = [poste, competences, experience].filter(Boolean).join(' · ')
    return { nom, role }
  })

  const data: Record<string, any> = {
    // ── Identification administrative ──
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

    // ── Capacités financières (cœur du DC2) ──
    ca_n1: p.ca_annee_n1,
    ca_n2: p.ca_annee_n2,
    ca_n3: p.ca_annee_n3,
    marge_brute: p.marge_brute,
    effectif: p.effectif_moyen,

    // ── Déclarations légales ──
    declaration_non_interdiction: p.declaration_non_interdiction,
    declaration_a_jour_fiscal: p.declaration_a_jour_fiscal,
    declaration_a_jour_social: p.declaration_a_jour_social,

    // ── Assurances ──
    certifications: Array.isArray(p.certifications) ? p.certifications : (p.certifications ? [String(p.certifications)] : []),
    assurance_rc_numero: p.assurance_rc_numero,
    assurance_rc_compagnie: p.assurance_rc_compagnie,
    assurance_rc_expiration: p.assurance_rc_expiration,

    // ── Références de marchés similaires ──
    references_selectionnees: selectedRefs,

    // ── Présentation agence (bloc différenciateur) ──
    presentation_agence,
    equipe_membres,
    nb_collaborateurs: (collaborateurs ?? []).length,

    // ── Marché concerné ──
    acheteur_nom: ao.acheteur || '',
    objet_marche: ao.analyse_rc?.objet || ao.titre,
    lots_candidats: Array.isArray(ao.analyse_rc?.lots)
      ? ao.analyse_rc.lots.map((l: any) => `Lot ${l.numero} — ${l.intitule}`).join(', ')
      : 'Marché global',

    // ── Signature ──
    lieu_signature: p.ville,
    date_signature: new Date().toLocaleDateString('fr-FR'),
  }

  const buffer = await generateDC2Docx(data)
  try {
    const publicUrl = await uploadGeneratedDoc(orgId, ao_id, 'DC2', buffer)
    return NextResponse.json({ url: publicUrl, nom: `DC2-${ao.titre}.docx` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
