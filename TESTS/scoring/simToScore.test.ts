import { describe, it, expect } from 'vitest'
import { simToScore, cosineSimilarity, SIMILARITY_MIN, SIMILARITY_MAX } from '@/lib/ai/embeddings'

/**
 * Phase 3.C — Tests unitaires de la fonction de scoring.
 *
 * Garde-fous contre la régression de la calibration empirique 2026-04-27 :
 *   sim=0.50 doit donner ~86 (excellent match)
 *   sim=0.30 doit donner ~29 (correspondance partielle)
 *   sim=0.20 doit donner 0 (plancher)
 *   sim=0.55 doit donner 100 (top observé)
 *
 * Si quelqu'un retoque MIN/MAX/EXP, ces tests cassent et forcent une décision
 * documentée.
 */

describe('simToScore — calibration empirique 2026-04-27', () => {
  it('plancher sim=0.20 → 0', () => {
    expect(simToScore(0.20)).toBe(0)
  })

  it('sim=0.30 → 29 (correspondance partielle)', () => {
    expect(simToScore(0.30)).toBe(29)
  })

  it('sim=0.40 → 57', () => {
    expect(simToScore(0.40)).toBe(57)
  })

  it('sim=0.45 → 71 (bon match)', () => {
    expect(simToScore(0.45)).toBe(71)
  })

  it('sim=0.50 → 86 (excellent match)', () => {
    expect(simToScore(0.50)).toBe(86)
  })

  it('sim=0.55 → 100 (top observé)', () => {
    expect(simToScore(0.55)).toBe(100)
  })

  it('clamp en dessous du plancher', () => {
    expect(simToScore(0.10)).toBe(0)
    expect(simToScore(-0.5)).toBe(0)
  })

  it('clamp au-dessus du plafond', () => {
    expect(simToScore(0.80)).toBe(100)
    expect(simToScore(1.0)).toBe(100)
  })

  it('monotonicité : sim croissante implique score croissant ou égal', () => {
    let prev = simToScore(0)
    for (let s = 0; s <= 1; s += 0.01) {
      const cur = simToScore(s)
      expect(cur).toBeGreaterThanOrEqual(prev)
      prev = cur
    }
  })

  it('constantes calibrées comme attendu', () => {
    // Si quelqu'un les change, ce test casse — décision documentée requise.
    expect(SIMILARITY_MIN).toBe(0.20)
    expect(SIMILARITY_MAX).toBe(0.55)
  })
})

describe('cosineSimilarity', () => {
  it('vecteurs identiques → 1', () => {
    const v = [1, 2, 3]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6)
  })

  it('vecteurs orthogonaux → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })

  it('vecteurs opposés → -1', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 6)
  })

  it('longueurs différentes → 0', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  it('vecteur vide → 0', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('vecteur nul → 0', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
  })
})
