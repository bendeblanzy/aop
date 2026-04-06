import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/ai/claude-client'
import { extractTextFromDocx } from '@/lib/documents/docx-parser'

// ── Types ──────────────────────────────────────────────────────────────────

type FileEntry = { nom: string; url: string; type: string; taille: number }

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string }; title?: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function getMediaType(filename: string): string | null {
  const ext = filename.toLowerCase().split('.').pop()
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  return map[ext ?? ''] ?? null
}

function isImage(filename: string): boolean {
  return getMediaType(filename) !== null
}

function isPDF(filename: string): boolean {
  return filename.toLowerCase().endsWith('.pdf')
}

function isExcel(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop()
  return ext === 'xlsx' || ext === 'xls'
}

function isWord(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop()
  return ext === 'docx' || ext === 'doc'
}

async function excelToText(buffer: Buffer): Promise<string> {
  // Dynamically import xlsx to avoid SSR issues
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const lines: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet, { skipHidden: true })
    if (csv.trim()) {
      lines.push(`=== Feuille : ${sheetName} ===`)
      lines.push(csv)
    }
  }
  return lines.join('\n\n')
}

async function fileToContentBlock(file: FileEntry): Promise<ContentBlock | null> {
  let res: Response
  try {
    res = await fetch(file.url)
    if (!res.ok) return null
  } catch {
    return null
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length === 0) return null

  const name = file.nom

  // PDF → document natif Claude
  if (isPDF(name)) {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
      title: name,
    }
  }

  // Image → bloc image natif Claude
  if (isImage(name)) {
    const mediaType = getMediaType(name)!
    return {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
    }
  }

  // Excel → conversion CSV puis texte
  if (isExcel(name)) {
    try {
      const csv = await excelToText(buffer)
      if (!csv.trim()) return null
      return { type: 'text', text: `[Fichier Excel : ${name}]\n\n${csv}` }
    } catch {
      return null
    }
  }

  // DOCX / DOC → extraction texte
  if (isWord(name)) {
    try {
      const text = await extractTextFromDocx(buffer)
      if (!text?.trim()) return null
      return { type: 'text', text: `[Fichier Word : ${name}]\n\n${text}` }
    } catch {
      return null
    }
  }

  return null
}

// ── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un expert en marchés publics français. Tu reçois l'ensemble des documents d'un Dossier de Consultation des Entreprises (DCE).

Analyse tous les documents fournis et extrais une analyse complète et structurée au format JSON.

Retourne UN SEUL objet JSON avec les clés suivantes :

{
  "objet": "objet précis du marché",
  "acheteur": "nom de l'acheteur public",
  "lots": [{"numero": "1", "intitule": "...", "montant_estime": 50000}],
  "criteres_notation": [{"critere": "Prix", "ponderation_pourcentage": 40}],
  "pieces_exigees": [{"piece": "DC1", "detail": "Lettre de candidature"}],
  "delai_reponse": "date et heure limites",
  "duree_marche": "durée du marché",
  "clauses_eliminatoires": ["..."],
  "forme_groupement": "groupement autorisé/exigé",
  "variantes": "oui/non + détails",
  "visite_obligatoire": "oui/non + détails",
  "prestations_attendues": "description synthétique des prestations attendues",
  "normes_exigees": ["ISO 9001", "..."],
  "certifications_requises": ["..."],
  "moyens_humains_exiges": "profils et qualifications requis",
  "moyens_techniques_exiges": "équipements et outils requis",
  "contraintes_techniques": "contraintes particulières",
  "planning_prevu": "jalons et délais",
  "penalites": "pénalités de retard ou non-conformité",
  "livrables": ["..."],
  "clauses_contractuelles_cles": "obligations contractuelles importantes, conditions de paiement",
  "criteres_rse": "critères RSE / développement durable valorisés par l'acheteur",
  "risques_identifies": ["clause ou exigence à risque pour le candidat"],
  "decision_go_nogo": "GO ou NO-GO avec justification courte"
}

Règles :
- Analyse TOUS les documents fournis, pas seulement le RC
- Si une information n'est pas trouvée, mets null
- Les tableaux vides sont autorisés
- Réponds UNIQUEMENT en JSON valide, sans commentaires ni balises markdown`

// ── Route ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgId = await getOrgIdForUser(user.id)
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

    const { ao_id, files } = await request.json() as { ao_id: string; files: FileEntry[] }
    if (!ao_id || !files?.length) {
      return NextResponse.json({ error: 'ao_id et files sont requis' }, { status: 400 })
    }

    console.log(`[analyze-dce] ${files.length} fichier(s) pour AO ${ao_id}`)

    // Convertir chaque fichier en bloc Claude
    const blocks: ContentBlock[] = []
    const skipped: string[] = []

    for (const file of files) {
      const block = await fileToContentBlock(file)
      if (block) {
        blocks.push(block)
        console.log(`[analyze-dce] ✓ ${file.nom} (${file.type})`)
      } else {
        skipped.push(file.nom)
        console.warn(`[analyze-dce] ✗ ${file.nom} — impossible à traiter`)
      }
    }

    if (blocks.length === 0) {
      return NextResponse.json({ error: 'Aucun document exploitable. Vérifiez les fichiers uploadés.' }, { status: 400 })
    }

    // Appel Claude avec tous les blocs
    console.log(`[analyze-dce] Envoi de ${blocks.length} bloc(s) à Claude`)
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          ...blocks as Parameters<typeof anthropic.messages.create>[0]['messages'][0]['content'] extends (infer T)[] ? T[] : never,
          {
            type: 'text' as const,
            text: `Analyse l'ensemble de ces ${blocks.length} document(s) de DCE et retourne le JSON structuré demandé.${skipped.length ? ` (${skipped.length} fichier(s) non lisibles ignorés : ${skipped.join(', ')})` : ''}`,
          },
        ],
      }],
    })

    const rawText = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[analyze-dce] Pas de JSON dans la réponse:', rawText.slice(0, 300))
      return NextResponse.json({ error: 'La réponse IA ne contient pas de données exploitables. Réessayez.' }, { status: 500 })
    }

    let analyse: object
    try {
      analyse = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Impossible de parser la réponse IA.' }, { status: 500 })
    }

    // Sauvegarder en base — on alimente analyse_rc et analyse_cctp pour la compatibilité
    await adminClient.from('appels_offres').update({
      analyse_rc: analyse,
      analyse_cctp: analyse,
    }).eq('id', ao_id).eq('organization_id', orgId)

    console.log(`[analyze-dce] Analyse sauvegardée, ${skipped.length} fichier(s) ignoré(s)`)

    return NextResponse.json({ analyse, skipped })

  } catch (err) {
    console.error('[analyze-dce] Erreur inattendue:', err)
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: `Erreur inattendue : ${message}` }, { status: 500 })
  }
}
