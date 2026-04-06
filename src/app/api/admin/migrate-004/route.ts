import { NextResponse } from 'next/server'

// Migration 004 a été exécutée directement dans Supabase SQL Editor.
// Cette route est conservée pour mémoire uniquement.
export async function GET() {
  return NextResponse.json({ status: 'Migration 004 already applied via Supabase SQL Editor' })
}
