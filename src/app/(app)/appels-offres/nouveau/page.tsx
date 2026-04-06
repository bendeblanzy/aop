'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/context/OrganizationContext'
import {
  Upload, Brain, FileDown, Eye, ChevronRight, ChevronLeft, Loader2,
  X, File, AlertCircle, CheckCircle2, Plus, Copy, ExternalLink,
  AlertTriangle, Building2, ClipboardList, FileText, Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadFileToStorage } from '@/lib/upload'
import { detectPlatform, getDefaultPlatform } from '@/lib/platforms'
import type { AnalyseRC, AnalyseCCTP, Reference, Collaborateur } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

type DocType = 'dc1' | 'dc2' | 'dc4' | 'dume' | 'memoire_technique'

const docLabels: Record<DocType, string> = {
  dc1: 'DC1 — Lettre de candidature',
  dc2: 'DC2 — Déclaration du candidat',
  dc4: 'DC4 — Déclaration de sous-traitance',
  dume: 'DUME — Document Unique Européen',
  memoire_technique: 'Mémoire technique',
}

// ── Stepper config ───────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Appel d'offres", icon: ClipboardList },
  { id: 2, label: 'Plateforme',     icon: Building2 },
  { id: 3, label: 'Dossier (DCE)', icon: FileText },
  { id: 4, label: 'Import',         icon: Upload },
  { id: 5, label: 'Analyse',        icon: Brain },
  { id: 6, label: 'Candidature',    icon: FileDown },
  { id: 7, label: 'Offre',          icon: Send },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectFileType(name: string): 'rc' | 'cctp' | 'avis' | 'autre' {
  const n = name.toLowerCase().replace(/\.[^.]+$/, '')
  const words = n.split(/[\s\-_./\\]+/)
  if (words.includes('rc') || n.includes('reglement') || n.includes('règlement') || n.includes('consultation')) return 'rc'
  if (words.includes('cctp') || n.includes('cahier des charges') || n.includes('technique') || n.includes('prescriptions')) return 'cctp'
  if (words.includes('ccap')) return 'cctp' // on regroupe CCAP comme "autre cahier" détecté
  if (words.includes('avis') || n.includes('avis de marche') || n.includes('annonce')) return 'avis'
  return 'autre'
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Stepper horizontal cliquable */
function Stepper({ step, maxReached, goTo }: { step: number; maxReached: number; goTo: (n: number) => void }) {
  return (
    <div className="bg-white rounded-xl border border-border px-6 py-4 mb-6 overflow-x-auto">
      <div className="flex items-start justify-between min-w-[640px] relative">
        {/* ligne de fond */}
        <div className="absolute top-4 left-8 right-8 h-0.5 bg-border z-0" />
        {STEPS.map((s) => {
          const done = s.id < step
          const active = s.id === step
          const clickable = s.id <= maxReached
          return (
            <button
              key={s.id}
              onClick={() => clickable && goTo(s.id)}
              disabled={!clickable}
              className={cn(
                'flex flex-col items-center gap-1.5 z-10 flex-1 group',
                clickable ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
                done  ? 'bg-secondary text-white' :
                active ? 'bg-primary text-white ring-4 ring-primary/20' :
                'bg-border text-text-secondary',
                clickable && !active && !done ? 'group-hover:scale-110' : '',
              )}>
                {done ? '✓' : s.id}
              </div>
              <span className={cn(
                'text-[11px] text-center leading-tight max-w-[72px]',
                done   ? 'text-secondary font-medium' :
                active ? 'text-primary font-semibold' :
                'text-text-secondary',
              )}>{s.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Alerte de suivi des modifications — affichée dès l'étape 1 */
function AlertModifications({ hasAccount }: { hasAccount: boolean }) {
  if (hasAccount) {
    return (
      <div className="flex gap-3 bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-green-600" />
        <div>
          <strong>Suivi automatique activé</strong><br />
          En vous identifiant sur la plateforme, vous recevrez automatiquement les modifications du dossier, les réponses aux questions des candidats et les reports de date limite.
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
      <div>
        <strong>Suivi des modifications</strong><br />
        L&apos;acheteur peut modifier le dossier à tout moment avant la date limite. Pour recevoir ces modifications automatiquement, nous vous guiderons pour vous inscrire sur la plateforme source.
      </div>
    </div>
  )
}

/** Bouton copier URL */
function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="shrink-0 flex items-center gap-1.5 bg-border hover:bg-border/70 text-text-primary rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copié !' : 'Copier'}
    </button>
  )
}

// ── Main page (inner) ─────────────────────────────────────────────────────────

function NouvelAOPageInner() {
  const router = useRouter()
  const { orgId } = useOrganization()
  const searchParams = useSearchParams()

  // ── Navigation état ──
  const [step, setStep] = useState(1)
  const [maxReached, setMaxReached] = useState(1)

  function goTo(n: number) {
    if (n < 1 || n > 7) return
    setStep(n)
    if (n > maxReached) setMaxReached(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Étape 1 — Résumé AO ──
  const [titre, setTitre] = useState('')
  const [acheteur, setAcheteur] = useState('')
  const [referencemarche, setReferencemarche] = useState('')
  const [dateLimite, setDateLimite] = useState('')
  const [boampIdweb, setBoampIdweb] = useState('')
  const [boampUrl, setBoampUrl] = useState('')
  const [aoId, setAoId] = useState<string | null>(null)
  const [creatingAO, setCreatingAO] = useState(false)

  // Pré-remplissage depuis query params (depuis la Veille)
  useEffect(() => {
    const t = searchParams.get('titre')
    const a = searchParams.get('acheteur')
    const d = searchParams.get('deadline')
    const idweb = searchParams.get('boamp_idweb')
    const url = searchParams.get('boamp_url')
    if (t) setTitre(t)
    if (a) setAcheteur(a)
    if (d) setDateLimite(d.includes('T') ? d.slice(0, 16) : `${d}T00:00`)
    if (idweb) { setBoampIdweb(idweb); setReferencemarche(idweb) }
    if (url) setBoampUrl(url)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Crée l'AO en base lors du passage étape 1→2 */
  async function handleConfirmAO() {
    if (!titre.trim()) return alert("Veuillez saisir un titre pour cet appel d'offres")
    if (!orgId) return alert('Organisation non chargée, veuillez réessayer.')
    if (aoId) { goTo(2); return } // déjà créé

    setCreatingAO(true)
    try {
      const supabase = createClient()
      const boampNote = boampUrl
        ? `Annonce BOAMP : ${boampUrl}${boampIdweb ? ` (réf. ${boampIdweb})` : ''}`
        : boampIdweb ? `Référence BOAMP : ${boampIdweb}` : null

      const { data: ao, error } = await supabase.from('appels_offres').insert({
        organization_id: orgId,
        titre,
        acheteur: acheteur || null,
        reference_marche: referencemarche || null,
        date_limite_reponse: dateLimite || null,
        statut: 'en_cours',
        ...(boampNote ? { notes_utilisateur: boampNote } : {}),
      }).select().single()

      if (error || !ao) { alert("Erreur lors de la création de l'AO : " + error?.message); return }
      setAoId(ao.id)
      goTo(2)
    } finally {
      setCreatingAO(false)
    }
  }

  // ── Étape 2 — Plateforme ──
  const platform = detectPlatform(boampUrl) ?? getDefaultPlatform()
  const [accountStatus, setAccountStatus] = useState<'has_account' | 'create' | null>(null)

  // ── Étape 3 — Téléchargement DCE ──
  // (pas d'état spécifique, utilise platform + boampUrl)

  // ── Étape 4 — Import ──
  const [files, setFiles] = useState<{ file: File; type: 'rc' | 'cctp' | 'avis' | 'autre' }[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<{ nom: string; url: string; type: string; taille: number }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' ||
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.type === 'application/msword' ||
      f.name.endsWith('.pdf') || f.name.endsWith('.docx') || f.name.endsWith('.doc') || f.name.endsWith('.xlsx') || f.name.endsWith('.zip'),
    )
    if (!dropped.length) return
    setFiles(prev => [...prev, ...dropped.map(f => ({ file: f, type: detectFileType(f.name) }))])
  }

  async function handleUpload() {
    if (!aoId) return
    if (!files.length) return alert('Ajoutez au moins un document avant de continuer.')
    setUploading(true)
    try {
      const uploaded: { nom: string; url: string; type: string; taille: number }[] = []
      const failed: string[] = []
      for (const { file, type } of files) {
        try {
          const { url } = await uploadFileToStorage(file, aoId)
          uploaded.push({ nom: file.name, url, type, taille: file.size })
        } catch (err) {
          console.error('[upload]', file.name, err)
          failed.push(file.name)
        }
      }
      if (failed.length) alert(`⚠️ ${failed.length} fichier(s) non uploadés :\n${failed.join('\n')}`)
      setUploadedFiles(uploaded)
      const supabase = createClient()
      await supabase.from('appels_offres').update({ fichiers_source: uploaded }).eq('id', aoId)
      goTo(5)
    } finally {
      setUploading(false)
    }
  }

  // ── Étape 5 — Analyse IA ──
  const [analyseRC, setAnalyseRC] = useState<AnalyseRC | null>(null)
  const [analyseCCTP, setAnalyseCCTP] = useState<AnalyseCCTP | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [analyseError, setAnalyseError] = useState('')
  const [alertModif, setAlertModif] = useState(true)
  const [alertQR, setAlertQR] = useState(true)
  const [alertRappel, setAlertRappel] = useState(true)

  async function handleAnalyse() {
    if (!aoId) return
    setAnalysing(true)
    setAnalyseError('')
    try {
      const rcFile = uploadedFiles.find(f => f.type === 'rc')
      const cctpFile = uploadedFiles.find(f => f.type === 'cctp')
      let rc = null; let cctp = null

      if (rcFile) {
        try {
          const res = await fetch('/api/ai/analyze-rc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ao_id: aoId, file_url: rcFile.url }) })
          if (res.ok) rc = (await res.json()).analyse
          else setAnalyseError(`Analyse RC échouée : ${(await res.json().catch(() => ({}))).error || res.statusText}`)
        } catch (e) { console.error(e); setAnalyseError("Impossible d'analyser le RC.") }
      }
      if (cctpFile) {
        try {
          const res = await fetch('/api/ai/analyze-cctp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ao_id: aoId, file_url: cctpFile.url }) })
          if (res.ok) cctp = (await res.json()).analyse
        } catch (e) { console.error(e) }
      }
      if (!rc && !cctp && !rcFile && !cctpFile) {
        setAnalyseError('Aucun fichier RC ou CCTP trouvé. Uploadez au moins un de ces documents.')
        return
      }
      setAnalyseRC(rc)
      setAnalyseCCTP(cctp)

      // Charger refs + collabs pour l'étape 6
      const supabase = createClient()
      const [{ data: refs }, { data: cols }] = await Promise.all([
        supabase.from('references').select('*').order('annee', { ascending: false }),
        supabase.from('collaborateurs').select('*').order('nom'),
      ])
      setReferences(refs || [])
      setCollaborateurs(cols || [])
      goTo(6)
    } finally {
      setAnalysing(false)
    }
  }

  // ── Étape 6 — Candidature ──
  const [references, setReferences] = useState<Reference[]>([])
  const [collaborateurs, setCollaborateurs] = useState<Collaborateur[]>([])
  const [selectedRefs, setSelectedRefs] = useState<string[]>([])
  const [selectedCollabs, setSelectedCollabs] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [newCollab, setNewCollab] = useState({ prenom: '', nom: '', poste: '' })
  const [addingCollab, setAddingCollab] = useState(false)
  const [docsToGenerate, setDocsToGenerate] = useState<DocType[]>(['dc1', 'dc2', 'dume', 'memoire_technique'])
  const [generating, setGenerating] = useState(false)
  const [generatedDocs, setGeneratedDocs] = useState<{ type: DocType; url: string; nom: string }[]>([])
  const [genError, setGenError] = useState('')

  async function addCollab() {
    if (!newCollab.nom.trim() || !orgId) return
    setAddingCollab(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('collaborateurs').insert({
      organization_id: orgId,
      prenom: newCollab.prenom.trim(),
      nom: newCollab.nom.trim(),
      poste: newCollab.poste.trim() || null,
    }).select().single()
    if (!error && data) {
      setCollaborateurs(prev => [...prev, data])
      setSelectedCollabs(prev => [...prev, data.id])
      setNewCollab({ prenom: '', nom: '', poste: '' })
    }
    setAddingCollab(false)
  }

  async function handleSaveAndGenerate() {
    if (!aoId) return
    setGenerating(true)
    setGenError('')
    const supabase = createClient()
    await supabase.from('appels_offres').update({
      references_selectionnees: selectedRefs,
      collaborateurs_selectionnes: selectedCollabs,
      notes_utilisateur: notes,
      statut: 'analyse',
    }).eq('id', aoId)

    const docs: { type: DocType; url: string; nom: string }[] = []
    for (const docType of docsToGenerate) {
      const res = await fetch(`/api/ai/generate-${docType === 'memoire_technique' ? 'memoire' : docType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ao_id: aoId, format: 'docx' }),
      })
      if (res.ok) {
        const data = await res.json()
        docs.push({ type: docType, url: data.url, nom: data.nom })
      }
    }
    if (!docs.length) {
      setGenError('Erreur lors de la génération des documents. Vérifiez votre clé API Anthropic.')
      setGenerating(false)
      return
    }
    setGeneratedDocs(docs)
    await supabase.from('appels_offres').update({
      statut: 'genere',
      documents_generes: docs.map(d => ({ type: d.type, url: d.url, version: 1, genere_le: new Date().toISOString() })),
    }).eq('id', aoId)
    setGenerating(false)
    goTo(7)
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Répondre à un appel d&apos;offres</h1>
        <p className="text-text-secondary mt-1 text-sm">
          {titre || 'Suivez les étapes pour récupérer le DCE et préparer votre réponse'}
        </p>
      </div>

      {/* Stepper */}
      <Stepper step={step} maxReached={maxReached} goTo={goTo} />

      {/* ════════════════════════════════════════════════════════════
          ÉTAPE 1 — Résumé de l'appel d'offres
          ════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-border p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Appel d&apos;offres identifié</h2>
            <p className="text-text-secondary text-sm mt-0.5">Vérifiez les informations et confirmez pour lancer le processus.</p>
          </div>

          {/* Fiche AO */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Titre *</label>
              <input
                value={titre}
                onChange={e => setTitre(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="Ex: Prestations de communication pour l'Anah"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Acheteur</label>
                <input
                  value={acheteur}
                  onChange={e => setAcheteur(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Ex: Anah"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Référence</label>
                <input
                  value={referencemarche}
                  onChange={e => setReferencemarche(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Ex: 26-33435"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Date limite</label>
                <input
                  type="datetime-local"
                  value={dateLimite}
                  onChange={e => setDateLimite(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Source BOAMP</label>
                <input
                  value={boampUrl}
                  onChange={e => setBoampUrl(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="https://www.boamp.fr/..."
                />
              </div>
            </div>
          </div>

          <AlertModifications hasAccount={false} />

          <div className="flex justify-end">
            <button
              onClick={handleConfirmAO}
              disabled={creatingAO || !titre.trim()}
              className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {creatingAO ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {creatingAO ? 'Création...' : 'Je veux répondre — Récupérer le DCE →'}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ÉTAPE 2 — Détection de la plateforme
          ════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-border p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Accédez à la plateforme</h2>
              <p className="text-text-secondary text-sm mt-0.5">Le dossier de consultation est hébergé sur la plateforme suivante.</p>
            </div>

            {/* Badge plateforme */}
            <div className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-3">
              <div className="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {platform.initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-text-primary">{platform.name}</div>
                <div className="text-xs text-text-secondary truncate">{platform.fullName}</div>
              </div>
              {platform.allowsAnonymous ? (
                <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold whitespace-nowrap">Accès anonyme OK</span>
              ) : (
                <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold whitespace-nowrap">Compte gratuit requis</span>
              )}
            </div>

            {/* Choix */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setAccountStatus('has_account')}
                className={cn(
                  'border-2 rounded-xl p-4 text-center transition-all',
                  accountStatus === 'has_account'
                    ? 'border-primary bg-primary-light'
                    : 'border-border hover:border-primary hover:bg-primary-light/50',
                )}
              >
                <div className="text-2xl mb-1.5">🔑</div>
                <div className="font-semibold text-sm text-text-primary">J&apos;ai déjà un compte</div>
                <div className="text-xs text-text-secondary mt-0.5">Je peux me connecter directement</div>
              </button>
              <button
                onClick={() => setAccountStatus('create')}
                className={cn(
                  'border-2 rounded-xl p-4 text-center transition-all',
                  accountStatus === 'create'
                    ? 'border-primary bg-primary-light'
                    : 'border-border hover:border-primary hover:bg-primary-light/50',
                )}
              >
                <div className="text-2xl mb-1.5">📝</div>
                <div className="font-semibold text-sm text-text-primary">Créer un compte</div>
                <div className="text-xs text-text-secondary mt-0.5">Inscription gratuite, ~3 min</div>
              </button>
            </div>

            {/* Si accès anonyme possible */}
            {platform.allowsAnonymous && (
              <div className="flex gap-3 bg-primary-light border border-primary/20 rounded-lg p-4 text-sm text-primary">
                <span className="text-base shrink-0">ℹ️</span>
                <div>
                  <strong>Accès anonyme disponible</strong><br />
                  Cette plateforme permet de télécharger le DCE sans compte. Vous ne recevrez cependant pas les modifications éventuelles du dossier.
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => goTo(1)} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm">
                <ChevronLeft className="w-4 h-4" /> Retour
              </button>
              <button
                onClick={() => goTo(3)}
                disabled={!accountStatus}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Continuer <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Aide à la création de compte */}
          {accountStatus === 'create' && (
            <div className="bg-white rounded-xl border border-border p-6 space-y-4">
              <h2 className="text-base font-semibold text-text-primary">Créer un compte en 3 min</h2>
              <p className="text-text-secondary text-sm">L&apos;inscription est gratuite. Voici les informations nécessaires.</p>
              <ul className="space-y-2">
                {[
                  { icon: '✓', label: 'SIRET de l\'entreprise', status: 'Requis', color: 'text-secondary' },
                  { icon: '✓', label: 'Email professionnel', status: 'Pré-rempli', color: 'text-secondary' },
                  { icon: '○', label: 'Mot de passe à créer', status: 'À définir', color: 'text-text-secondary' },
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm py-2 border-b border-border last:border-0">
                    <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0', i < 2 ? 'bg-green-100 text-green-700' : 'bg-border text-text-secondary')}>{item.icon}</span>
                    <span className="flex-1 text-text-primary">{item.label}</span>
                    <span className={cn('text-xs font-semibold', item.color)}>{item.status}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2.5">
                <span className="text-xs text-text-secondary font-mono flex-1 truncate">{platform.registerUrl}</span>
                <CopyButton url={platform.registerUrl} />
                <a
                  href={platform.registerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 bg-secondary hover:bg-secondary/90 text-white rounded-md px-3 py-1.5 text-xs font-medium"
                >
                  S&apos;inscrire <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex gap-3 bg-primary-light border border-primary/20 rounded-lg p-3.5 text-sm text-primary">
                <span className="text-base shrink-0">💡</span>
                <div>Ouvrez ce lien dans un nouvel onglet, créez votre compte, puis revenez ici. Ce compte servira pour tous les futurs marchés.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ÉTAPE 3 — Télécharger le DCE
          ════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-border p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Téléchargez le dossier de consultation</h2>
            <p className="text-text-secondary text-sm mt-0.5">Suivez ces étapes puis revenez ici avec les fichiers téléchargés.</p>
          </div>

          {/* Instructions numérotées */}
          <ol className="space-y-0 divide-y divide-border">
            {[
              {
                title: 'Connectez-vous sur la plateforme',
                desc: 'Utilisez vos identifiants (email + mot de passe).',
                link: platform.loginUrl,
                linkLabel: 'Se connecter ↗',
                linkVariant: 'primary' as const,
              },
              {
                title: 'Accédez à la consultation via le lien ci-dessous',
                desc: 'Vous arriverez directement sur la fiche du marché.',
              },
              {
                title: 'Cliquez sur « Retirer le dossier » ou « Télécharger le DCE »',
                desc: 'Le libellé varie selon les plateformes. Cherchez un bouton bien visible sur la page.',
              },
              {
                title: 'Téléchargez l\'ensemble des fichiers',
                desc: 'Préférez le téléchargement complet (ZIP) si l\'option est proposée.',
              },
            ].map((item, i) => (
              <li key={i} className="flex gap-3.5 py-4 first:pt-0 last:pb-0">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary-light text-primary flex items-center justify-center text-xs font-bold mt-0.5">{i + 1}</span>
                <div className="flex-1 space-y-1.5">
                  <strong className="text-sm text-text-primary">{item.title}</strong>
                  <p className="text-xs text-text-secondary">{item.desc}</p>
                  {item.link && (
                    <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 mt-1.5">
                      <span className="text-xs text-text-secondary font-mono flex-1 truncate">{item.link}</span>
                      <a href={item.link} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white rounded-md px-3 py-1.5 text-xs font-medium">
                        {item.linkLabel} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Séparateur + lien direct vers la consultation */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Lien direct vers la consultation</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex items-center gap-2 border-2 border-primary bg-primary-light rounded-lg px-4 py-3">
            <span className="text-xs text-primary font-mono flex-1 truncate break-all">{boampUrl || platform.baseUrl}</span>
            <CopyButton url={boampUrl || platform.baseUrl} />
            <a
              href={boampUrl || platform.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 bg-secondary hover:bg-secondary/90 text-white rounded-md px-3 py-1.5 text-xs font-medium"
            >
              Ouvrir <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <AlertModifications hasAccount={accountStatus === 'has_account'} />

          <div className="flex justify-between">
            <button onClick={() => goTo(2)} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm">
              <ChevronLeft className="w-4 h-4" /> Retour
            </button>
            <button
              onClick={() => goTo(4)}
              className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
            >
              J&apos;ai téléchargé les fichiers <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ÉTAPE 4 — Import + reconnaissance auto
          ════════════════════════════════════════════════════════════ */}
      {step === 4 && (
        <div className="bg-white rounded-xl border border-border p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Importez les documents</h2>
            <p className="text-text-secondary text-sm mt-0.5">Déposez les fichiers téléchargés. Nous identifierons automatiquement chaque pièce du dossier.</p>
          </div>

          {/* Zone de drop */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
            onDragEnter={e => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={e => { e.preventDefault(); setIsDragOver(false) }}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl py-10 transition-colors',
              isDragOver ? 'border-primary bg-primary-light/50' : 'border-border hover:border-primary hover:bg-primary-light/30',
            )}
          >
            <label className="flex flex-col items-center cursor-pointer gap-2">
              <Upload className={cn('w-9 h-9', isDragOver ? 'text-primary' : 'text-text-secondary')} />
              <span className={cn('text-sm font-medium', isDragOver ? 'text-primary' : 'text-text-secondary')}>
                {isDragOver ? 'Relâchez pour ajouter les fichiers' : 'Glissez vos fichiers ici ou cliquez pour sélectionner'}
              </span>
              <span className="text-xs text-text-secondary">ZIP, PDF, DOCX, XLS — 100 Mo max</span>
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.xlsx,.xls,.zip"
                onChange={e => {
                  const added = Array.from(e.target.files || [])
                  setFiles(prev => [...prev, ...added.map(f => ({ file: f, type: detectFileType(f.name) }))])
                }}
                className="hidden"
              />
            </label>
          </div>

          {/* Liste des fichiers */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f, i) => {
                const ext = f.file.name.split('.').pop()?.toUpperCase() ?? '?'
                const extColor = ext === 'PDF' ? 'bg-red-100 text-red-700' : ext === 'XLSX' || ext === 'XLS' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                return (
                  <div key={i} className="flex items-center gap-3 border border-border rounded-lg px-4 py-2.5">
                    <span className={cn('w-9 h-9 rounded-md flex items-center justify-center text-xs font-bold shrink-0', extColor)}>{ext}</span>
                    <span className="text-sm text-text-primary flex-1 truncate">{f.file.name}</span>
                    <span className="text-xs text-text-secondary shrink-0">{(f.file.size / 1024).toFixed(0)} Ko</span>
                    <select
                      value={f.type}
                      onChange={e => {
                        const updated = [...files]
                        updated[i].type = e.target.value as 'rc' | 'cctp' | 'avis' | 'autre'
                        setFiles(updated)
                      }}
                      className="text-xs border border-border rounded px-2 py-1 bg-white"
                    >
                      <option value="rc">RC</option>
                      <option value="cctp">CCTP</option>
                      <option value="avis">Avis</option>
                      <option value="autre">Autre</option>
                    </select>
                    {f.type !== 'autre' && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">{f.type.toUpperCase()}</span>
                    )}
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-text-secondary hover:text-danger ml-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
              <div className="flex gap-3 bg-green-50 border border-green-200 rounded-lg p-3.5 text-sm text-green-800">
                <span className="text-base shrink-0">🤖</span>
                <div><strong>{files.length} document{files.length > 1 ? 's' : ''} identifié{files.length > 1 ? 's' : ''} automatiquement.</strong> Vérifiez les classifications avant de continuer.</div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => goTo(3)} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm">
              <ChevronLeft className="w-4 h-4" /> Retour
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !files.length}
              className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {uploading ? 'Envoi en cours...' : 'Lancer l\'analyse →'}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ÉTAPE 5 — Analyse IA + alertes
          ════════════════════════════════════════════════════════════ */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-border p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Analyse du dossier</h2>
              <p className="text-text-secondary text-sm mt-0.5">Notre IA va extraire les informations clés du RC et du CCTP.</p>
            </div>

            {/* Fichiers uploadés */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-sm text-text-primary flex-1 truncate">{f.nom}</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">{f.type.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            )}

            {analyseError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                <span className="text-sm text-danger">{analyseError}</span>
              </div>
            )}

            {/* Résultats si analyse déjà faite */}
            {analyseRC && (
              <div className="bg-surface rounded-xl p-5 space-y-3">
                <h3 className="font-semibold text-text-primary text-sm">Résultats — Règlement de Consultation</h3>
                {analyseRC.objet && (
                  <div>
                    <span className="text-xs font-medium text-text-secondary uppercase">Objet</span>
                    <p className="text-sm text-text-primary mt-0.5">{analyseRC.objet}</p>
                  </div>
                )}
                {Array.isArray(analyseRC.criteres_notation) && analyseRC.criteres_notation.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-text-secondary uppercase">Critères de notation</span>
                    <div className="mt-1.5 space-y-1">
                      {analyseRC.criteres_notation.map((c, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-text-primary">{c.critere}</span>
                          <span className="font-semibold text-primary">{c.ponderation_pourcentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(analyseRC.pieces_exigees) && analyseRC.pieces_exigees.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-text-secondary uppercase">Pièces exigées</span>
                    <ul className="mt-1 space-y-0.5">
                      {analyseRC.pieces_exigees.map((p, i) => (
                        <li key={i} className="text-sm text-text-primary flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-secondary shrink-0" />{p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => goTo(4)} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm">
                <ChevronLeft className="w-4 h-4" /> Retour
              </button>
              <button
                onClick={handleAnalyse}
                disabled={analysing}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {analysing ? 'Analyse en cours...' : analyseRC ? 'Continuer →' : 'Lancer l\'analyse IA →'}
              </button>
            </div>
          </div>

          {/* Suivi & alertes */}
          <div className="bg-white rounded-xl border border-border p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Suivi de la consultation</h2>
              <p className="text-text-secondary text-sm mt-0.5">Activez les alertes pour ne rien manquer jusqu&apos;à la date limite.</p>
            </div>
            {[
              { label: 'Modification du DCE', sub: "Alerte si l'acheteur modifie un document", state: alertModif, setState: setAlertModif },
              { label: 'Questions / Réponses', sub: "Notification quand l'acheteur publie des réponses", state: alertQR, setState: setAlertQR },
              { label: 'Rappel date limite', sub: dateLimite ? `Rappel à J-7 et J-2 avant le ${formatDate(dateLimite)}` : 'Rappel à J-7 et J-2 avant la date limite', state: alertRappel, setState: setAlertRappel },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between bg-surface rounded-lg px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{item.label}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{item.sub}</div>
                </div>
                <button
                  onClick={() => item.setState(!item.state)}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors relative shrink-0 ml-4',
                    item.state ? 'bg-primary' : 'bg-border',
                  )}
                >
                  <span className={cn(
                    'block w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform',
                    item.state ? 'translate-x-5' : 'translate-x-0.5',
                  )} />
                </button>
              </div>
            ))}
            {accountStatus !== 'has_account' && (
              <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong>Vérification recommandée</strong><br />
                  Si vous n&apos;avez pas de compte sur la plateforme source, pensez à revérifier le dossier avant la date limite pour vous assurer qu&apos;aucune modification n&apos;a été publiée.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ÉTAPE 6 — Candidature (DC1 / DC2 / DUME)
          ════════════════════════════════════════════════════════════ */}
      {step === 6 && (
        <div className="bg-white rounded-xl border border-border p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Dossier de candidature</h2>
            <p className="text-text-secondary text-sm mt-0.5">Vos formulaires administratifs seront générés automatiquement à partir de votre profil entreprise.</p>
          </div>

          {/* Documents à générer */}
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Documents à générer</label>
            <div className="space-y-2">
              {(Object.keys(docLabels) as DocType[]).map(type => (
                <label key={type} className={cn(
                  'flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer transition-colors',
                  docsToGenerate.includes(type) ? 'border-primary bg-primary-light' : 'border-border hover:border-primary/50',
                )}>
                  <input
                    type="checkbox"
                    checked={docsToGenerate.includes(type)}
                    onChange={e => setDocsToGenerate(prev => e.target.checked ? [...prev, type] : prev.filter(d => d !== type))}
                    className="w-4 h-4 accent-primary shrink-0"
                  />
                  <span className="text-sm font-medium text-text-primary">{docLabels[type]}</span>
                  {docsToGenerate.includes(type) && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                </label>
              ))}
            </div>
          </div>

          {/* Références */}
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
              Références similaires ({selectedRefs.length} sélectionnée{selectedRefs.length > 1 ? 's' : ''})
            </label>
            {references.length === 0 ? (
              <p className="text-sm text-text-secondary italic">Aucune référence dans votre profil. Ajoutez-en dans la section Références.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {references.map(r => (
                  <label key={r.id} className={cn(
                    'flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer transition-colors',
                    selectedRefs.includes(r.id) ? 'border-primary bg-primary-light' : 'border-border hover:border-primary/50',
                  )}>
                    <input
                      type="checkbox"
                      checked={selectedRefs.includes(r.id)}
                      onChange={e => setSelectedRefs(prev => e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id))}
                      className="w-4 h-4 accent-primary shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">{r.titre}</div>
                      <div className="text-xs text-text-secondary">{r.client} {r.annee ? `— ${r.annee}` : ''}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Collaborateurs */}
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
              Collaborateurs mobilisés ({selectedCollabs.length} sélectionné{selectedCollabs.length > 1 ? 's' : ''})
            </label>
            {collaborateurs.length === 0 ? (
              <p className="text-sm text-text-secondary italic">Aucun collaborateur dans votre profil.</p>
            ) : (
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {collaborateurs.map(c => (
                  <label key={c.id} className={cn(
                    'flex items-center gap-3 border rounded-lg px-4 py-2.5 cursor-pointer transition-colors',
                    selectedCollabs.includes(c.id) ? 'border-primary bg-primary-light' : 'border-border hover:border-primary/50',
                  )}>
                    <input
                      type="checkbox"
                      checked={selectedCollabs.includes(c.id)}
                      onChange={e => setSelectedCollabs(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))}
                      className="w-4 h-4 accent-primary shrink-0"
                    />
                    <span className="text-sm text-text-primary">{c.prenom} {c.nom}</span>
                    {c.poste && <span className="text-xs text-text-secondary ml-1">— {c.poste}</span>}
                  </label>
                ))}
              </div>
            )}
            {/* Ajouter collaborateur */}
            <div className="mt-3 flex gap-2">
              <input value={newCollab.prenom} onChange={e => setNewCollab(p => ({ ...p, prenom: e.target.value }))} placeholder="Prénom" className="border border-border rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:border-primary" />
              <input value={newCollab.nom} onChange={e => setNewCollab(p => ({ ...p, nom: e.target.value }))} placeholder="Nom *" className="border border-border rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:border-primary" />
              <input value={newCollab.poste} onChange={e => setNewCollab(p => ({ ...p, poste: e.target.value }))} placeholder="Poste" className="border border-border rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:border-primary" />
              <button onClick={addCollab} disabled={addingCollab || !newCollab.nom.trim()} className="flex items-center gap-1.5 bg-surface border border-border hover:border-primary rounded-lg px-3 py-2 text-sm font-medium text-text-primary transition-colors disabled:opacity-50">
                {addingCollab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Notes (contexte, points d&apos;attention)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              placeholder="Ex: Marché stratégique — insister sur nos références Anah précédentes..."
            />
          </div>

          {genError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
              <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
              <span className="text-sm text-danger">{genError}</span>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => goTo(5)} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm">
              <ChevronLeft className="w-4 h-4" /> Retour
            </button>
            <button
              onClick={handleSaveAndGenerate}
              disabled={generating || !docsToGenerate.length}
              className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {generating ? 'Génération en cours...' : 'Générer les documents →'}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ÉTAPE 7 — Offre + téléchargement
          ════════════════════════════════════════════════════════════ */}
      {step === 7 && (
        <div className="space-y-4">
          {generatedDocs.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Documents générés</h2>
                <p className="text-text-secondary text-sm mt-0.5">Téléchargez et vérifiez chaque document avant soumission.</p>
              </div>
              <div className="space-y-2">
                {generatedDocs.map((doc, i) => (
                  <div key={i} className="flex items-center gap-3 border border-border rounded-lg px-4 py-3">
                    <CheckCircle2 className="w-5 h-5 text-secondary shrink-0" />
                    <span className="flex-1 text-sm font-medium text-text-primary">{docLabels[doc.type]}</span>
                    <a
                      href={doc.url}
                      download={doc.nom}
                      className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white rounded-md px-4 py-2 text-xs font-semibold transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Télécharger
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Récapitulatif offre */}
          <div className="bg-white rounded-xl border border-border p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Offre technique et financière</h2>
              <p className="text-text-secondary text-sm mt-0.5">Dernière étape avant la soumission.</p>
            </div>

            <div className="space-y-3">
              {[
                { icon: '📋', label: 'Mémoire technique', sub: 'Structure proposée à partir des critères du RC', status: 'À rédiger', statusColor: 'text-warning bg-amber-50 border-amber-200' },
                { icon: '💰', label: 'Offre financière (BPU)', sub: 'Pré-rempli à partir de vos tarifs habituels — à ajuster', status: 'À chiffrer', statusColor: 'text-warning bg-amber-50 border-amber-200' },
                { icon: '✍️', label: "Acte d'engagement", sub: 'À signer électroniquement avant soumission', status: 'Après chiffrage', statusColor: 'text-text-secondary bg-surface border-border' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 bg-surface rounded-lg px-4 py-3.5">
                  <span className="text-xl shrink-0">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary">{item.label}</div>
                    <div className="text-xs text-text-secondary mt-0.5">{item.sub}</div>
                  </div>
                  <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0', item.statusColor)}>{item.status}</span>
                </div>
              ))}
            </div>

            {/* Résumé final */}
            <div className="border-2 border-primary rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-text-primary text-sm">Réponse à l&apos;AO — {titre || 'Sans titre'}</h3>
                <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">En cours</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <span className="text-text-secondary">Date limite</span>
                <span className={cn('font-semibold', dateLimite ? 'text-danger' : 'text-text-secondary')}>{dateLimite ? formatDate(dateLimite) : '—'}</span>
                <span className="text-text-secondary">Candidature</span>
                <span className="text-secondary font-semibold">{generatedDocs.length} document{generatedDocs.length > 1 ? 's' : ''} générés</span>
                <span className="text-text-secondary">Mémoire technique</span>
                <span className="text-warning font-semibold">À rédiger</span>
                <span className="text-text-secondary">Offre financière</span>
                <span className="text-warning font-semibold">À chiffrer</span>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => goTo(6)} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm">
                <ChevronLeft className="w-4 h-4" /> Retour
              </button>
              <button
                onClick={() => aoId && router.push(`/appels-offres/${aoId}`)}
                className="flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
              >
                <Eye className="w-4 h-4" /> Voir le dossier complet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function NouvelAOPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <NouvelAOPageInner />
    </Suspense>
  )
}
