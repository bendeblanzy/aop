/**
 * Synthesizer — agrège les sources brutes (LinkedIn + site web + recherche web)
 * via Claude Sonnet et produit un EnrichmentContext structuré.
 *
 * Règle hiérarchique de confiance (cf. discussion produit) :
 *   1. Site web officiel  (autorité maximale, info validée par l'entreprise)
 *   2. LinkedIn           (officielle mais parfois marketing)
 *   3. Recherche web      (corrobore, peut détecter ce qui manque)
 *
 * En cas de conflit, le synthesizer priorise dans cet ordre et flag le conflit
 * dans `notes`. Si une source manque, on génère quand même un contexte avec ce
 * qu'on a (et confidence ajustée à la baisse).
 */

import { callClaudeDetailed } from '@/lib/ai/claude-client'
import type {
  EnrichmentContext,
  RawLinkedInData,
  RawWebsiteData,
  RawWebSearchData,
  EnrichmentSources,
} from './types'

interface SynthesisInput {
  raisonSociale: string
  codeNaf?: string
  forme_juridique?: string
  effectif_moyen?: number | null
  ville?: string
  linkedin?: RawLinkedInData | null
  website?: RawWebsiteData | null
  webSearch?: RawWebSearchData | null
}

const SYSTEM_PROMPT = `Tu es un consultant senior expert en stratégie et en réponse aux marchés publics français.

Tu reçois des données brutes sur une entreprise issues de 3 sources :
- LinkedIn (page entreprise officielle)
- Site web officiel
- Recherche web tierce (articles, communiqués, annuaires)

Tu dois produire un OBJET JSON unique consolidant ces sources en suivant cette HIÉRARCHIE de confiance :
  1. Site web officiel = vérité prioritaire (l'entreprise s'auto-décrit)
  2. LinkedIn = complément officiel
  3. Recherche web = corrobore + comble les trous

RÈGLES STRICTES :
- Tu ne dois RIEN inventer. Si une info ne ressort d'AUCUNE source, mets le champ à null/[].
- En cas de conflit entre sources, garde l'info du site officiel et signale le conflit dans \`notes\`.
- Pour les listes (clients_types, exclusions_metier…), ne mets que des éléments concrets, pas de catégories génériques.
- Le champ \`exclusions_metier\` est crucial pour le scoring : liste explicitement ce que l'entreprise NE FAIT PAS si elle l'indique ("nous ne faisons pas de BTP", "spécialisés UNIQUEMENT en…").
- Le champ \`signaux_specificite\` doit contenir des éléments factuels et concrets ("12 ans d'expérience", "bureaux à Paris et Lyon", "équipe certifiée Qualiopi"…), pas du marketing creux.
- Le champ \`tone_of_voice\` doit être 1 expression courte (ex: "expert/technique", "engagé/humaniste", "moderne/start-up").
- \`confidence\` (0-100) reflète la richesse + cohérence des sources : 3 sources cohérentes = 90+, 1 seule source = 40, conflits non résolus = -10.

Tu DOIS répondre UNIQUEMENT par un objet JSON valide, sans aucun texte avant ni après, sans backticks markdown.

Format JSON exact :
{
  "specialite_principale": "1 phrase claire (Nous concevons et déployons…) ou null",
  "sous_specialites": ["..."],
  "clients_types": ["Mairies", "Régions", ...],
  "taille_equipe": "5-10" | "20-50" | "100+" | null,
  "anciennete_annees": 12 | null,
  "zone_intervention": "National" | "Île-de-France" | ... | null,
  "exclusions_metier": ["BTP", "Fournitures matérielles"],
  "outils_technologies": ["Figma", "Notion"],
  "references_publiques": [
    {"titre": "...", "client": "...", "annee": 2024, "url": "...", "description": "..."}
  ],
  "tone_of_voice": "expert/technique" | null,
  "certifications_inferees": ["Qualiopi", "ISO 9001"],
  "positionnement_resume": "Paragraphe 200-400 caractères ou null",
  "signaux_specificite": ["12 ans d'ancienneté", "bureaux à Paris et Lyon"],
  "confidence": 75,
  "notes": "Site web inaccessible — données partielles" | null
}`

function buildUserMessage(input: SynthesisInput): string {
  const parts: string[] = []
  parts.push(`# Entreprise cible`)
  parts.push(`Raison sociale : ${input.raisonSociale}`)
  if (input.codeNaf) parts.push(`Code NAF : ${input.codeNaf}`)
  if (input.forme_juridique) parts.push(`Forme juridique : ${input.forme_juridique}`)
  if (input.effectif_moyen) parts.push(`Effectif déclaré (INSEE) : ${input.effectif_moyen}`)
  if (input.ville) parts.push(`Ville : ${input.ville}`)

  parts.push(`\n# Source 1 : LinkedIn (page officielle)`)
  if (input.linkedin) {
    parts.push(JSON.stringify(input.linkedin, null, 2))
  } else {
    parts.push('(non disponible — pas d\'URL fournie ou scrape échoué)')
  }

  parts.push(`\n# Source 2 : Site web officiel`)
  if (input.website) {
    parts.push(`URL : ${input.website.url}`)
    if (input.website.title) parts.push(`Title : ${input.website.title}`)
    if (input.website.description) parts.push(`Meta description : ${input.website.description}`)
    parts.push(`Pages explorées : ${input.website.pages_explored?.join(', ')}`)
    if (input.website.text_content) {
      parts.push(`\nContenu textuel concaténé :\n"""\n${input.website.text_content}\n"""`)
    }
  } else {
    parts.push('(non disponible — pas d\'URL fournie ou site inaccessible)')
  }

  parts.push(`\n# Source 3 : Recherche web tierce`)
  if (input.webSearch) {
    parts.push(`Synthèse Claude :\n${input.webSearch.summary}`)
    if (input.webSearch.citations.length > 0) {
      parts.push(`\nSources citées :`)
      for (const c of input.webSearch.citations.slice(0, 8)) {
        parts.push(`  - ${c.title} → ${c.url}`)
      }
    }
  } else {
    parts.push('(recherche web non effectuée ou aucun résultat exploitable)')
  }

  return parts.join('\n')
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i)
  if (fenced) return fenced[1].trim()
  const objStart = text.indexOf('{')
  const objEnd = text.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) return text.slice(objStart, objEnd + 1)
  return null
}

/**
 * Adapte le score de confiance en fonction des sources réellement disponibles.
 * Le synthesizer Claude propose un score, mais on le borne pour rester réaliste.
 */
function adjustConfidence(claudeScore: number | undefined, sources: EnrichmentSources): number {
  let cap = 50
  const okCount = (sources.linkedin === 'ok' ? 1 : 0)
    + (sources.website === 'ok' ? 1 : 0)
    + (sources.web_search === 'ok' ? 1 : 0)
  if (okCount === 3) cap = 100
  else if (okCount === 2) cap = 80
  else if (okCount === 1) cap = 60
  else cap = 30

  const claude = typeof claudeScore === 'number' && claudeScore >= 0 && claudeScore <= 100 ? claudeScore : 50
  return Math.min(claude, cap)
}

export async function synthesize(
  input: SynthesisInput,
  sources: EnrichmentSources,
): Promise<{ context: EnrichmentContext; tokens: { input: number; output: number; cacheRead: number; cacheCreate: number } }> {
  const userMessage = buildUserMessage(input)

  const meta = await callClaudeDetailed(SYSTEM_PROMPT, userMessage, 'sonnet')

  // Parser robuste
  let parsed: Record<string, unknown> = {}
  try {
    const candidate = extractJsonBlock(meta.text) ?? meta.text.trim()
    parsed = JSON.parse(candidate)
  } catch {
    console.warn('[synthesizer] JSON parse failed, returning empty context. Raw:', meta.text.slice(0, 300))
    parsed = {}
  }

  // Validation defensive : on garde uniquement les types attendus
  const asString = (v: unknown): string | undefined => typeof v === 'string' && v.trim() ? v.trim() : undefined
  const asNumber = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? v : undefined
  const asStringArray = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined
    const arr = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    return arr.length > 0 ? arr : undefined
  }
  const asReferences = (v: unknown) => {
    if (!Array.isArray(v)) return undefined
    return v
      .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
      .map((r) => ({
        titre: asString(r.titre) ?? '(sans titre)',
        client: asString(r.client),
        annee: asNumber(r.annee),
        url: asString(r.url),
        description: asString(r.description),
      }))
      .filter((r) => r.titre !== '(sans titre)' || r.client || r.url)
      .slice(0, 10)
  }

  const context: EnrichmentContext = {
    specialite_principale: asString(parsed.specialite_principale),
    sous_specialites: asStringArray(parsed.sous_specialites),
    clients_types: asStringArray(parsed.clients_types),
    taille_equipe: asString(parsed.taille_equipe),
    anciennete_annees: asNumber(parsed.anciennete_annees),
    zone_intervention: asString(parsed.zone_intervention),
    exclusions_metier: asStringArray(parsed.exclusions_metier),
    outils_technologies: asStringArray(parsed.outils_technologies),
    references_publiques: asReferences(parsed.references_publiques),
    tone_of_voice: asString(parsed.tone_of_voice),
    certifications_inferees: asStringArray(parsed.certifications_inferees),
    positionnement_resume: asString(parsed.positionnement_resume),
    signaux_specificite: asStringArray(parsed.signaux_specificite),
    confidence: adjustConfidence(asNumber(parsed.confidence), sources),
    notes: asString(parsed.notes),
  }

  return {
    context,
    tokens: {
      input: meta.tokensIn,
      output: meta.tokensOut,
      cacheRead: meta.cacheReadTokens,
      cacheCreate: meta.cacheCreationTokens,
    },
  }
}
