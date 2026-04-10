/**
 * POST /api/cron/trigger-dce
 *
 * Déclenché par Vercel Cron (toutes les heures, hors nuit).
 * Interroge tender_dce WHERE status='pending' AND url_avis IS NOT NULL,
 * groupe par organisation, et lance un run Apify par batch de max 10.
 *
 * Peut aussi être appelé manuellement :
 *   curl -X POST /api/cron/trigger-dce \
 *     -H "Authorization: Bearer CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"dry_run": true}'   ← pour voir les AO sans déclencher Apify
 *
 * NOTE : fonctionnalité expérimentale — n'affecte pas le reste de l'application.
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

// ─── Config ───────────────────────────────────────────────────────────────────

const APIFY_ACTOR_ID = 'aop-dce-downloader'   // nom de l'acteur sur Apify
const BATCH_SIZE = 10                          // max AO par run Apify
const APIFY_API_BASE = 'https://api.apify.com/v2'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingDceRow {
  tender_idweb: string
  organization_id: string
  tenders: {
    url_profil_acheteur: string | null
  } | null
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Vérification du secret cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Paramètres optionnels
  const body = await request.json().catch(() => ({}))
  const dryRun: boolean = body?.dry_run === true

  // 3. Clés nécessaires
  const apifyToken = process.env.APIFY_API_TOKEN
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const achatpublicUser = process.env.ACHATPUBLIC_USERNAME
  const achatpublicPass = process.env.ACHATPUBLIC_PASSWORD

  if (!apifyToken || !supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Variables d\'environnement manquantes (APIFY_API_TOKEN, SUPABASE_*)' },
      { status: 500 }
    )
  }

  if (!achatpublicUser || !achatpublicPass) {
    return NextResponse.json(
      { error: 'Variables ACHATPUBLIC_USERNAME / ACHATPUBLIC_PASSWORD non configurées' },
      { status: 500 }
    )
  }

  console.log(`[cron/trigger-dce] Démarrage — dry_run=${dryRun}`)

  // 4. Requêter les tender_dce en attente (avec l'url_profil_acheteur du tender associé)
  const { data: pendingRows, error: fetchError } = await adminClient
    .from('tender_dce')
    .select(`
      tender_idweb,
      organization_id,
      tenders!tender_dce_tender_idweb_fkey (
        url_profil_acheteur
      )
    `)
    .eq('status', 'pending')
    .is('apify_run_id', null)          // pas déjà en cours
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE) as { data: PendingDceRow[] | null; error: unknown }

  if (fetchError) {
    console.error('[cron/trigger-dce] Erreur fetch:', fetchError)
    return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 })
  }

  const rows = pendingRows ?? []

  // Filtrer ceux qui ont une url_profil_acheteur achatpublic.com valide
  const eligibleRows = rows.filter(
    r => r.tenders?.url_profil_acheteur && r.tenders.url_profil_acheteur.includes('achatpublic.com')
  )

  console.log(`[cron/trigger-dce] ${eligibleRows.length} AO éligibles (sur ${rows.length} pending)`)

  if (eligibleRows.length === 0) {
    return NextResponse.json({
      message: 'Aucun AO en attente avec une URL achatpublic.com valide',
      pending_total: rows.length,
    })
  }

  // 5. Préparer l'input pour l'acteur Apify
  const tenderInput = eligibleRows.map(r => ({
    idweb: r.tender_idweb,
    url_avis: r.tenders!.url_profil_acheteur!,
    organization_id: r.organization_id,
  }))

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      would_trigger: tenderInput.length,
      tenders: tenderInput,
    })
  }

  // 6. Déclencher le run Apify
  const apifyInput = {
    tenders: tenderInput,
    achatpublic_username: achatpublicUser,
    achatpublic_password: achatpublicPass,
    supabase_url: supabaseUrl,
    supabase_service_key: supabaseServiceKey,
    rate_limit_per_hour: BATCH_SIZE,
  }

  const apifyRes = await fetch(
    `${APIFY_API_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${apifyToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apifyInput),
    }
  )

  if (!apifyRes.ok) {
    const errBody = await apifyRes.text()
    console.error('[cron/trigger-dce] Erreur Apify:', apifyRes.status, errBody)
    return NextResponse.json(
      { error: `Apify API error: ${apifyRes.status}`, details: errBody },
      { status: 500 }
    )
  }

  const apifyData = await apifyRes.json()
  const runId: string = apifyData?.data?.id ?? 'unknown'

  console.log(`[cron/trigger-dce] Run Apify déclenché — runId: ${runId}, ${tenderInput.length} AO`)

  // 7. Marquer les tender_dce comme "en cours" (apify_run_id rempli)
  const idwebs = tenderInput.map(t => t.idweb)
  await adminClient
    .from('tender_dce')
    .update({
      apify_run_id: runId,
      apify_run_at: new Date().toISOString(),
      apify_error: null,
    })
    .in('tender_idweb', idwebs)

  return NextResponse.json({
    success: true,
    run_id: runId,
    triggered_count: tenderInput.length,
    tenders: idwebs,
  })
}
