import { createClient } from '@/lib/supabase/server'
import { adminClient, uploadGeneratedDoc, getOrFallbackProfile } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { generateDC1Docx } from '@/lib/documents/docx-generator'

const DC1_PROMPT = `Tu es un expert en marchés publics français. À partir des données fournies, génère les champs du formulaire DC1 officiel.

Retourne UNIQUEMENT un JSON valide avec ces champs exacts :
{
  "acheteur_nom": "nom complet de l'acheteur public",
  "acheteur_adresse": "adresse complète de l'acheteur",
  "objet_marche": "objet précis du marché",
  "reference_marche": "référence ou numéro du marché",
  "lots_candidats": "lot(s) pour lesquels le candidat soumissionne",
  "raison_sociale": "dénomination sociale du candidat",
  "siret": "numéro SIRET du candidat",
  "forme_juridique": "forme juridique",
  "adresse_siege": "adresse du siège social",
  "code_postal": "code postal",
  "ville": "ville",
  "numero_tva": "numéro TVA intracommunautaire si disponible",
  "representant_civilite": "M. ou Mme",
  "representant_nom": "nom du représentant",
  "representant_prenom": "prénom du représentant",
  "representant_qualite": "fonction/qualité du représentant",
  "groupement": "non",
  "type_groupement": "",
  "mandataire": "",
  "lieu_signature": "ville de signature",
  "date_signature": "date du jour au format JJ/MM/AAAA"
}

Utilise toutes les données disponibles. Pour les champs manquants, mets une chaîne vide "".`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ao_id } = await request.json()

  const [{ data: ao }, profile] = await Promise.all([
    adminClient.from('appels_offres').select('*').eq('id', ao_id).eq('profile_id', user.id).single(),
    getOrFallbackProfile(user.id),
  ])
  if (!ao) return NextResponse.json({ error: 'AO introuvable' }, { status: 404 })

  const userMsg = `
Profil entreprise : ${JSON.stringify(profile)}
Analyse RC : ${JSON.stringify(ao.analyse_rc || {})}
Titre AO : ${ao.titre}
Acheteur : ${ao.acheteur || ''}
Référence : ${ao.reference_marche || ''}
`

  let data: Record<string, string> = {}
  try {
    const raw = await callClaude(DC1_PROMPT, userMsg, 'haiku')
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) data = JSON.parse(m[0])
  } catch (e) {
    console.error('[generate-dc1] Claude error:', e)
  }

  // Fallback : utiliser directement les données du profil
  const p = profile as any
  const merged: Record<string, string> = {
    acheteur_nom: data.acheteur_nom || ao.acheteur || '',
    acheteur_adresse: data.acheteur_adresse || '',
    objet_marche: data.objet_marche || ao.analyse_rc?.objet || ao.titre,
    reference_marche: data.reference_marche || ao.reference_marche || '',
    lots_candidats: data.lots_candidats || 'Marché global',
    raison_sociale: p.raison_sociale || '',
    siret: p.siret || '',
    forme_juridique: p.forme_juridique || '',
    adresse_siege: p.adresse_siege || '',
    code_postal: p.code_postal || '',
    ville: p.ville || '',
    numero_tva: p.numero_tva || '',
    representant_civilite: p.civilite_representant || 'M.',
    representant_nom: p.nom_representant || '',
    representant_prenom: p.prenom_representant || '',
    representant_qualite: p.qualite_representant || '',
    groupement: 'non',
    type_groupement: '',
    mandataire: '',
    lieu_signature: p.ville || '',
    date_signature: new Date().toLocaleDateString('fr-FR'),
  }

  const buffer = await generateDC1Docx(merged)
  try {
    const publicUrl = await uploadGeneratedDoc(user.id, ao_id, 'DC1', buffer)
    return NextResponse.json({ url: publicUrl, nom: `DC1-${ao.titre}.docx` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
