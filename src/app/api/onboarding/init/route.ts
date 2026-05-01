import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

/**
 * POST /api/onboarding/init
 * Crée l'organisation + un profil vide dès la 1ère étape du wizard.
 * Idempotent : si l'org existe déjà, retourne son ID sans rien créer.
 *
 * Cas spécial : si le SIRET est déjà enregistré par une autre org,
 * retourne { error: 'SIRET_ALREADY_REGISTERED', admin_email } avec status 409
 * pour inviter l'utilisateur à rejoindre l'équipe existante.
 *
 * Body: { org_name, raison_sociale, nom_commercial?, siret?, ...siret_data }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const {
    org_name,
    raison_sociale,
    nom_commercial,
    siret,
    forme_juridique,
    code_naf,
    adresse_siege,
    code_postal,
    ville,
    region,
    capital_social,
    effectif_moyen,
    date_creation_entreprise,
    numero_tva,
    civilite_representant,
    prenom_representant,
    nom_representant,
    qualite_representant,
    email_representant,
    telephone_representant,
  } = body

  if (!org_name?.trim() || !raison_sociale?.trim()) {
    return NextResponse.json({ error: 'org_name et raison_sociale sont requis' }, { status: 400 })
  }

  // ── Vérifier si le SIRET est déjà pris par une autre org ─────────────────
  if (siret) {
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('organization_id')
      .eq('siret', siret)
      .maybeSingle()

    if (existingProfile) {
      // Vérifier si l'utilisateur est déjà membre de cette org
      const { data: alreadyMember } = await adminClient
        .from('organization_members')
        .select('organization_id')
        .eq('organization_id', existingProfile.organization_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!alreadyMember) {
        // Récupérer l'email de l'admin de l'org existante
        const { data: adminMember } = await adminClient
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', existingProfile.organization_id)
          .eq('role', 'admin')
          .maybeSingle()

        let adminEmail: string | null = null
        if (adminMember) {
          const { data: adminUser } = await adminClient.auth.admin.getUserById(adminMember.user_id)
          adminEmail = adminUser?.user?.email ?? null
        }

        return NextResponse.json({
          error: 'SIRET_ALREADY_REGISTERED',
          admin_email: adminEmail,
        }, { status: 409 })
      }

      // L'utilisateur est déjà membre → on retourne simplement l'orgId
      return NextResponse.json({ success: true, org_id: existingProfile.organization_id })
    }
  }

  // ── Vérifier si l'utilisateur a déjà une org ──────────────────────────────
  const { data: existing } = await adminClient
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let orgId: string

  if (existing) {
    orgId = existing.organization_id
  } else {
    // Créer l'organisation
    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .insert({ name: org_name.trim() })
      .select('id')
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: orgError?.message ?? 'Erreur création org' }, { status: 500 })
    }

    orgId = org.id

    await adminClient.from('organization_members').insert({
      organization_id: orgId,
      user_id: user.id,
      role: 'admin',
    })
  }

  // ── Upsert du profil ──────────────────────────────────────────────────────
  const profilePayload: Record<string, unknown> = {
    organization_id: orgId,
    raison_sociale: raison_sociale.trim(),
  }

  if (nom_commercial) profilePayload.nom_commercial = nom_commercial
  if (siret) profilePayload.siret = siret
  if (forme_juridique) profilePayload.forme_juridique = forme_juridique
  if (code_naf) profilePayload.code_naf = code_naf
  if (adresse_siege) profilePayload.adresse_siege = adresse_siege
  if (code_postal) profilePayload.code_postal = code_postal
  if (ville) profilePayload.ville = ville
  if (region) profilePayload.region = region
  if (capital_social) profilePayload.capital_social = capital_social
  if (effectif_moyen) profilePayload.effectif_moyen = effectif_moyen
  if (date_creation_entreprise) profilePayload.date_creation_entreprise = date_creation_entreprise
  if (numero_tva) profilePayload.numero_tva = numero_tva
  if (civilite_representant) profilePayload.civilite_representant = civilite_representant
  if (prenom_representant) profilePayload.prenom_representant = prenom_representant
  if (nom_representant) profilePayload.nom_representant = nom_representant
  if (qualite_representant) profilePayload.qualite_representant = qualite_representant
  if (email_representant) profilePayload.email_representant = email_representant
  if (telephone_representant) profilePayload.telephone_representant = telephone_representant

  // Upsert — gère le cas où le profil existe déjà pour cette org (double-submit, etc.)
  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'organization_id', ignoreDuplicates: false })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, org_id: orgId })
}
