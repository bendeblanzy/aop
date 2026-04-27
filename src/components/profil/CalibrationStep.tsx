'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, HelpCircle, XCircle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CalibrationTender {
  idweb: string
  objet: string | null
  nomacheteur: string | null
  description_detail: string | null
  short_summary: string | null
  valeur_estimee: number | null
  descripteur_libelles: string[] | null
  datelimitereponse: string | null
  similarity_rank: number
}

type Verdict = 'match' | 'maybe' | 'no'

interface Props {
  /** Callback appelé quand l'utilisateur valide la calibration. */
  onComplete?: (summary: { saved: number; new_exclusions: string[] }) => void
  /** Texte du bouton final (par défaut "Valider mon retour"). */
  finalLabel?: string
}

/**
 * Composant de calibration : affiche 5 AO échantillonnés avec des boutons
 * ✓ / ? / ✗ et persiste le verdict via /api/profil/calibrate.
 *
 * Réutilisable dans /onboarding (étape finale optionnelle) et dans /profil
 * (bouton "Affiner mon profil avec 5 AO").
 */
export default function CalibrationStep({ onComplete, finalLabel = 'Valider mon retour' }: Props) {
  const [tenders, setTenders] = useState<CalibrationTender[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})

  // Charger les 5 AO à noter
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/profil/calibration-set')
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          if (!cancelled) setError(data.error ?? 'Erreur de chargement')
          return
        }
        const data = await res.json()
        if (!cancelled) setTenders(data.tenders ?? [])
      } catch {
        if (!cancelled) setError('Erreur réseau')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  function setVerdict(id: string, v: Verdict) {
    setVerdicts(prev => ({ ...prev, [id]: v }))
  }

  async function submit() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const feedback = tenders
        .filter(t => verdicts[t.idweb])
        .map(t => ({
          tender_idweb: t.idweb,
          verdict: verdicts[t.idweb],
          reason: reasons[t.idweb] || undefined,
        }))

      if (feedback.length === 0) {
        setError('Note au moins un AO avant de valider.')
        setSubmitting(false)
        return
      }

      const res = await fetch('/api/profil/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erreur enregistrement')
        setSubmitting(false)
        return
      }

      const data = await res.json()
      onComplete?.({ saved: data.saved ?? 0, new_exclusions: data.new_exclusions ?? [] })
    } catch {
      setError('Erreur réseau')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#0000FF]" />
      </div>
    )
  }

  if (error && tenders.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (tenders.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
        <p className="font-medium">Tous les AO disponibles ont été calibrés</p>
        <p className="text-sm text-gray-500 mt-1">
          Reviens plus tard, après une nouvelle synchronisation BOAMP.
        </p>
      </div>
    )
  }

  const allRated = tenders.every(t => verdicts[t.idweb])

  return (
    <div className="space-y-4">
      <div className="bg-[#E6E6FF] border border-[#ccccff] rounded-lg p-4">
        <p className="text-sm text-[#0000FF] font-medium">
          Affine ton profil en 30 secondes : pour chacun de ces 5 AO, dis-nous s'il rentre dans ton créneau.
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Tes "non" alimentent automatiquement la liste des sujets que tu refuses, et améliorent les futurs matchings.
        </p>
      </div>

      {tenders.map(t => {
        const verdict = verdicts[t.idweb]
        return (
          <div key={t.idweb} className="bg-white rounded-xl border border-[#E0E0F0] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#0000FF] text-sm uppercase line-clamp-2">
                  {t.objet ?? '(sans titre)'}
                </p>
                {t.nomacheteur && <p className="text-xs text-gray-600 mt-1">{t.nomacheteur}</p>}
                {(t.short_summary || t.description_detail) && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-3">
                    {(t.short_summary || t.description_detail || '').slice(0, 240)}
                  </p>
                )}
              </div>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">
                #{t.similarity_rank}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { v: 'match' as Verdict, label: 'Pour moi', Icon: CheckCircle2, color: 'bg-green-100 text-green-700 border-green-300', active: 'bg-green-600 text-white border-green-600' },
                { v: 'maybe' as Verdict, label: 'Peut-être', Icon: HelpCircle, color: 'bg-amber-100 text-amber-700 border-amber-300', active: 'bg-amber-600 text-white border-amber-600' },
                { v: 'no' as Verdict, label: 'Non, hors créneau', Icon: XCircle, color: 'bg-red-100 text-red-700 border-red-300', active: 'bg-red-600 text-white border-red-600' },
              ].map(({ v, label, Icon, color, active }) => (
                <button
                  key={v}
                  onClick={() => setVerdict(t.idweb, v)}
                  type="button"
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition',
                    verdict === v ? active : color
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {verdict === 'no' && (
              <input
                type="text"
                placeholder="Pourquoi ? (optionnel — ex: trop sectoriel BTP, pas mon expertise)"
                value={reasons[t.idweb] ?? ''}
                onChange={e => setReasons(prev => ({ ...prev, [t.idweb]: e.target.value }))}
                className="w-full text-xs border border-[#E0E0F0] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0000FF]/20"
              />
            )}
          </div>
        )
      })}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>
      )}

      <button
        onClick={submit}
        disabled={submitting || !allRated}
        className={cn(
          'w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition',
          allRated && !submitting
            ? 'bg-[#0000FF] hover:bg-[#0000DD] text-white'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        )}
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
        {allRated ? finalLabel : `Note les ${tenders.filter(t => !verdicts[t.idweb]).length} AO restants`}
      </button>
    </div>
  )
}
