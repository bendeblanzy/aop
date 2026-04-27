import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const publicPaths = ['/auth/login', '/auth/register', '/auth/reset-password', '/auth/callback', '/auth/accept-invite', '/onboarding', '/api/cron/']
  const isPublicPath = publicPaths.some(p => request.nextUrl.pathname.startsWith(p))

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  if (user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Force password change at first login (compte créé via /api/admin/users)
  // Le flag est posé dans user_metadata.force_password_change à la création
  // et nettoyé après un updateUser({ password }) côté /parametres?force=1.
  if (user && !isPublicPath) {
    const forceChange = user.user_metadata?.force_password_change === true
    const onParametres = request.nextUrl.pathname.startsWith('/parametres')
    if (forceChange && !onParametres) {
      const url = request.nextUrl.clone()
      url.pathname = '/parametres'
      url.searchParams.set('force', '1')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}


export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
