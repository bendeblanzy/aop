/** @deprecated Admin DCE retiré (lié à la fonctionnalité réponse). */
import { NextResponse } from 'next/server'
export async function GET()  { return NextResponse.json({ error: 'Endpoint déprécié' }, { status: 410 }) }
export async function POST() { return NextResponse.json({ error: 'Endpoint déprécié' }, { status: 410 }) }
