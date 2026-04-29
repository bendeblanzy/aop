import { createHash } from 'crypto'
import { adminClient } from '@/lib/supabase/admin'
import type { ClaudeModel } from './claude-client'

/**
 * Phase 3.A — Logger Tier 2 Claude (fire-and-forget).
 *
 * Insert async dans `claude_scoring_logs`. JAMAIS bloquant : tout échec est
 * silencieusement loggé en console et l'appel scoring poursuit.
 */

export interface ScoringLogEntry {
  organizationId: string
  tenderIdweb: string
  scoreIn: number       // score vectoriel Tier 1 (0-100)
  scoreOut: number      // score Claude Tier 2 (0-100)
  similarity?: number   // similarité cosinus brute (0-1)
  raison?: string | null
  model: ClaudeModel
  latencyMs: number
  tokensIn: number
  tokensOut: number
  promptHash: string    // SHA256 du prompt système, 64 hex chars
}

/**
 * Hash SHA256 d'un prompt — détecte les changements de prompt système
 * dans le temps sans stocker tout le prompt.
 */
export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex')
}

/**
 * Insère une ligne dans `claude_scoring_logs`. Ne lève jamais : en cas d'erreur,
 * on log en console et on retourne. Utiliser dans un `void` ou ignoré (pas await).
 */
export async function logScoringCall(entry: ScoringLogEntry): Promise<void> {
  try {
    const { error } = await adminClient.from('claude_scoring_logs').insert({
      organization_id: entry.organizationId,
      tender_idweb: entry.tenderIdweb,
      score_in: clampScore(entry.scoreIn),
      score_out: clampScore(entry.scoreOut),
      similarity: typeof entry.similarity === 'number' ? entry.similarity : null,
      raison: entry.raison ?? null,
      model: entry.model,
      latency_ms: entry.latencyMs,
      tokens_in: entry.tokensIn,
      tokens_out: entry.tokensOut,
      prompt_hash: entry.promptHash,
    })
    if (error) {
      console.warn('[scoring-logger] insert failed:', error.message)
    }
  } catch (e) {
    console.warn('[scoring-logger] unexpected error:', e instanceof Error ? e.message : e)
  }
}

/**
 * Insère un lot de scoring logs en une requête.
 * Mêmes garanties non-bloquantes que `logScoringCall`.
 */
export async function logScoringBatch(entries: ScoringLogEntry[]): Promise<void> {
  if (!Array.isArray(entries) || entries.length === 0) return
  try {
    const rows = entries.map(entry => ({
      organization_id: entry.organizationId,
      tender_idweb: entry.tenderIdweb,
      score_in: clampScore(entry.scoreIn),
      score_out: clampScore(entry.scoreOut),
      similarity: typeof entry.similarity === 'number' ? entry.similarity : null,
      raison: entry.raison ?? null,
      model: entry.model,
      latency_ms: entry.latencyMs,
      tokens_in: entry.tokensIn,
      tokens_out: entry.tokensOut,
      prompt_hash: entry.promptHash,
    }))
    const { error } = await adminClient.from('claude_scoring_logs').insert(rows)
    if (error) {
      console.warn('[scoring-logger] batch insert failed:', error.message)
    }
  } catch (e) {
    console.warn('[scoring-logger] unexpected batch error:', e instanceof Error ? e.message : e)
  }
}

function clampScore(s: number): number {
  if (!Number.isFinite(s)) return 0
  return Math.max(0, Math.min(100, Math.round(s)))
}
