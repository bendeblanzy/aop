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
  cacheCreationTokens: number
  cacheReadTokens: number
}

const MODEL_IDS: Record<ClaudeModel, string> = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
}

// Seuil minimal pour activer le prompt caching Anthropic.
// Le cache n'apporte de gain que sur des prompts substantiels (cf. doc Anthropic :
// minimum 1024 tokens pour Sonnet, 2048 pour Haiku — sinon l'écriture en cache
// coûte 25% en plus pour rien). On approxime grossièrement 1 token ≈ 4 caractères.
const CACHE_MIN_CHARS_SONNET = 4096   // ≈ 1024 tokens
const CACHE_MIN_CHARS_HAIKU = 8192    // ≈ 2048 tokens

interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

/**
 * Appel Claude détaillé : renvoie texte + latence + tokens + modèle + métriques cache.
 *
 * Prompt caching activé automatiquement sur les system prompts assez longs pour
 * qu'il soit rentable. Sur le scoring (qui répète le même prompt système pour
 * 50 tenders / org × N orgs), ça réduit le coût input de ~80 % après le 1er hit
 * dans la fenêtre de 5 min.
 */
export async function callClaudeDetailed(
  systemPrompt: string,
  userMessage: string,
  model: ClaudeModel = 'sonnet',
): Promise<ClaudeCallMetadata> {
  const modelId = MODEL_IDS[model]
  const t0 = Date.now()

  const minChars = model === 'haiku' ? CACHE_MIN_CHARS_HAIKU : CACHE_MIN_CHARS_SONNET
  const useCaching = systemPrompt.length >= minChars

  // Quand le cache est activé, le système doit être en format "blocs" avec
  // cache_control sur le dernier bloc. Sinon on garde la string simple.
  const systemParam: string | Anthropic.TextBlockParam[] = useCaching
    ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
    : systemPrompt

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 8192,
    messages: [{ role: 'user', content: userMessage }],
    system: systemParam,
  })

  const latencyMs = Date.now() - t0
  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const usage = (response as unknown as { usage?: AnthropicUsage }).usage
  const tokensIn = typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0
  const tokensOut = typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0
  const cacheCreationTokens = typeof usage?.cache_creation_input_tokens === 'number'
    ? usage.cache_creation_input_tokens
    : 0
  const cacheReadTokens = typeof usage?.cache_read_input_tokens === 'number'
    ? usage.cache_read_input_tokens
    : 0

  return {
    text: content.text,
    model,
    modelId,
    latencyMs,
    tokensIn,
    tokensOut,
    cacheCreationTokens,
    cacheReadTokens,
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
