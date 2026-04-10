/**
 * POST /api/admin/dce/analyze
 * Analyse les documents DCE uploadés avec Claude :
 *  - Identifie le type de chaque document
 *  - Extrait l'analyse RC si présente
 *  - Met à jour l'AppelOffre et le tender_dce
 */
import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/claude-client'
import { PROMPTS } from '@/lib/ai/prompts'
import { extractText, isSupportedDocument, isImage } from '@/lib/documents/text-extractor'
import { extractFilesFromZip } from '@/lib/documents/zip-extractor'
import { getAuthContext, safeFetch } from '@/lib/api-utils'

interface UploadedFile {
  filename: string
  url: string
  size: number
}

interface DceDocument {
  filename: string
  url: string
  type: string
  label: string
  taille: number
  uploaded_at: string
}

export async function POST(request: NextRequest) {
  try {
    const { user, orgId } = await getAuthContext()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

    const { tender_idweb, ao_id, files } = await request.json() as {
      tender_idweb: string
      ao_id: string
      files: UploadedFile[]
    }

    if (!tender_idweb || !ao_id || !files?.length) {
      return NextResponse.json({ error: 'tender_idweb, ao_id et files sont requis' }, { status: 400 })
    }

    // Vérifier que l'AO appartient bien à cette organisation
    const { data: ao } = await adminClient
      .from('appels_offres')
      .select('id, fichiers_source')
      .eq('id', ao_id)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!ao) return NextResponse.json({ error: 'AO introuvable' }, { status: 404 })

    // Extraire le texte de chaque fichier et construire le prompt combiné
    const docTexts: { filename: string; text: string }[] = []

    for (const file of files) {
      try {
        const res = await safeFetch(file.url)
        if (!res.ok) {
          console.warn(`[dce/analyze] Impossible de télécharger ${file.filename}: ${res.status}`)
          continue
        }
        const buffer = Buffer.from(await res.arrayBuffer())

        // Use unified text extractor that supports all formats
        const text = await extractText(buffer, file.filename)

        if (text && text.trim().length > 20) {
          // Limiter à 40k chars par doc pour ne pas exploser les tokens
          docTexts.push({ filename: file.filename, text: text.slice(0, 40000) })
        }
      } catch (e) {
        console.warn(`[dce/analyze] Erreur extraction ${file.filename}:`, e)
      }
    }

    // Construire le message combiné pour Claude
    let claudeMessage: string
    let analyzeResult: {
      documents: { filename: string; type: string; label: string }[]
      analyse_rc: Record<string, unknown> | null
    } = { documents: [], analyse_rc: null }

    if (docTexts.length > 0) {
      const combined = docTexts
        .map(d => `=== DOCUMENT : ${d.filename} ===\n\n${d.text}`)
        .join('\n\n' + '─'.repeat(60) + '\n\n')

      claudeMessage = `Voici les documents DCE à analyser :\n\n${combined}`

      try {
        const raw = await callClaude(PROMPTS.analyzeDCE, claudeMessage, 'sonnet')
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          analyzeResult = JSON.parse(jsonMatch[0])
        }
      } catch (e) {
        console.error('[dce/analyze] Erreur Claude:', e)
        // On continue même sans analyse IA — les fichiers sont déjà uploadés
      }
    }

    // Construire la liste des DceDocuments avec les types identifiés par Claude
    const docTypeMap: Record<string, { type: string; label: string }> = {}
    for (const d of analyzeResult.documents ?? []) {
      docTypeMap[d.filename] = { type: d.type, label: d.label }
    }

    const uploadedAt = new Date().toISOString()
    const newDocs: DceDocument[] = files.map(f => ({
      filename: f.filename,
      url: f.url,
      type: docTypeMap[f.filename]?.type ?? 'autre',
      label: docTypeMap[f.filename]?.label ?? f.filename,
      taille: f.size,
      uploaded_at: uploadedAt,
    }))

    // Fusionner avec les documents existants (éviter les doublons par filename)
    // Note : ao.fichiers_source est en format FichierSource { nom, url, type, taille }
    // — on le convertit en DceDocument pour uniformiser la déduplication.
    type RawFichierSource = { nom: string; url: string; type: string; taille: number }
    const rawSource: RawFichierSource[] = Array.isArray(ao.fichiers_source) ? ao.fichiers_source : []
    const existingDocs: DceDocument[] = rawSource.map(f => ({
      filename: f.nom,
      url: f.url,
      type: f.type,
      label: f.nom,
      taille: f.taille,
      uploaded_at: '',
    }))
    const existingFilenames = new Set(existingDocs.map(d => d.filename))
    const merged = [
      ...existingDocs,
      ...newDocs.filter(d => !existingFilenames.has(d.filename)),
    ]

    // Convertir au format FichierSource attendu par l'appli
    const fichiers_source = merged.map(d => ({
      nom: d.label ?? d.filename,
      url: d.url,
      type: mapTypeToFichierType(d.type),
      taille: d.taille,
    }))

    // Mettre à jour l'AO
    const aoUpdate: Record<string, unknown> = {
      fichiers_source,
      statut: 'analyse',
      updated_at: new Date().toISOString(),
    }
    if (analyzeResult.analyse_rc) {
      aoUpdate.analyse_rc = analyzeResult.analyse_rc
    }

    const { error: aoError } = await adminClient
      .from('appels_offres')
      .update(aoUpdate)
      .eq('id', ao_id)
      .eq('organization_id', orgId)

    if (aoError) {
      console.error('[dce/analyze] Erreur update AO:', aoError.message)
    }

    // Mettre à jour le tender_dce
    const { error: dceError } = await adminClient
      .from('tender_dce')
      .upsert({
        tender_idweb,
        organization_id: orgId,
        status: 'uploaded',
        documents: merged,
        ao_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tender_idweb,organization_id' })

    if (dceError) {
      console.error('[dce/analyze] Erreur upsert tender_dce:', dceError.message)
    }

    return NextResponse.json({
      success: true,
      ao_id,
      documents: newDocs,
      analyse_rc: analyzeResult.analyse_rc ?? null,
      has_rc: !!analyzeResult.analyse_rc,
    })

  } catch (err) {
    console.error('[dce/analyze] Erreur inattendue:', err)
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Convertit le type DCE en FichierSource.type */
function mapTypeToFichierType(type: string): 'rc' | 'cctp' | 'avis' | 'autre' {
  if (type === 'rc') return 'rc'
  if (type === 'cctp' || type === 'ccap') return 'cctp'
  if (type === 'avis') return 'avis'
  return 'autre'
}
