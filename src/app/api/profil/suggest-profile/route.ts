import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/ai/claude-client'
import { BOAMP_CODES, BOAMP_CATEGORIES } from '@/lib/boamp/codes'

const DOMAINES = [
  'BTP', 'Informatique / IT', 'Conseil', 'Formation', 'Maintenance',
  'Nettoyage', 'Sécurité', 'Transport', 'Restauration', 'Santé',
  'Environnement', 'Communication', 'Juridique', 'Autre',
]

/**
 * POST /api/profil/suggest-profile
 * À partir du texte de positionnement (profil métier), suggère :
 * - les codes BOAMP à cocher
 * - les types de marchés (SERVICES / FOURNITURES / TRAVAUX)
 * - les domaines de compétence
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const positionnement: string = [
    body.activite_metier,
    body.positionnement,
    body.atouts_differenciants,
    body.methodologie_type,
  ].filter(Boolean).join('\n')

  if (!positionnement.trim()) {
    return NextResponse.json(
      { error: 'Aucun positionnement renseigné — complétez l\'onglet Positionnement d\'abord.' },
      { status: 400 }
    )
  }

  // Liste des codes BOAMP disponibles pour le prompt
  const boampList = BOAMP_CODES
    .map(c => `${c.code} | ${c.libelle} | ${c.categorie}`)
    .join('\n')

  const systemPrompt = `Tu es un expert en marchés publics français.
Tu reçois le profil métier d'une société et tu dois identifier :
1. Les codes BOAMP (codes thématiques) les plus pertinents pour cette société parmi la liste fournie
2. Les types de marchés (SERVICES, FOURNITURES, TRAVAUX) — ne sélectionner que ceux vraiment pertinents
3. Les domaines de compétence parmi la liste fournie

Règles STRICTES :
- Ne sélectionner QUE des codes BOAMP de la liste fournie (utilise exactement les codes numériques)
- Pour les codes BOAMP : sélectionner entre 2 et 6 codes maximum — les plus représentatifs, pas tous
- Répondre UNIQUEMENT en JSON valide, sans texte avant ou après`

  const userMessage = `Profil métier de la société :
${positionnement}

Codes BOAMP disponibles (format: code | libellé | catégorie) :
${boampList}

Types de marchés disponibles : SERVICES, FOURNITURES, TRAVAUX

Domaines de compétence disponibles : ${DOMAINES.join(', ')}

Réponds en JSON avec EXACTEMENT ces clés :
{
  "boamp_codes": ["285", "362"],
  "types_marche_filtres": ["SERVICES"],
  "domaines_competence": ["Communication", "Conseil"]
}`

  try {
    const raw = await callClaude(systemPrompt, userMessage, 'haiku')
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    const parsed = JSON.parse(cleaned)

    // Valider et filtrer contre les listes autorisées
    const validBoampCodes = new Set(BOAMP_CODES.map(c => c.code))
    const validTypes = new Set(['SERVICES', 'FOURNITURES', 'TRAVAUX'])
    const validDomaines = new Set(DOMAINES)

    return NextResponse.json({
      boamp_codes: Array.isArray(parsed.boamp_codes)
        ? parsed.boamp_codes.filter((c: unknown) => typeof c === 'string' && validBoampCodes.has(c))
        : [],
      types_marche_filtres: Array.isArray(parsed.types_marche_filtres)
        ? parsed.types_marche_filtres.filter((t: unknown) => typeof t === 'string' && validTypes.has(t))
        : [],
      domaines_competence: Array.isArray(parsed.domaines_competence)
        ? parsed.domaines_competence.filter((d: unknown) => typeof d === 'string' && validDomaines.has(d))
        : [],
    })
  } catch (e) {
    console.error('[suggest-profile] error:', e)
    return NextResponse.json({ error: 'Erreur lors de la suggestion IA' }, { status: 500 })
  }
}
