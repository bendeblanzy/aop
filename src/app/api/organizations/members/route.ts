import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'

/**
 * Envoi d'un email de bienvenue via Resend.
 * Si RESEND_API_KEY n'est pas configuré, l'envoi est ignoré silencieusement.
 */
async function sendWelcomeEmail(opts: {
  to: string
  password: string
  type: 'team' | 'beta'
  orgName?: string
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY non configuré' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aop-woad.vercel.app'
  const loginUrl = `${appUrl}/auth/login`

  const subject = opts.type === 'team'
    ? `Votre accès à l'outil AOP${opts.orgName ? ` — ${opts.orgName}` : ''}`
    : 'Votre accès bêta à l\'outil AOP'

  const contextLine = opts.type === 'team'
    ? `Vous avez été ajouté(e) à l'organisation <strong>${opts.orgName ?? 'AOP'}</strong> sur la plateforme de réponse aux appels d'offres.`
    : "Vous avez été invité(e) à tester la plateforme de réponse aux appels d'offres. Vous créerez votre organisation lors de votre première connexion."

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0;">
    <div style="background:#0000FF;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:600;">Votre accès AOP</h1>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;margin:0 0 16px;">${contextLine}</p>
      <div style="background:#f5f5ff;border:1px solid #e0e0ff;border-radius:8px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 12px;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Vos identifiants</p>
        <p style="margin:0 0 8px;font-size:14px;color:#111;"><strong>Email :</strong> <code style="background:#e6e6ff;padding:2px 6px;border-radius:4px;">${opts.to}</code></p>
        <p style="margin:0;font-size:14px;color:#111;"><strong>Mot de passe :</strong> <code style="background:#e6e6ff;padding:2px 6px;border-radius:4px;">${opts.password}</code></p>
      </div>
      <p style="color:#6b7280;font-size:13px;">Pensez à modifier votre mot de passe après la première connexion.</p>
      <a href="${loginUrl}" style="display:inline-block;margin-top:16px;background:#0000FF;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Se connecter →</a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f0f0f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">Cet email a été envoyé automatiquement par la plateforme AOP.</p>
    </div>
  </div>
</body>
</html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: "L'ADN DATA <noreply@ladngroupe.com>",
        to: [opts.to],
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      return { sent: false, error: err }
    }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const orgId = await getOrgIdForUser(user.id)
    if (!orgId) {
      return NextResponse.json({ error: 'Aucune organisation trouvée' }, { status: 404 })
    }

    const { data: members, error: membersError } = await adminClient
      .from('organization_members')
      .select('id, organization_id, user_id, role, created_at')
      .eq('organization_id', orgId)

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 })
    }

    // Enrich members with email from auth.users
    const enriched = await Promise.all(
      (members ?? []).map(async (member) => {
        try {
          const { data: authUser } = await adminClient.auth.admin.getUserById(member.user_id)
          return {
            ...member,
            email: authUser?.user?.email ?? null,
          }
        } catch {
          return { ...member, email: null }
        }
      })
    )

    return NextResponse.json(enriched)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST — Créer un compte directement (sans envoi d'email)
 *
 * Body: { email: string, type: 'team' | 'beta' }
 *   - 'team'  → crée le compte ET l'ajoute à l'organisation de l'admin
 *   - 'beta'  → crée le compte seulement (l'utilisateur créera sa propre org à l'onboarding)
 *
 * Retourne les identifiants (email + mot de passe généré) à partager manuellement.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Check requester's membership and role
    const { data: requesterMember } = await adminClient
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!requesterMember) {
      return NextResponse.json({ error: 'Aucune organisation trouvée' }, { status: 404 })
    }

    if (requesterMember.role !== 'admin') {
      return NextResponse.json({ error: 'Seul un administrateur peut inviter des membres' }, { status: 403 })
    }

    const body = await request.json()
    const { email, type = 'team' } = body as { email: string; type?: 'team' | 'beta' }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400 })
    }

    // Generate a random password (12 chars, mix of letters/numbers)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const password = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

    // Create the user account directly (no email sent)
    // FIX B1: team members join an existing org → no onboarding needed
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip email confirmation
      user_metadata: {
        invited_by: user.id,
        invite_type: type,
        ...(type === 'team' ? { onboarding_completed: true } : {}),
      },
    })

    if (createError) {
      // If user already exists, return a clear message
      if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
        return NextResponse.json({ error: 'Un compte existe déjà avec cette adresse email' }, { status: 409 })
      }
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    // Récupérer le nom de l'organisation pour l'email
    let orgName: string | undefined
    if (type === 'team') {
      const { data: orgData } = await adminClient
        .from('organizations')
        .select('name')
        .eq('id', requesterMember.organization_id)
        .maybeSingle()
      orgName = orgData?.name ?? undefined
    }

    // If type is 'team', add to the admin's organization
    if (type === 'team' && newUser?.user) {
      const { data: existingMember } = await adminClient
        .from('organization_members')
        .select('id')
        .eq('user_id', newUser.user.id)
        .eq('organization_id', requesterMember.organization_id)
        .maybeSingle()

      if (!existingMember) {
        await adminClient.from('organization_members').insert({
          organization_id: requesterMember.organization_id,
          user_id: newUser.user.id,
          role: 'member',
        })
      }
    }

    // Envoi automatique de l'email de bienvenue avec les identifiants
    const emailResult = await sendWelcomeEmail({ to: email, password, type, orgName })

    return NextResponse.json({
      success: true,
      email,
      password,
      type,
      emailSent: emailResult.sent,
      message: type === 'team'
        ? `Compte créé et ajouté à votre organisation${emailResult.sent ? ' — email envoyé' : ''}`
        : `Compte créé${emailResult.sent ? ' — email envoyé au testeur' : ' — le testeur créera sa propre organisation à la connexion'}`,
    }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const body = await request.json()
    const { memberId, member_id, userId: targetUserId } = body as { memberId?: string; member_id?: string; userId?: string }
    const resolvedMemberId = memberId || member_id

    if (!resolvedMemberId && !targetUserId) {
      return NextResponse.json({ error: 'memberId ou userId requis' }, { status: 400 })
    }

    // Get requester's membership and role
    const { data: requesterMember } = await adminClient
      .from('organization_members')
      .select('id, organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!requesterMember) {
      return NextResponse.json({ error: 'Aucune organisation trouvée' }, { status: 404 })
    }

    if (requesterMember.role !== 'admin') {
      return NextResponse.json({ error: 'Seul un administrateur peut retirer des membres' }, { status: 403 })
    }

    // Find the target member record
    let targetMemberQuery = adminClient
      .from('organization_members')
      .select('id, user_id, role')
      .eq('organization_id', requesterMember.organization_id)

    if (resolvedMemberId) {
      targetMemberQuery = targetMemberQuery.eq('id', resolvedMemberId)
    } else if (targetUserId) {
      targetMemberQuery = targetMemberQuery.eq('user_id', targetUserId)
    }

    const { data: targetMember } = await targetMemberQuery.maybeSingle()

    if (!targetMember) {
      return NextResponse.json({ error: 'Membre introuvable dans votre organisation' }, { status: 404 })
    }

    // Prevent removing yourself if you're the last admin
    if (targetMember.user_id === user.id) {
      const { data: admins } = await adminClient
        .from('organization_members')
        .select('id')
        .eq('organization_id', requesterMember.organization_id)
        .eq('role', 'admin')

      if ((admins ?? []).length <= 1) {
        return NextResponse.json(
          { error: 'Impossible de vous retirer : vous êtes le dernier administrateur' },
          { status: 409 }
        )
      }
    }

    const { error: deleteError } = await adminClient
      .from('organization_members')
      .delete()
      .eq('id', targetMember.id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
