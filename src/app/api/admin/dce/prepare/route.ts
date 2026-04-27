/** @deprecated */
import { NextResponse } from 'next/server'
export async function POST() { return NextResponse.json({ error: 'Endpoint déprécié' }, { status: 410 }) }
