'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Loader2, CheckCircle2, ChevronRight, Search, Sparkles,
  Building2, User, Brain, Radio, Wrench, BarChart3, FileText, ShieldCheck,
  Info, Plus, X, ArrowRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BOAMP_CODES, BOAMP_CATEGORIES } from '@/lib/boamp/codes'
import { toast } from 'sonner'

// ── Constants ─────────────────────────────────────────────────────────────────
const TOTAL_STEPS = 8

const DOMAINES = [
  'BTP', 'Informatique / IT', 'Conseil', 'Formation', 'Maintenance',
  'Nettoyage', 'Sécurité', 'Transport', 'Restauration', 'Santé',
  'Environnement', 'Communication', 'Juridique', 'Autre',
]

const STEP_META = [
  { id: 1, icon: Building2, label: 'Entreprise', required: true },
  { id: 2, icon: User, label: 'Représentant', required: false },
  { id: 3, icon: Brain, label: 'Positionnement IA', required: true },
  { id: 4, icon: Radio, label: 'Veille BOAMP', required: true },
  { id: 5, icon: Wrench, label: 'Capacités', required: false },
  { id: 6, icon: BarChart3, label: 'Données financières', required: false },
  { id: 7, icon: FileText, label: 'Références', required: false },
  { id: 8, icon: ShieldCheck, label: 'Finalisation', required: true },
]

// ── Types ─────────────────────────────────────────────────────────────────────
interface SiretData {
  raison_sociale?: string
  forme_juridique?: string
  code_naf?: string
  adresse_siege?: string
  code_postal?: string
  ville?: string
  capital_social?: number
  effectif_moyen?: number
  date_creation_entreprise?: string
  numero_tva?: string
  prenom_representant?: string
  nom_representant?: string
  qualite_representant?: string
}

interface StepData {
  // Étape 1
  org_name: string
  raison_sociale: string
  nom_commercial: string
  siret: string
  siretData: SiretData | null
  // Étape 2
  civilite_representant: string
  prenom_representant: string
  nom_representant: string
  qualite_representant: string
  email_representant: string
  telephone_representant: string
  // Étape 3 (Deep Research)
  activite_metier: string
  positionnement: string
  atouts_differenciants: string
  methodologie_type: string
  // Étape 4 (BOAMP)
  types_marche_filtres: string[]
  boamp_codes: string[]
  domaines_competence: string[]
  // Étape 5 (Capacités)
  certifications: string[]
  moyens_techniques: string
  // Étape 6 (Financier)
  ca_annee_n1: string
  ca_annee_n2: string
  ca_annee_n3: string
  marge_brute: string
  effectif_moyen: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Input({ label, value, onChange, placeholder, type = 'text', required, hint, readOnly }: {
  label: string; value: string; onChange?: (v: string) => void
  placeholder?: string; type?: string; required?: boolean; hint?: string; readOnly?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type} value={value} readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3.5 py-2.5 text-sm border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0000FF]/30 focus:border-[#0000FF] transition-colors ${readOnly ? 'bg-gray-50 text-gray-500' : 'border-gray-300 bg-white'}`}
      />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Textarea({ label, value, onChange, placeholder, rows = 4, hint }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; rows?: number; hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <textarea
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0000FF]/30 focus:border-[#0000FF] resize-none transition-colors"
      />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function WhyItMatters({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 bg-[#F5F5FF] border border-[#0000FF]/15 rounded-xl p-4 text-sm text-gray-700">
      <div className="w-6 h-6 rounded-full bg-[#0000FF] flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-white text-[10px] font-bold">?</span>
      </div>
      <div>
        <p className="font-semibold text-[#0000FF] mb-1 text-xs uppercase tracking-wide">Pourquoi c'est important</p>
        <p className="text-gray-600 text-xs leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#0000FF]" />
      </div>
    }>
      <OnboardingPageInner />
    </Suspense>
  )
}

function OnboardingPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEditMode = searchParams.get('edit') === 'true'

  const [step, setStep] = useState(1)
  const [orgCreated, setOrgCreated] = useState(false)
  const [siretLoading, setSiretLoading] = useState(false)
  const [deepResearchLoading, setDeepResearchLoading] = useState(false)
  const [deepResearchCountdown, setDeepResearchCountdown] = useState(0)
  const [boampLoading, setBoampLoading] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [done, setDone] = useState(false)
  const [newCert, setNewCert] = useState('')
  const [newRef, setNewRef] = useState({ titre: '', client: '', domaine: '', annee: '' })
  const [refs, setRefs] = useState<{ titre: string; client: string; domaine: string; annee: string }[]>([])

  const [data, setData] = useState<StepData>({
    org_name: '', raison_sociale: '', nom_commercial: '', siret: '', siretData: null,
    civilite_representant: 'M.', prenom_representant: '', nom_representant: '',
    qualite_representant: '', email_representant: '', telephone_representant: '',
    activite_metier: '', positionnement: '', atouts_differenciants: '', methodologie_type: '',
    types_marche_filtres: [], boamp_codes: [], domaines_competence: [],
    certifications: [], moyens_techniques: '',
    ca_annee_n1: '', ca_annee_n2: '', ca_annee_n3: '', marge_brute: '', effectif_moyen: '',
  })

  const upd = useCallback(<K extends keyof StepData>(key: K, val: StepData[K]) => {
    setData(d => ({ ...d, [key]: val }))
  }, [])

  // Countdown Deep Research
  useEffect(() => {
    if (!deepResearchLoading) { setDeepResearchCountdown(0); return }
    setDeepResearchCountdown(60)
    const interval = setInterval(() => {
      setDeepResearchCountdown(c => {
        if (c <= 1) { clearInterval(interval); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [deepResearchLoading])

  // Mode edit : charger le profil existant
  useEffect(() => {
    if (!isEditMode) return
    fetch('/api/profil').then(r => r.ok ? r.json() : null).then(wrapped => {
      if (!wrapped) return
      const p = wrapped?.data ?? wrapped
      setData(d => ({
        ...d,
        org_name: p.raison_sociale ?? d.org_name,
        raison_sociale: p.raison_sociale ?? '',
        nom_commercial: p.nom_commercial ?? '',
        siret: p.siret ?? '',
        civilite_representant: p.civilite_representant ?? 'M.',
        prenom_representant: p.prenom_representant ?? '',
        nom_representant: p.nom_representant ?? '',
        qualite_representant: p.qualite_representant ?? '',
        email_representant: p.email_representant ?? '',
        telephone_representant: p.telephone_representant ?? '',
        activite_metier: p.activite_metier ?? '',
        positionnement: p.positionnement ?? '',
        atouts_differenciants: p.atouts_differenciants ?? '',
        methodologie_type: p.methodologie_type ?? '',
        types_marche_filtres: Array.isArray(p.types_marche_filtres) ? p.types_marche_filtres : [],
        boamp_codes: Array.isArray(p.boamp_codes) ? p.boamp_codes : [],
        domaines_competence: Array.isArray(p.domaines_competence) ? p.domaines_competence : [],
        certifications: Array.isArray(p.certifications) ? p.certifications : [],
        moyens_techniques: p.moyens_techniques ?? '',
        ca_annee_n1: p.ca_annee_n1?.toString() ?? '',
        ca_annee_n2: p.ca_annee_n2?.toString() ?? '',
        ca_annee_n3: p.ca_annee_n3?.toString() ?? '',
        marge_brute: p.marge_brute?.toString() ?? '',
        effectif_moyen: p.effectif_moyen?.toString() ?? '',
      }))
      setOrgCreated(true)
    }).catch(() => {})
  }, [isEditMode])

  // ── SIRET lookup ─────────────────────────────────────────────────────────
  async function lookupSiret() {
    const q = data.siret.replace(/\s/g, '')
    if (q.length < 9) { toast.error('Entrez un SIRET (14 chiffres) ou SIREN (9 chiffres)'); return }
    setSiretLoading(true)
    try {
      const res = await fetch(`/api/profil/siret?q=${encodeURIComponent(q)}`)
      const d = await res.json()
      if (!res.ok) { toast.error(d.error ?? 'SIRET introuvable'); return }
      const sd: SiretData = d
      upd('siretData', sd)
      if (sd.raison_sociale) upd('raison_sociale', sd.raison_sociale)
      if (sd.prenom_representant) upd('prenom_representant', sd.prenom_representant)
      if (sd.nom_representant) upd('nom_representant', sd.nom_representant)
      if (sd.qualite_representant) upd('qualite_representant', sd.qualite_representant)
      if (!data.org_name && sd.raison_sociale) upd('org_name', sd.raison_sociale)
      toast.success('Entreprise trouvée !')
    } catch { toast.error('Erreur réseau') }
    setSiretLoading(false)
  }

  // ── Step 1 → save org ────────────────────────────────────────────────────
  async function initOrg() {
    const sd = data.siretData
    const res = await fetch('/api/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_name: data.org_name || data.raison_sociale,
        raison_sociale: data.raison_sociale,
        nom_commercial: data.nom_commercial || undefined,
        siret: data.siret || undefined,
        forme_juridique: sd?.forme_juridique,
        code_naf: sd?.code_naf,
        adresse_siege: sd?.adresse_siege,
        code_postal: sd?.code_postal,
        ville: sd?.ville,
        capital_social: sd?.capital_social,
        effectif_moyen: sd?.effectif_moyen,
        date_creation_entreprise: sd?.date_creation_entreprise,
        numero_tva: sd?.numero_tva,
        prenom_representant: data.prenom_representant || sd?.prenom_representant,
        nom_representant: data.nom_representant || sd?.nom_representant,
        qualite_representant: data.qualite_representant || sd?.qualite_representant,
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erreur initialisation')
      return false
    }
    setOrgCreated(true)
    return true
  }

  // ── Step 2 → save representant ───────────────────────────────────────────
  async function saveRepresentant(): Promise<boolean> {
    const res = await fetch('/api/profil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        civilite_representant: data.civilite_representant,
        prenom_representant: data.prenom_representant,
        nom_representant: data.nom_representant,
        qualite_representant: data.qualite_representant,
        email_representant: data.email_representant,
        telephone_representant: data.telephone_representant,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erreur sauvegarde représentant')
      return false
    }
    return true
  }

  // ── Step 3 → Deep Research ───────────────────────────────────────────────
  async function runDeepResearch() {
    setDeepResearchLoading(true)
    try {
      const res = await fetch('/api/profil/deep-research', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? `Erreur ${res.status}`)
      if (d.activite_metier) upd('activite_metier', d.activite_metier)
      if (d.positionnement) upd('positionnement', d.positionnement)
      if (d.atouts_differenciants) upd('atouts_differenciants', d.atouts_differenciants)
      if (d.methodologie_type) upd('methodologie_type', d.methodologie_type)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur Deep Research')
    }
    setDeepResearchLoading(false)
  }

  async function savePositionnement() {
    await fetch('/api/profil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activite_metier: data.activite_metier,
        positionnement: data.positionnement,
        atouts_differenciants: data.atouts_differenciants,
        methodologie_type: data.methodologie_type,
      }),
    })
  }

  // ── Step 4 → suggest BOAMP ───────────────────────────────────────────────
  async function runSuggestBoamp() {
    setBoampLoading(true)
    try {
      const res = await fetch('/api/profil/suggest-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activite_metier: data.activite_metier,
          positionnement: data.positionnement,
          atouts_differenciants: data.atouts_differenciants,
          methodologie_type: data.methodologie_type,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      if (Array.isArray(d.boamp_codes) && d.boamp_codes.length > 0) upd('boamp_codes', d.boamp_codes)
      if (Array.isArray(d.types_marche_filtres) && d.types_marche_filtres.length > 0) upd('types_marche_filtres', d.types_marche_filtres)
      if (Array.isArray(d.domaines_competence) && d.domaines_competence.length > 0) upd('domaines_competence', d.domaines_competence)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur suggestion BOAMP')
    }
    setBoampLoading(false)
  }

  async function saveBoamp() {
    await fetch('/api/profil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types_marche_filtres: data.types_marche_filtres,
        boamp_codes: data.boamp_codes,
        domaines_competence: data.domaines_competence,
      }),
    })
  }

  // ── Step 5 → save capacités ──────────────────────────────────────────────
  async function saveCapacites() {
    await fetch('/api/profil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        certifications: data.certifications,
        moyens_techniques: data.moyens_techniques,
      }),
    })
  }

  // ── Step 6 → save financier ──────────────────────────────────────────────
  async function saveFinancier() {
    await fetch('/api/profil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ca_annee_n1: data.ca_annee_n1 ? parseFloat(data.ca_annee_n1) : null,
        ca_annee_n2: data.ca_annee_n2 ? parseFloat(data.ca_annee_n2) : null,
        ca_annee_n3: data.ca_annee_n3 ? parseFloat(data.ca_annee_n3) : null,
        marge_brute: data.marge_brute ? parseFloat(data.marge_brute) : null,
        effectif_moyen: data.effectif_moyen ? parseInt(data.effectif_moyen) : null,
      }),
    })
  }

  // ── Step 7 → save référence ──────────────────────────────────────────────
  async function addRef() {
    if (!newRef.titre || !newRef.client) { toast.error('Titre et client requis'); return }
    await fetch('/api/references', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titre: newRef.titre,
        client: newRef.client,
        domaine: newRef.domaine || undefined,
        annee: newRef.annee ? parseInt(newRef.annee) : undefined,
      }),
    })
    setRefs(r => [...r, newRef])
    setNewRef({ titre: '', client: '', domaine: '', annee: '' })
    toast.success('Référence ajoutée')
  }

  // ── Finalize ─────────────────────────────────────────────────────────────
  async function finalize() {
    setFinalizing(true)
    try {
      const res = await fetch('/api/onboarding/finalize', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'Erreur finalisation')
        setFinalizing(false)
        return
      }
      setDone(true)
    } catch { toast.error('Erreur réseau'); setFinalizing(false) }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  async function goNext() {
    if (step === 1) {
      if (!data.raison_sociale.trim()) { toast.error('Raison sociale requise'); return }
      const ok = await initOrg()
      if (!ok) return
    }
    if (step === 2) { const ok = await saveRepresentant(); if (!ok) return }
    if (step === 3) await savePositionnement()
    if (step === 4) await saveBoamp()
    if (step === 5) await saveCapacites()
    if (step === 6) await saveFinancier()

    if (step === 7) {
      setStep(8)
      return
    }

    const next = step + 1
    setStep(next)

    // Déclencher Deep Research auto à l'étape 3
    if (next === 3) {
      setTimeout(() => runDeepResearch(), 100)
    }
    // Déclencher suggestion BOAMP auto à l'étape 4
    if (next === 4) {
      setTimeout(() => runSuggestBoamp(), 100)
    }
  }

  function canNext(): boolean {
    if (step === 1) return data.raison_sociale.trim().length > 0
    if (step === 3) return !deepResearchLoading && (data.activite_metier.length > 0 || data.positionnement.length > 0)
    if (step === 4) return !boampLoading
    return true
  }

  // ── Écran final ───────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Profil complet !</h1>
          <p className="text-sm text-gray-500 mb-6">
            Votre profil est configuré. La veille BOAMP va maintenant scanner les appels d'offres correspondant à votre activité.
          </p>
          <div className="grid grid-cols-2 gap-3 text-left mb-6 text-xs text-gray-600">
            {data.boamp_codes.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="font-semibold text-blue-700 mb-1">Codes BOAMP</p>
                <p>{data.boamp_codes.length} code{data.boamp_codes.length > 1 ? 's' : ''} configuré{data.boamp_codes.length > 1 ? 's' : ''}</p>
              </div>
            )}
            {data.types_marche_filtres.length > 0 && (
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="font-semibold text-purple-700 mb-1">Types de marchés</p>
                <p>{data.types_marche_filtres.join(', ')}</p>
              </div>
            )}
            {refs.length > 0 && (
              <div className="bg-green-50 rounded-lg p-3">
                <p className="font-semibold text-green-700 mb-1">Références</p>
                <p>{refs.length} référence{refs.length > 1 ? 's' : ''} ajoutée{refs.length > 1 ? 's' : ''}</p>
              </div>
            )}
            {data.certifications.length > 0 && (
              <div className="bg-orange-50 rounded-lg p-3">
                <p className="font-semibold text-orange-700 mb-1">Certifications</p>
                <p>{data.certifications.join(', ')}</p>
              </div>
            )}
          </div>
          <button
            onClick={async () => {
              const supabase = createClient()
              await supabase.auth.refreshSession()
              window.location.href = '/veille'
            }}
            className="w-full py-3 bg-[#0000FF] hover:bg-[#0000CC] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Accéder à ma veille <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  const progress = Math.round((step / TOTAL_STEPS) * 100)
  const currentMeta = STEP_META[step - 1]
  const Icon = currentMeta.icon

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start p-4 pt-8">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#0000FF] text-white text-lg font-bold mb-3">A</div>
          <p className="text-xs text-gray-400">
            {isEditMode ? 'Mise à jour du profil' : 'Configuration de votre profil'} — Étape {step}/{TOTAL_STEPS}
          </p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
          {STEP_META.map((s, i) => {
            const StepIcon = s.icon
            const isActive = s.id === step
            const isDone = s.id < step
            return (
              <div key={s.id} className="flex items-center shrink-0">
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive ? 'bg-[#0000FF] text-white' :
                  isDone ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {isDone ? <CheckCircle2 className="w-3 h-3" /> : <StepIcon className="w-3 h-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEP_META.length - 1 && <div className="w-4 h-px bg-gray-200 mx-0.5 shrink-0" />}
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-1 mb-6">
          <div className="bg-[#0000FF] h-1 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-lg bg-[#F5F5FF] flex items-center justify-center">
              <Icon className="w-4 h-4 text-[#0000FF]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{getStepTitle(step)}</h2>
              {!currentMeta.required && step !== 8 && (
                <p className="text-xs text-gray-400">Optionnel — vous pouvez passer cette étape</p>
              )}
            </div>
          </div>

          {/* ── ÉTAPE 1 — Identité ── */}
          {step === 1 && (
            <div className="space-y-4">
              <WhyItMatters>
                Le SIRET permet à l'IA de retrouver toutes les données publiques de votre entreprise (forme juridique, adresse, représentant légal…) et de construire un premier profil automatiquement. Vous n'aurez qu'à vérifier et valider.
              </WhyItMatters>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    label="N° SIRET" value={data.siret}
                    onChange={v => upd('siret', v)}
                    placeholder="12345678900000"
                    hint="14 chiffres — pré-remplit les données automatiquement"
                  />
                </div>
                <button
                  onClick={lookupSiret} disabled={siretLoading || data.siret.replace(/\s/g, '').length < 9}
                  className="mt-7 flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                >
                  {siretLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Rechercher
                </button>
              </div>

              {data.siretData && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-gray-700 space-y-1">
                  <p className="font-medium text-green-700 flex items-center gap-1.5 mb-2">
                    <CheckCircle2 className="w-4 h-4" /> Données récupérées via l'Annuaire des Entreprises
                  </p>
                  {data.siretData.forme_juridique && <p>• Forme juridique : <strong>{data.siretData.forme_juridique}</strong></p>}
                  {data.siretData.adresse_siege && <p>• Adresse : <strong>{data.siretData.adresse_siege}, {data.siretData.code_postal} {data.siretData.ville}</strong></p>}
                  {(data.siretData.prenom_representant || data.siretData.nom_representant) && (
                    <p>• Représentant : <strong>{data.siretData.prenom_representant} {data.siretData.nom_representant}{data.siretData.qualite_representant ? ` (${data.siretData.qualite_representant})` : ''}</strong></p>
                  )}
                  {data.siretData.effectif_moyen && <p>• Effectif estimé : <strong>{data.siretData.effectif_moyen} personnes</strong></p>}
                </div>
              )}

              <Input label="Raison sociale" value={data.raison_sociale} onChange={v => upd('raison_sociale', v)} placeholder="ACME Consulting SAS" required />
              <Input label="Nom commercial / marque" value={data.nom_commercial} onChange={v => upd('nom_commercial', v)} placeholder="ACME (optionnel)" hint="Si différent de la raison sociale" />
            </div>
          )}

          {/* ── ÉTAPE 2 — Représentant légal ── */}
          {step === 2 && (
            <div className="space-y-4">
              <WhyItMatters>
                Les coordonnées du représentant légal sont obligatoires dans les formulaires DC1 et DC2, qui accompagnent toute candidature à un marché public. En les renseignant ici, ils seront pré-remplis automatiquement dans tous vos dossiers.
              </WhyItMatters>
              <p className="text-sm text-gray-500">Pré-rempli depuis l'Annuaire des Entreprises. Vérifiez et complétez si nécessaire.</p>
              <div className="flex gap-4">
                {['M.', 'Mme'].map(civ => (
                  <label key={civ} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={data.civilite_representant === civ} onChange={() => upd('civilite_representant', civ)} className="accent-[#0000FF]" />
                    <span className="text-sm">{civ}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Prénom" value={data.prenom_representant} onChange={v => upd('prenom_representant', v)} placeholder="Jean" />
                <Input label="Nom" value={data.nom_representant} onChange={v => upd('nom_representant', v)} placeholder="Dupont" />
                <Input label="Qualité / Fonction" value={data.qualite_representant} onChange={v => upd('qualite_representant', v)} placeholder="Gérant, Président..." />
                <Input label="Téléphone" value={data.telephone_representant} onChange={v => upd('telephone_representant', v)} type="tel" placeholder="06 00 00 00 00" />
              </div>
              <Input label="Email" value={data.email_representant} onChange={v => upd('email_representant', v)} type="email" placeholder="jean.dupont@acme.fr" />
            </div>
          )}

          {/* ── ÉTAPE 3 — Deep Research IA ── */}
          {step === 3 && (
            <div className="space-y-4">
              <WhyItMatters>
                Votre positionnement est le cœur du moteur de matching. L'IA compare ce texte à chaque appel d'offres publié pour calculer un score de pertinence. Plus votre positionnement est précis et spécifique à votre activité réelle, plus les opportunités détectées seront qualifiées.
              </WhyItMatters>
              {deepResearchLoading ? (
                <div className="text-center py-10">
                  <div className="relative w-14 h-14 mx-auto mb-5">
                    <Loader2 className="w-14 h-14 animate-spin text-[#0000FF]/15 absolute inset-0" />
                    <Loader2 className="w-14 h-14 animate-spin text-[#0000FF] absolute inset-0" style={{ animationDuration: '1.5s' }} />
                  </div>
                  <p className="text-base font-semibold text-gray-800 mb-1">Analyse IA en cours…</p>
                  <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">
                    L'IA étudie votre secteur, identifie votre positionnement et rédige votre profil stratégique.
                  </p>
                  {deepResearchCountdown > 0 && (
                    <div className="inline-flex items-center gap-2 bg-[#F5F5FF] border border-[#0000FF]/20 rounded-full px-5 py-2.5 mb-4">
                      <div className="w-2 h-2 rounded-full bg-[#0000FF] animate-pulse" />
                      <span className="text-sm text-[#0000FF] font-semibold">~{deepResearchCountdown}s restantes</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-400">Cette analyse prend 1 à 2 minutes — merci de patienter 🙏</p>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>L'IA a généré un premier positionnement basé sur votre SIRET et votre raison sociale. <strong>Vérifiez et ajustez</strong> — plus c'est précis, meilleur sera votre matching AO.</span>
                  </div>
                  {data.activite_metier === '' && data.positionnement === '' && (
                    <button onClick={runDeepResearch} className="w-full flex items-center justify-center gap-2 py-3 bg-[#0000FF] hover:bg-[#0000CC] text-white font-medium rounded-xl text-sm transition-colors">
                      <Sparkles className="w-4 h-4" /> Lancer l'analyse IA
                    </button>
                  )}
                  <Textarea label="Cœur de métier" value={data.activite_metier} onChange={v => upd('activite_metier', v)} rows={3} placeholder="Description précise de votre activité principale…" hint="200-400 caractères — ce que vous faites concrètement" />
                  <Textarea label="Positionnement stratégique" value={data.positionnement} onChange={v => upd('positionnement', v)} rows={3} placeholder="Votre philosophie, vos valeurs, ce qui guide votre approche…" />
                  <Textarea label="Atouts différenciants" value={data.atouts_differenciants} onChange={v => upd('atouts_differenciants', v)} rows={3} placeholder="Ce qui vous distingue concrètement de vos concurrents…" />
                  <Textarea label="Méthodologie type" value={data.methodologie_type} onChange={v => upd('methodologie_type', v)} rows={3} placeholder="Les grandes étapes de votre approche projet habituelle…" />
                  {(data.activite_metier || data.positionnement) && (
                    <button onClick={runDeepResearch} disabled={deepResearchLoading} className="flex items-center gap-2 text-xs text-[#0000FF] hover:underline disabled:opacity-40">
                      <Sparkles className="w-3.5 h-3.5" /> Relancer l'analyse IA
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── ÉTAPE 4 — Veille BOAMP ── */}
          {step === 4 && (
            <div className="space-y-5">
              <WhyItMatters>
                Chaque appel d'offres publié sur BOAMP est classé par codes thématiques. Ces codes sont vos filtres de veille : sans les bons codes, vous ratez des opportunités ; avec trop de codes, vous êtes noyé sous des marchés non pertinents. L'IA a pré-sélectionné les plus adaptés à votre activité — vérifiez et ajustez.
              </WhyItMatters>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span><strong>Les codes BOAMP déterminent quels appels d'offres apparaissent dans votre veille.</strong> L'IA a pré-sélectionné les plus pertinents pour votre activité. Vérifiez et ajustez — vous pourrez les modifier à tout moment dans votre profil.</span>
              </div>

              {boampLoading && (
                <div className="text-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-[#0000FF] mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Suggestion des codes en cours…</p>
                </div>
              )}

              {/* Types de marchés */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Types de marchés</label>
                <p className="text-xs text-gray-400 mb-3">Filtrez la veille sur les types de marchés qui vous correspondent.</p>
                <div className="flex gap-3">
                  {['SERVICES', 'FOURNITURES', 'TRAVAUX'].map(t => (
                    <label key={t} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${data.types_marche_filtres.includes(t) ? 'border-[#0000FF] bg-[#F5F5FF] text-[#0000FF]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={data.types_marche_filtres.includes(t)} onChange={e => upd('types_marche_filtres', e.target.checked ? [...data.types_marche_filtres, t] : data.types_marche_filtres.filter(x => x !== t))} className="hidden" />
                      {data.types_marche_filtres.includes(t) && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {t}
                    </label>
                  ))}
                </div>
              </div>

              {/* Codes BOAMP */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-semibold text-gray-700">Codes BOAMP</label>
                  {data.boamp_codes.length > 0 && (
                    <span className="text-xs bg-[#0000FF]/10 text-[#0000FF] px-2 py-0.5 rounded-full font-medium">{data.boamp_codes.length} sélectionné{data.boamp_codes.length > 1 ? 's' : ''}</span>
                  )}
                  <button onClick={runSuggestBoamp} disabled={boampLoading} className="ml-auto flex items-center gap-1 text-xs text-[#0000FF] hover:underline disabled:opacity-40">
                    <Sparkles className="w-3 h-3" /> Relancer
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-3">Chaque AO publié sur BOAMP porte un ou plusieurs de ces codes thématiques. Cochez ceux de votre domaine.</p>
                <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
                  {BOAMP_CATEGORIES.map(cat => {
                    const codes = BOAMP_CODES.filter(c => c.categorie === cat)
                    return (
                      <div key={cat}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{cat}</p>
                        <div className="space-y-1">
                          {codes.map(c => (
                            <label key={c.code} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${data.boamp_codes.includes(c.code) ? 'bg-[#F5F5FF] text-[#0000FF] border border-[#0000FF]/20' : 'hover:bg-gray-50'}`}>
                              <input type="checkbox" checked={data.boamp_codes.includes(c.code)} onChange={e => upd('boamp_codes', e.target.checked ? [...data.boamp_codes, c.code] : data.boamp_codes.filter(x => x !== c.code))} className="accent-[#0000FF]" />
                              <span className="text-xs text-gray-400 w-8 shrink-0">{c.code}</span>
                              <span>{c.libelle}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Domaines */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Domaines de compétence</label>
                <div className="flex flex-wrap gap-2">
                  {DOMAINES.map(d => (
                    <label key={d} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-xs font-medium transition-colors ${data.domaines_competence.includes(d) ? 'border-[#0000FF] bg-[#F5F5FF] text-[#0000FF]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={data.domaines_competence.includes(d)} onChange={e => upd('domaines_competence', e.target.checked ? [...data.domaines_competence, d] : data.domaines_competence.filter(x => x !== d))} className="hidden" />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 5 — Capacités ── */}
          {step === 5 && (
            <div className="space-y-5">
              <WhyItMatters>
                Certifications (Qualiopi, ISO 9001, HDS…) et moyens techniques sont systématiquement demandés dans le DC2 et la lettre de candidature. Les avoir dans votre profil évite de les ressaisir à chaque réponse et renforce votre crédibilité auprès des acheteurs publics.
              </WhyItMatters>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Certifications & labels</label>
                <div className="flex gap-2 mb-2">
                  <input
                    value={newCert} onChange={e => setNewCert(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newCert.trim()) { upd('certifications', [...data.certifications, newCert.trim()]); setNewCert('') } }}
                    placeholder="ISO 9001, Qualiopi, HDS…"
                    className="flex-1 px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0000FF]/30 focus:border-[#0000FF]"
                  />
                  <button onClick={() => { if (newCert.trim()) { upd('certifications', [...data.certifications, newCert.trim()]); setNewCert('') } }} className="px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.certifications.map((c, i) => (
                    <span key={i} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs">
                      {c}
                      <button onClick={() => upd('certifications', data.certifications.filter((_, j) => j !== i))}><X className="w-3 h-3 text-gray-400 hover:text-red-500" /></button>
                    </span>
                  ))}
                </div>
              </div>
              <Textarea label="Moyens techniques et matériels" value={data.moyens_techniques} onChange={v => upd('moyens_techniques', v)} rows={4} placeholder="Logiciels, équipements, outils spécialisés dont vous disposez…" />
            </div>
          )}

          {/* ── ÉTAPE 6 — Données financières ── */}
          {step === 6 && (
            <div className="space-y-4">
              <WhyItMatters>
                Le chiffre d'affaires et l'effectif sont obligatoires dans le DC2 — l'acheteur public les utilise pour évaluer votre capacité financière à exécuter le marché. Certains marchés fixent un CA minimum. En les renseignant ici, ils seront pré-remplis dans tous vos futurs dossiers.
              </WhyItMatters>
              <div className="grid grid-cols-2 gap-4">
                <Input label="CA N-1 (€)" value={data.ca_annee_n1} onChange={v => upd('ca_annee_n1', v)} type="number" placeholder="500000" />
                <Input label="CA N-2 (€)" value={data.ca_annee_n2} onChange={v => upd('ca_annee_n2', v)} type="number" placeholder="450000" />
                <Input label="CA N-3 (€)" value={data.ca_annee_n3} onChange={v => upd('ca_annee_n3', v)} type="number" placeholder="400000" />
                <Input label="Marge brute N-1 (€)" value={data.marge_brute} onChange={v => upd('marge_brute', v)} type="number" placeholder="250000" />
                <Input label="Effectif moyen annuel" value={data.effectif_moyen} onChange={v => upd('effectif_moyen', v)} type="number" placeholder="10" />
              </div>
            </div>
          )}

          {/* ── ÉTAPE 7 — Références ── */}
          {step === 7 && (
            <div className="space-y-4">
              <WhyItMatters>
                Les références clients sont souvent le critère n°1 évalué par les acheteurs publics. Elles prouvent votre expérience sur des marchés similaires et renforcent considérablement votre dossier de candidature. Ajoutez au moins vos 2 à 3 dernières missions les plus représentatives.
              </WhyItMatters>
              {refs.length > 0 && (
                <div className="space-y-2">
                  {refs.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="font-medium">{r.titre}</span>
                      <span className="text-gray-500">— {r.client}</span>
                      {r.annee && <span className="text-gray-400 text-xs ml-auto">{r.annee}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div className="border border-dashed border-gray-300 rounded-xl p-4 space-y-3">
                <p className="text-xs font-medium text-gray-600">Ajouter une référence</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Intitulé du marché" value={newRef.titre} onChange={v => setNewRef(r => ({ ...r, titre: v }))} placeholder="Formation IA en entreprise" required />
                  <Input label="Donneur d'ordre" value={newRef.client} onChange={v => setNewRef(r => ({ ...r, client: v }))} placeholder="Mairie de Paris" required />
                  <Input label="Domaine" value={newRef.domaine} onChange={v => setNewRef(r => ({ ...r, domaine: v }))} placeholder="Formation" />
                  <Input label="Année" value={newRef.annee} onChange={v => setNewRef(r => ({ ...r, annee: v }))} type="number" placeholder="2024" />
                </div>
                <button onClick={addRef} className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">
                  <Plus className="w-4 h-4" /> Ajouter cette référence
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 8 — Finalisation ── */}
          {step === 8 && (
            <div className="space-y-4">
              <WhyItMatters>
                En cliquant sur "Finaliser", l'IA génère votre empreinte de matching vectorielle — une signature numérique de votre activité qui permet de comparer votre profil à des milliers d'appels d'offres en quelques millisecondes. C'est ce qui rend votre veille vraiment personnalisée.
              </WhyItMatters>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Entreprise', ok: !!data.raison_sociale },
                  { label: 'Représentant légal', ok: !!(data.prenom_representant && data.nom_representant) },
                  { label: 'Positionnement IA', ok: !!(data.activite_metier || data.positionnement) },
                  { label: 'Codes BOAMP', ok: data.boamp_codes.length > 0 },
                  { label: 'Types de marchés', ok: data.types_marche_filtres.length > 0 },
                  { label: 'Références', ok: refs.length > 0 },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${item.ok ? 'bg-green-100' : 'bg-gray-100'}`}>
                      {item.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />}
                    </div>
                    <span className={item.ok ? 'text-gray-700' : 'text-gray-400'}>{item.label}</span>
                    {!item.ok && <span className="text-xs text-gray-400 ml-auto">Non renseigné</span>}
                  </div>
                ))}
              </div>
              <button
                onClick={finalize} disabled={finalizing}
                className="w-full py-3 bg-[#0000FF] hover:bg-[#0000CC] disabled:opacity-40 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {finalizing ? <><Loader2 className="w-4 h-4 animate-spin" /> Finalisation en cours…</> : <><CheckCircle2 className="w-4 h-4" /> Finaliser mon profil</>}
              </button>
            </div>
          )}

          {/* Navigation */}
          {step !== 8 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
              {step > 1 ? (
                <button onClick={() => setStep(s => s - 1)} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  ← Retour
                </button>
              ) : <div />}

              <div className="flex items-center gap-3">
                {step >= 2 && step <= 7 && !STEP_META[step - 1].required && (
                  <button onClick={() => setStep(s => s + 1)} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    Passer →
                  </button>
                )}
                <button
                  onClick={goNext}
                  disabled={!canNext()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#0000FF] hover:bg-[#0000CC] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {step === 7 ? 'Continuer' : 'Valider'} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getStepTitle(step: number): string {
  switch (step) {
    case 1: return 'Identifiez votre entreprise'
    case 2: return 'Représentant légal'
    case 3: return 'Positionnement — Analyse IA'
    case 4: return 'Configuration de la Veille BOAMP'
    case 5: return 'Capacités & certifications'
    case 6: return 'Données financières'
    case 7: return 'Références clients'
    case 8: return 'Récapitulatif & finalisation'
    default: return ''
  }
}
