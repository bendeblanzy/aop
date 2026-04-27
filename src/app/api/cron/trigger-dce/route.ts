/** @deprecated Cron Apify DCE retiré (lié à la fonctionnalité réponse). */
import { NextResponse } from 'next/server'
export async function POST() { return NextResponse.json({ ok: true, deprecated: true }) }
export async function GET()  { return NextResponse.json({ ok: true, deprecated: true }) }
