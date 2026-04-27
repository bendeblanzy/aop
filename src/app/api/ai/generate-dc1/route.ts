/** @deprecated Endpoint retiré — fonctionnalité réponse aux AO supprimée. À supprimer manuellement (rm). */
import { NextResponse } from 'next/server'
export async function POST() {
  return NextResponse.json({ error: 'Endpoint déprécié — fonctionnalité réponse retirée' }, { status: 410 })
}

