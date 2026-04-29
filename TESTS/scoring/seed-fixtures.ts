/**
 * Phase 3.C — Fixtures seed pour tests E2E scoring.
 *
 * MVP : structure prête à recevoir des profils types et des AO étiquetés.
 * À étoffer en session dédiée — l'idée est d'avoir 10 profils types ×
 * 30 AO réels dont on connaît la pertinence (match/maybe/no), et de valider :
 *   - top-10 contient ≥ 7 "match"
 *   - aucun "no" dans le top-5
 *   - les exclusions globales sortent réellement les AO refusés
 *
 * Pour démarrer, on n'a que les types — la donnée seed sera ajoutée au fur
 * et à mesure depuis `tender_calibration_feedback` réel.
 */

export type Verdict = 'match' | 'maybe' | 'no'

export interface SeedProfile {
  id: string                    // ex: "agence-com-iledefrance"
  raison_sociale: string
  activite_metier: string
  prestations_types?: string[]
  prestations_detail?: { type: string; specificity?: string; exclusions?: string[] }[]
  exclusions_globales?: string[]
  zone_intervention?: string
  boamp_codes?: string[]
}

export interface SeedTenderFeedback {
  profile_id: string            // référence vers SeedProfile.id
  tender_idweb: string
  expected_verdict: Verdict
  notes?: string
}

/**
 * Profils seed initiaux. À enrichir.
 */
export const SEED_PROFILES: SeedProfile[] = [
  // Exemple — à remplacer par des profils anonymisés réels :
  // {
  //   id: 'agence-com-iledefrance',
  //   raison_sociale: 'Agence Com Test',
  //   activite_metier: 'Communication, événementiel, vidéo',
  //   prestations_types: ['production audiovisuelle', 'graphisme', 'social media'],
  //   prestations_detail: [
  //     { type: 'vidéo', specificity: 'IA générative', exclusions: ['captation événementielle'] },
  //   ],
  //   zone_intervention: 'Île-de-France',
  // },
]

/**
 * AO réels étiquetés par profil. À enrichir.
 */
export const SEED_FEEDBACK: SeedTenderFeedback[] = []
