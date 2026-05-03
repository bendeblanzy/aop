/**
 * Web Search — utilise le tool natif Anthropic `web_search` pour faire des
 * recherches web ciblées sur l'entreprise et corroborer ce qu'on a appris via
 * LinkedIn + le site officiel.
 *
 * Pourquoi ce choix vs Tavily/Brave/SerpAPI :
 *   - Intégré au SDK Anthropic, zéro setup supplémentaire
 *   - Claude utilise les résultats directement dans son raisonnement
 *   - Citations natives renvoyées dans la réponse
 *   - Coût : ~10 ct/1000 recherches (négligeable)
 *
 * On limite à `max_uses: 5` recherches par appel pour borner le coût + latence.
 */

import { anthropic } from '@/lib/ai/claude-client'
import type { RawWebSearchData } from './types'

const MODEL_ID = 'claude-sonnet-4-6'
const MAX_SEARCHES_PER_CALL = 5
const MAX_TOKENS = 2048

/**
 * Lance une recherche web ciblée sur une entreprise.
 *
 * @param raisonSociale - Nom de l'entreprise pour les requêtes
 * @param hints - Indices contextuels (code NAF, ville…) pour désambiguïser
 * @returns Synthèse textuelle + citations, ou null si la recherche n'a rien donné
 */
export async function searchCompanyWeb(
  raisonSociale: string,
  hints: { code_naf?: string; ville?: string; siren?: string } = {},
): Promise<RawWebSearchData | null> {
  const hintsLine = [
    hints.code_naf && `code NAF ${hints.code_naf}`,
    hints.ville && `basée à ${hints.ville}`,
    hints.siren && `SIREN ${hints.siren}`,
  ].filter(Boolean).join(', ')

  const prompt = `Tu es un analyste qui prépare un dossier sur une entreprise française pour
un consultant en marchés publics.

ENTREPRISE À RECHERCHER : "${raisonSociale}"${hintsLine ? ` (${hintsLine})` : ''}

Effectue 3 à 5 recherches web ciblées pour trouver :
1. Quelles sont leurs activités précises et leur spécialité affichée publiquement ?
2. Quelques références clients récentes (qui ont-ils servi ? quels projets ?)
3. Leur taille, ancienneté, équipe, certifications éventuelles
4. Leur positionnement / différenciateurs perçus

Une fois tes recherches effectuées, produis un PARAGRAPHE DE SYNTHÈSE
(200-500 mots) factuel, sans inventer. Si tu ne trouves rien sur certains points,
dis-le explicitement ("Aucune information publique trouvée sur les références").
N'utilise QUE des infos vérifiables via les sources que tu cites. Pas de spéculation.`

  try {
    const response = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      tools: [
        {
          type: 'web_search_20250305' as 'custom',
          name: 'web_search',
          // @ts-expect-error — `max_uses` accepté par le tool web_search natif Anthropic
          max_uses: MAX_SEARCHES_PER_CALL,
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    })

    // Parser la réponse : extraire texte + citations
    const textBlocks: string[] = []
    const citations: { title: string; url: string }[] = []

    for (const block of response.content) {
      if (block.type === 'text') {
        textBlocks.push(block.text)
        // Les citations Anthropic peuvent être dans block.citations (format récent)
        const citationsArray = (block as unknown as { citations?: unknown[] }).citations
        if (Array.isArray(citationsArray)) {
          for (const c of citationsArray) {
            if (c && typeof c === 'object') {
              const cobj = c as Record<string, unknown>
              const url = typeof cobj.url === 'string' ? cobj.url : null
              const title = typeof cobj.title === 'string' ? cobj.title : (typeof cobj.cited_text === 'string' ? cobj.cited_text.slice(0, 80) : url)
              if (url && title && !citations.find(x => x.url === url)) {
                citations.push({ title: String(title), url })
              }
            }
          }
        }
      }
      // Les `web_search_tool_result` blocks contiennent les hits bruts si on veut les exploiter
      if ((block as { type: string }).type === 'web_search_tool_result') {
        const content = (block as unknown as { content?: unknown[] }).content
        if (Array.isArray(content)) {
          for (const result of content) {
            if (result && typeof result === 'object') {
              const r = result as Record<string, unknown>
              const url = typeof r.url === 'string' ? r.url : null
              const title = typeof r.title === 'string' ? r.title : url
              if (url && title && !citations.find(x => x.url === url)) {
                citations.push({ title: String(title), url })
              }
            }
          }
        }
      }
    }

    const summary = textBlocks.join('\n').trim()
    if (!summary) return null

    return { summary, citations: citations.slice(0, 10) }
  } catch (e) {
    console.warn('[web-search] error:', e instanceof Error ? e.message : e)
    return null
  }
}
