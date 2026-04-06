/**
 * POST /api/admin/dce/prepare
 * Crée ou récupère l'AppelOffre lié à un tender BOAMP.
 * Retourne { ao_id, is_new }
 */
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { tender_idweb } = await request.json()
  if (!tender_idweb) return NextResponse.json({ error: 'tender_idweb required' }, { status: 400 })

  // Vérifier si un AO existe déjà pour ce tender dans cette organisation
  const { data: existingAO } = await adminClient
    .from('appels_offres')
    .select('id')
    .eq('organization_id', orgId)
    .eq('tender_idweb', tender_idweb)
    .maybeSingle()

  if (existingAO) {
    return NextResponse.json({ ao_id: existingAO.id, is_new: false })
  }

  // Récupérer les données du tender pour pré-remplir l'AO
  const { data: tender } = await adminClient
    .from('tenders')
    .select('objet, nomacheteur, datelimitereponse, idweb, url_avis, url_profil_acheteur')
    .eq('idweb', tender_idweb)
    .maybeSingle()

  // Créer un nouvel AO à partir du tender
  const { data: newAO, error } = await adminClient
    .from('appels_offres')
    .insert({
      organization_id: orgId,
      titre: tender?.objet ?? `AO ${tender_idweb}`,
      acheteur: tender?.nomacheteur ?? null,
      date_limite_reponse: tender?.datelimitereponse ?? null,
      statut: 'brouillon',
      tender_idweb,
      url_avis: tender?.url_avis ?? null,
      url_profil_acheteur: tender?.url_profil_acheteur ?? null,
      fichiers_source: [],
    })
    .select('id')
    .single()

  if (error) {
    console.error('[dce/prepare] Error creating AO:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ao_id: newAO.id, is_new: true })
}
