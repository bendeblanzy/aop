import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export type ClaudeModel = 'sonnet' | 'haiku'

export interface ClaudeCallMetadata {
  text: string
  model: ClaudeModel
  modelId: string
  latencyMs: number
  tokensIn: number
  tokensOut: number
}

const MODEL_IDS: Record<ClaudeModel, string> = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
}

/**
 * Appel Claude détaillé : renvoie texte + latence + tokens + modèle.
 * Utiliser pour les sites qui doivent loguer (scoring, calibration).
 */
export async function callClaudeDetailed(
  systemPrompt: string,
  userMessage: string,
  model: ClaudeModel = 'sonnet',
): Promise<ClaudeCallMetadata> {
  const modelId = MODEL_IDS[model]
  const t0 = Date.now()

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 8192,
    messages: [{ role: 'user', content: userMessage }],
    system: systemPrompt,
  })

  const latencyMs = Date.now() - t0
  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  // Phase 3.A : `usage` est toujours présent pour les appels non-streaming.
  // Fallback à 0 par sécurité au cas où le SDK changerait son contrat.
  const usage = (response as unknown as { usage?: { input_tokens?: number; output_tokens?: number } }).usage
  const tokensIn = typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0
  const tokensOut = typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0

  return {
    text: content.text,
    model,
    modelId,
    latencyMs,
    tokensIn,
    tokensOut,
  }
}

/**
 * Wrapper historique — renvoie uniquement le texte (compat existante).
 */
export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  model: ClaudeModel = 'sonnet',
): Promise<string> {
  const meta = await callClaudeDetailed(systemPrompt, userMessage, model)
  return meta.text
}
