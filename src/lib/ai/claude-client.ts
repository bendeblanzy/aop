import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function callClaude(systemPrompt: string, userMessage: string, model: 'sonnet' | 'haiku' = 'sonnet'): Promise<string> {
  const modelId = model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 8192,
    messages: [{ role: 'user', content: userMessage }],
    system: systemPrompt,
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')
  return content.text
}
