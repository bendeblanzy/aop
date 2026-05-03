import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'recovery' | 'signup' | 'magiclink' | null
  const next = searchParams.get('next') ?? '/auth/update-password'

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid_link', request.url))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash, type })

  if (error) {
    return NextResponse.redirect(new URL('/auth/login?error=otp_expired', request.url))
  }

  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/update-password', request.url))
  }

  return NextResponse.redirect(new URL(next, request.url))
}
