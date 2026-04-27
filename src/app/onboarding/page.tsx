'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, ChevronRight } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
interface Answers {
  org_name: string
  raison_sociale: string
  prestations: string[]
  prestations_autre: string
  clients: string[]
  clients_autre: string
  modes: string[]
  modes_autre: string
  zone: string
  differentiants: string
  valeurs: string
}

const PRESTATIONS = [
  { id: 'formation', label: 'Formation / sensibilisation' },
  { id: 'conseil', label: 'Conseil & accompagnement stratégique' },
  { id: 'video', label: 'Production vidéo / audiovisuel' },
  { id: 'workflows', label: 'Création de workflows & automatisation' },
  { id: 'conference', label: 'Animation de conférence / keynote' },
  { id: 'outils', label: 'Développement d\'outils sur mesure' },
  { id: 'audit', label: 'Audit / diagnostic' },
  { id: 'communication', label: 'Communication / création de contenus' },
  { id: 'evenementiel', label: 'Événementiel' },
  { id: 'numerique', label: 'Transformation numérique' },
]

const CLIENTS = [
  { id: 'agences', label: 'Agences de communication' },
  { id: 'grandes-entreprises', label: 'Grandes entreprises' },
  { id: 'pme', label: 'PME / ETI' },
  { id: 'collectivites', label: 'Collectivités territoriales' },
  { id: 'etablissements-publics', label: 'Établissements publics (universités, hôpitaux…)' },
  { id: 'ministeres', label: 'Ministères / administrations' },
  { id: 'startups', label: 'Startups / scale-ups' },
  { id: 'associations', label: 'Associations / fondations' },
]

const MODES = [
  { id: 'presentiel', label: 'Présentiel (chez le client)' },
  { id: 'distanciel', label: 'Distanciel (visioconférence)' },
  { id: 'hybride', label: 'Hybride' },
]

const ZONES = [
  { id: 'idf', label: 'Île-de-France' },
  { id: 'regional', label: 'Régional' },
  { id: 'national', label: 'National' },
  { id: 'international', label: 'International' },
]

const TOTAL_STEPS = 6

// ── Component ─────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [synthesis, setSynthesis] = useState<Record<string, string> | null>(null)

  // Utilisateurs existants (pré-onboarding) : si l'org existe déjà,
  // on marque l'onboarding comme fait et on redirige sans afficher le formulaire.
  useEffect(() => {
    async function checkExistingOrg() {
      try {
        const res = await fetch('/api/organizations/me')
        if (res.ok) {
          const data = await res.json()
          if (data?.id) {
            await fetch('/api/onboarding/skip', { method: 'POST' })
            router.replace('/dashboard')
          }
        }
      } catch { /* silencieux */ }
    }
    checkExistingOrg()
  }, [router])

  const [answers, setAnswers] = useState<Answers>({
    org_name: '',
    raison_sociale: '',
    prestations: [],
    prestations_autre: '',
    clients: [],
    clients_autre: '',
    modes: [],
    modes_autre: '',
    zone: '',
    differentiants: '',
    valeurs: '',
  })

  function toggle(field: 'prestations' | 'clients' | 'modes', id: string) {
    setAnswers(a => ({
      ...a,
      [field]: a[field].includes(id) ? a[field].filter(x => x !== id) : [...a[field], id],
    }))
  }

  function canNext(): boolean {
    switch (step) {
      case 1: return answers.org_name.trim().length > 0 && answers.raison_sociale.trim().length > 0
      case 2: return answers.prestations.length > 0 || answers.prestations_autre.trim().length > 0
      case 3: return answers.clients.length > 0 || answers.clients_autre.trim().length > 0
      case 4: return answers.modes.length > 0 && answers.zone.length > 0
      case 5: return answers.differentiants.trim().length > 0
      case 6: return answers.valeurs.trim().length > 0
      default: return false
    }
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Une erreur est survenue')
        setLoading(false)
        return
      }
      setSynthesis(data.synthesis)
      setStep(8) // étape confirmation
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
      setLoading(false)
    }
  }

  // ── Étape confirmation finale ────────────────────────────────────────────
  if (step === 8 && synthesis) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-500 shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Profil créé avec succès !</h1>
              <p className="text-sm text-gray-500 mt-0.5">Votre spécialiste Appels d&apos;Offre a synthétisé votre profil.</p>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            {[
              { label: 'Cœur de métier', key: 'coeur_metier', color: 'blue' },
              { label: 'Atouts différenciants', key: 'atouts_differenciants', color: 'green' },
              { label: 'Philosophie & valeurs', key: 'philosophie_valeurs', color: 'purple' },
              { label: 'Méthodologie', key: 'methodologie_type', color: 'orange' },
            ].map(({ label, key, color }) => (
              <div key={key} className={`bg-${color}-50 border border-${color}-100 rounded-lg p-4`}>
                <p className={`text-xs font-semibold text-${color}-600 uppercase tracking-wide mb-1`}>{label}</p>
                <p className="text-sm text-gray-700">{synthesis[key]}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mb-4">Vous pourrez affiner ce profil à tout moment dans vos paramètres.</p>

          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Accéder à mon tableau de bord
          </button>
        </div>
      </div>
    )
  }

  // ── Loading synthesis ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Votre spécialiste Appels d&apos;Offre analyse votre profil…</h2>
          <p className="text-sm text-gray-500">Synthèse en cours, cela prend quelques secondes.</p>
        </div>
      </div>
    )
  }

  // ── Steps ────────────────────────────────────────────────────────────────
  const progress = Math.round((step / TOTAL_STEPS) * 100)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white text-xl font-bold mb-3">A</div>
          <p className="text-sm text-gray-500">Votre spécialiste Appels d&apos;Offre</p>
          <p className="text-xs text-gray-400 mt-1">Étape {step} sur {TOTAL_STEPS}</p>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-6">
          <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
          {/* ÉTAPE 1 — Votre société */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Votre société</h2>
              <p className="text-sm text-gray-500 mb-5">Ces informations servent à personnaliser votre matching d&apos;appels d&apos;offres.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom de votre organisation <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={answers.org_name}
                    onChange={e => setAnswers(a => ({ ...a, org_name: e.target.value }))}
                    placeholder="Ex : ACME Consulting"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Raison sociale <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={answers.raison_sociale}
                    onChange={e => setAnswers(a => ({ ...a, raison_sociale: e.target.value }))}
                    placeholder="Ex : ACME Consulting SAS"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ÉTAPE 2 — Prestations */}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Vos prestations</h2>
              <p className="text-sm text-gray-500 mb-5">Sélectionnez tout ce qui correspond à votre activité.</p>
              <div className="space-y-2.5">
                {PRESTATIONS.map(p => (
                  <label key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${answers.prestations.includes(p.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input
                      type="checkbox"
                      checked={answers.prestations.includes(p.id)}
                      onChange={() => toggle('prestations', p.id)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{p.label}</span>
                  </label>
                ))}
                <div className="mt-3">
                  <input
                    type="text"
                    value={answers.prestations_autre}
                    onChange={e => setAnswers(a => ({ ...a, prestations_autre: e.target.value }))}
                    placeholder="Autre : précisez…"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ÉTAPE 3 — Types de clients */}
          {step === 3 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Vos types de clients</h2>
              <p className="text-sm text-gray-500 mb-5">Qui sont vos clients habituels ?</p>
              <div className="space-y-2.5">
                {CLIENTS.map(c => (
                  <label key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${answers.clients.includes(c.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input
                      type="checkbox"
                      checked={answers.clients.includes(c.id)}
                      onChange={() => toggle('clients', c.id)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{c.label}</span>
                  </label>
                ))}
                <div className="mt-3">
                  <input
                    type="text"
                    value={answers.clients_autre}
                    onChange={e => setAnswers(a => ({ ...a, clients_autre: e.target.value }))}
                    placeholder="Autre : précisez…"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ÉTAPE 4 — Mode & zone */}
          {step === 4 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Votre zone d&apos;intervention</h2>
              <p className="text-sm text-gray-500 mb-5">Comment et où intervenez-vous ?</p>
              <div className="mb-5">
                <p className="text-sm font-medium text-gray-700 mb-2.5">Modes d&apos;intervention</p>
                <div className="space-y-2">
                  {MODES.map(m => (
                    <label key={m.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${answers.modes.includes(m.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input
                        type="checkbox"
                        checked={answers.modes.includes(m.id)}
                        onChange={() => toggle('modes', m.id)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{m.label}</span>
                    </label>
                  ))}
                  <input
                    type="text"
                    value={answers.modes_autre}
                    onChange={e => setAnswers(a => ({ ...a, modes_autre: e.target.value }))}
                    placeholder="Autre mode…"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2.5">Zone géographique principale</p>
                <div className="grid grid-cols-2 gap-2">
                  {ZONES.map(z => (
                    <label key={z.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${answers.zone === z.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input
                        type="radio"
                        name="zone"
                        checked={answers.zone === z.id}
                        onChange={() => setAnswers(a => ({ ...a, zone: z.id }))}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{z.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ÉTAPE 5 — Différenciants */}
          {step === 5 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Vos atouts différenciants</h2>
              <p className="text-sm text-gray-500 mb-5">Qu&apos;est-ce qui vous distingue de vos concurrents ? Pourquoi un client vous choisit-il ?</p>
              <textarea
                value={answers.differentiants}
                onChange={e => setAnswers(a => ({ ...a, differentiants: e.target.value }))}
                placeholder="Ex : Solutions sur mesure, outils constamment à jour, rentabilisation rapide pour le client…"
                rows={5}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          )}

          {/* ÉTAPE 6 — Valeurs */}
          {step === 6 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Votre façon de travailler</h2>
              <p className="text-sm text-gray-500 mb-5">En 2 ou 3 mots, comment vos clients vous décriraient-ils ?</p>
              <input
                type="text"
                value={answers.valeurs}
                onChange={e => setAnswers(a => ({ ...a, valeurs: e.target.value }))}
                placeholder="Ex : Réactif, à l'écoute, adaptable"
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            {step > 1 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                ← Retour
              </button>
            ) : <div />}

            {step < TOTAL_STEPS ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Suivant <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canNext() || loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Créer mon profil <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
