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

  const publicPaths = [
    '/auth/login', '/auth/register', '/auth/reset-password',
    '/auth/callback', '/auth/confirm', '/auth/update-password', '/auth/accept-invite',
    '/onboarding',
    '/api/cron/', '/api/onboarding/',
    // /api/profil/siret : simple passthrough vers data.gouv.fr (recherche-entreprises),
    // appelé dès la step 1 du wizard. Sans cette whitelist, un cookie de session
    // absent provoque un 307 → /auth/login renvoyant du HTML, que le client
    // tente de parser comme JSON, d'où l'erreur :
    // "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"
    // (fix initialement dans le commit 29f4541, perdu lors d'un merge — restauré).
    '/api/profil/siret',
  ]
  const isPublicPath = publicPaths.some(p => request.nextUrl.pathname.startsWith(p))

  // Non authentifié → login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  if (user) {
    // Redirection racine → dashboard
    if (request.nextUrl.pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    // Force password change
    const forceChange = user.user_metadata?.force_password_change === true
    const onParametres = request.nextUrl.pathname.startsWith('/parametres')
    if (forceChange && !onParametres && !request.nextUrl.pathname.startsWith('/api/')) {
      const url = request.nextUrl.clone()
      url.pathname = '/parametres'
      url.searchParams.set('force', '1')
      return NextResponse.redirect(url)
    }

    // Onboarding obligatoire — sauf si déjà fait ou chemin public
    // Le flag onboarding_completed est stocké dans user_metadata (pas de DB query)
    const onboardingDone = user.user_metadata?.onboarding_completed === true
    const onOnboarding = request.nextUrl.pathname.startsWith('/onboarding')
    const isApiPath = request.nextUrl.pathname.startsWith('/api/')
    const isAuthPath = request.nextUrl.pathname.startsWith('/auth/')

    if (!onboardingDone && !onOnboarding && !isApiPath && !forceChange && !isAuthPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
