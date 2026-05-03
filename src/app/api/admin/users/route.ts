import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

// `SUPER_ADMIN_EMAIL` accepte une liste d'emails séparés par des virgules
// (ou un seul email). Ex : "alice@x.com,bob@y.com" → admins = [alice, bob].
// Cf. bug #21 : permet à un même utilisateur d'avoir plusieurs comptes admin
// (gmail perso + email pro) sans devoir choisir.
const SUPER_ADMIN_EMAILS: string[] = (process.env.SUPER_ADMIN_EMAIL ?? '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

if (SUPER_ADMIN_EMAILS.length === 0) {
  throw new Error('SUPER_ADMIN_EMAIL env variable is required (single email or comma-separated list)')
}

// ── Guard super-admin ─────────────────────────────────────────────────────────

async function checkSuperAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !user.email) return null
  if (!SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) return null
  return { id: user.id, email: user.email }
}

// ── Email de bienvenue ────────────────────────────────────────────────────────
// Le mot de passe est envoyé en clair dans cet email et n'a pas d'expiration
// technique. L'enforcement du changement à la première connexion est assuré par :
//   1. user_metadata.force_password_change = true posé à la création (POST ci-dessous)
//   2. middleware.ts → redirect /parametres?force=1 si flag actif
//   3. parametres/page.tsx → mode force=1 (UI restreinte), clear le flag après succès
// ─────────────────────────────────────────────────────────────────────────────

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

  const contextLine = opts.type === 'team'
    ? `Vous avez été ajouté(e) à l'organisation <strong>${opts.orgName ?? 'AOP'}</strong> sur la plateforme de réponse aux appels d'offres.`
    : "Vous avez été invité(e) à tester la plateforme de réponse aux appels d'offres. Vous créerez votre organisation lors de votre première connexion."

  const html = `<!DOCTYPE html>
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
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 16px;margin:20px 0;">
        <p style="margin:0;font-size:13px;color:#9a3412;line-height:1.5;">
          <strong>⚠ Important — à faire dès votre première connexion</strong><br/>
          Ce mot de passe vous a été transmis par email, il doit être modifié <strong>immédiatement</strong> pour la sécurité de votre compte. Allez dans <strong>Paramètres → Changer le mot de passe</strong>.
        </p>
      </div>
      <a href="${loginUrl}" style="display:inline-block;margin-top:8px;background:#0000FF;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Se connecter →</a>
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
        from: "L'ADN DATA <noreply@ladn.eu>",
        to: [opts.to],
        subject: opts.type === 'team'
          ? `Votre accès à l'outil AOP${opts.orgName ? ` — ${opts.orgName}` : ''}`
          : "Votre accès bêta à l'outil AOP",
        html,
      }),
    })
    if (!res.ok) return { sent: false, error: await res.text() }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  }
}

// ── GET — lister tous les utilisateurs ───────────────────────────────────────

export async function GET() {
  try {
    const admin = await checkSuperAdmin()
    if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    // Récupérer tous les users Supabase Auth
    const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })

    // Récupérer tous les membres d'organisation
    const { data: members } = await adminClient
      .from('organization_members')
      .select('user_id, organization_id, role, created_at')

    // Récupérer toutes les organisations
    const { data: orgs } = await adminClient
      .from('organizations')
      .select('id, name')

    // Maps pour jointure rapide
    const memberMap = new Map((members ?? []).map(m => [m.user_id, m]))
    const orgMap = new Map((orgs ?? []).map(o => [o.id, o.name as string]))

    const result = users.map(u => {
      const member = memberMap.get(u.id)
      return {
        id: u.id,
        email: u.email ?? '',
        created_at: u.created_at,
        org_id: member?.organization_id ?? null,
        org_name: member?.organization_id ? (orgMap.get(member.organization_id) ?? null) : null,
        role: member?.role ?? null,
      }
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Retourner aussi la liste des orgs pour le formulaire de création
    return NextResponse.json({ users: result, orgs: orgs ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur interne' }, { status: 500 })
  }
}

// ── POST — créer un compte ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const admin = await checkSuperAdmin()
    if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const body = await request.json() as { email: string; type?: 'team' | 'beta'; org_id?: string }
    const { email, type = 'beta', org_id } = body

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400 })
    }

    // Générer un mot de passe aléatoire
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const password = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

    // Créer le compte
    // force_password_change: l'enforcement est fait côté middleware (redirect /parametres?force=1)
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        invited_by: admin.id,
        invite_type: type,
        force_password_change: true,
      },
    })

    if (createError) {
      if (createError.message?.includes('already')) {
        return NextResponse.json({ error: 'Un compte existe déjà avec cette adresse email' }, { status: 409 })
      }
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    let orgName: string | undefined

    // Rattacher à une organisation si type = 'team' et org_id fourni
    if (type === 'team' && org_id && newUser?.user) {
      const { data: orgData } = await adminClient
        .from('organizations')
        .select('name')
        .eq('id', org_id)
        .maybeSingle()
      orgName = orgData?.name ?? undefined

      await adminClient.from('organization_members').insert({
        organization_id: org_id,
        user_id: newUser.user.id,
        role: 'member',
      })
    }

    // Envoi email de bienvenue
    const emailResult = await sendWelcomeEmail({ to: email, password, type, orgName })

    return NextResponse.json({
      success: true,
      email,
      password,
      type,
      emailSent: emailResult.sent,
      message: type === 'team'
        ? `Compte créé et rattaché à "${orgName ?? 'l\'organisation'}"${emailResult.sent ? ' — email envoyé' : ''}`
        : `Compte créé${emailResult.sent ? ' — email envoyé' : ''}`,
    }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur interne' }, { status: 500 })
  }
}

// ── DELETE — supprimer un compte ──────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const admin = await checkSuperAdmin()
    if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const { user_id } = await request.json() as { user_id: string }
    if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })

    // Empêcher de se supprimer soi-même
    if (user_id === admin.id) {
      return NextResponse.json({ error: 'Impossible de supprimer votre propre compte' }, { status: 409 })
    }

    const { error } = await adminClient.auth.admin.deleteUser(user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur interne' }, { status: 500 })
  }
}
