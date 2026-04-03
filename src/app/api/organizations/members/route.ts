import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'

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
    const { email } = body as { email: string }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400 })
    }

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { org_id: requesterMember.organization_id },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/auth/accept-invite`,
      }
    )

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }

    // If the user was just created by the invite, pre-add them to the org
    if (inviteData?.user) {
      const { data: existingMember } = await adminClient
        .from('organization_members')
        .select('id')
        .eq('user_id', inviteData.user.id)
        .eq('organization_id', requesterMember.organization_id)
        .maybeSingle()

      if (!existingMember) {
        await adminClient.from('organization_members').insert({
          organization_id: requesterMember.organization_id,
          user_id: inviteData.user.id,
          role: 'member',
        })
      }
    }

    return NextResponse.json({ success: true, email }, { status: 201 })
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
    const { memberId, userId: targetUserId } = body as { memberId?: string; userId?: string }

    if (!memberId && !targetUserId) {
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

    if (memberId) {
      targetMemberQuery = targetMemberQuery.eq('id', memberId)
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
