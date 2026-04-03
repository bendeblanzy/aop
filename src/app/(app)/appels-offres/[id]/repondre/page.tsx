'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/context/OrganizationContext'
import {
  Upload, Brain, CheckSquare, FileDown, Eye,
  ChevronRight, ChevronLeft, Loader2, X, File,
  AlertCircle, CheckCircle2, Plus, RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppelOffre, AnalyseRC, AnalyseCCTP, Reference, Collaborateur } from '@/lib/types'
import Link from 'next/link'

const STEPS = [
  { id: 1, label: 'Documents', icon: Upload },
  { id: 2, label: 'Analyse IA', icon: Brain },
  { id: 3, label: 'Sélection', icon: CheckSquare },
  { id: 4, label: 'Génération', icon: FileDown },
  { id: 5, label: 'Téléchargement', icon: Eye },
]

type DocType = 'dc1' | 'dc2' | 'dc4' | 'dume' | 'memoire_technique'
type OutputFormat = 'docx' | 'pdf'

const docLabels: Record<DocType, string> = {
  dc1: 'DC1 — Lettre de candidature',
  dc2: 'DC2 — Déclaration du candidat',
  dc4: 'DC4 — Déclaration de sous-traitance',
  dume: 'DUME — Document Unique Européen',
  memoire_technique: 'Mémoire technique',
}

function detectFileType(name: string): 'rc' | 'cctp' | 'avis' | 'autre' {
  const n = name.toLowerCase().replace(/\.[^.]+$/, '')
  const words = n.split(/[\s\-_\.\/\\]+/)
  if (words.includes('rc') || n.includes('reglement') || n.includes('règlement') || n.includes('consultation')) return 'rc'
  if (words.includes('cctp') || n.includes('cahier des charges') || n.includes('technique') || n.includes('prescriptions')) return 'cctp'
  if (words.includes('avis') || n.includes('avis de marche') || n.includes('avis de marché') || n.includes('annonce')) return 'avis'
  return 'autre'
}

export default function RepondreAOPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { orgId } = useOrganization()

  const [loading, setLoading] = useState(true)
  const [ao, setAo] = useState<AppelOffre | null>(null)

  // Étape courante — déterminée automatiquement selon le statut
  const [step, setStep] = useState(1)

  // Étape 1 — infos AO
  const [titre, setTitre] = useState('')
  const [acheteur, setAcheteur] = useState('')
  const [referenceMarche, setReferenceMarche] = useState('')
  const [dateLimite, setDateLimite] = useState('')

  // Étape 1 — fichiers
  const [newFiles, setNewFiles] = useState<{ file: File; type: 'rc' | 'cctp' | 'avis' | 'autre' }[]>([])
  const [existingFiles, setExistingFiles] = useState<{ nom: string; url: string; type: string; taille: number }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Étape 2
  const [analyseRC, setAnalyseRC] = useState<AnalyseRC | null>(null)
  const [analyseCCTP, setAnalyseCCTP] = useState<AnalyseCCTP | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [analyseError, setAnalyseError] = useState('')

  // Étape 3
  const [references, setReferences] = useState<Reference[]>([])
  const [collaborateurs, setCollaborateurs] = useState<Collaborateur[]>([])
  const [selectedRefs, setSelectedRefs] = useState<string[]>([])
  const [selectedCollabs, setSelectedCollabs] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  // Étape 4
  const [docsToGenerate, setDocsToGenerate] = useState<DocType[]>(['dc1', 'dc2', 'dume', 'memoire_technique'])
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('docx')
  const [generating, setGenerating] = useState(false)
  const [generatedDocs, setGeneratedDocs] = useState<{ type: DocType; url: string; nom: string }[]>([])
  const [genError, setGenError] = useState('')

  // Chargement des données existantes
  useEffect(() => {
    async function loadAO() {
      const supabase = createClient()
      const { data } = await supabase
        .from('appels_offres')
        .select('*')
        .eq('id', id)
        .single() as { data: AppelOffre | null }

      if (!data) { router.push('/appels-offres'); return }

      setAo(data)
      setTitre(data.titre)
      setAcheteur(data.acheteur || '')
      setReferenceMarche(data.reference_marche || '')
      setDateLimite(data.date_limite_reponse ? data.date_limite_reponse.slice(0, 16) : '')
      setExistingFiles(data.fichiers_source || [])
      setAnalyseRC(data.analyse_rc || null)
      setAnalyseCCTP(data.analyse_cctp || null)
      setSelectedRefs(data.references_selectionnees || [])
      setSelectedCollabs(data.collaborateurs_selectionnes || [])
      setNotes(data.notes_utilisateur || '')
      if (data.documents_generes && data.documents_generes.length > 0) {
        setGeneratedDocs(data.documents_generes.map(d => ({ type: d.type, url: d.url, nom: `${d.type}.docx` })))
      }

      // Charger refs et collabs (RLS filtre automatiquement par org)
      const [{ data: refs }, { data: collabs }] = await Promise.all([
        supabase.from('references').select('*').order('annee', { ascending: false }),
        supabase.from('collaborateurs').select('*').order('nom'),
      ])
      setReferences(refs || [])
      setCollaborateurs(collabs || [])

      // Déterminer l'étape de départ selon le statut
      if (data.statut === 'genere' || data.statut === 'soumis') setStep(5)
      else if (data.statut === 'analyse') setStep(3)
      else if (data.analyse_rc || data.analyse_cctp) setStep(3)
      else if (data.fichiers_source && data.fichiers_source.length > 0) setStep(2)
      else setStep(1)

      setLoading(false)
    }
    loadAO()
  }, [id, router])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' ||
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.type === 'application/msword' ||
      f.name.endsWith('.pdf') || f.name.endsWith('.docx') || f.name.endsWith('.doc')
    )
    if (dropped.length === 0) return
    setNewFiles(prev => [...prev, ...dropped.map(f => ({ file: f, type: detectFileType(f.name) }))])
  }

  async function handleSaveStep1() {
    if (!titre.trim()) return alert('Veuillez saisir un titre')
    setUploading(true)
    const supabase = createClient()

    // Upload nouveaux fichiers
    const uploaded = [...existingFiles]
    for (const { file, type } of newFiles) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('ao_id', id)
      formData.append('type', type)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        uploaded.push({ nom: file.name, url: data.url, type, taille: file.size })
      }
    }

    // Mettre à jour l'AO (RLS filtre par org automatiquement)
    await supabase.from('appels_offres').update({
      titre,
      acheteur: acheteur || null,
      reference_marche: referenceMarche || null,
      date_limite_reponse: dateLimite || null,
      fichiers_source: uploaded,
      statut: 'en_cours',
    }).eq('id', id)

    setExistingFiles(uploaded)
    setNewFiles([])
    setUploading(false)
    setStep(2)
  }

  async function handleAnalyse() {
    setAnalysing(true)
    setAnalyseError('')
    const allFiles = existingFiles

    const rcFile = allFiles.find(f => f.type === 'rc')
    const cctpFile = allFiles.find(f => f.type === 'cctp')
    let rc = null
    let cctp = null

    if (rcFile) {
      const res = await fetch('/api/ai/analyze-rc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ao_id: id, file_url: rcFile.url }),
      })
      if (res.ok) rc = (await res.json()).analyse
    }
    if (cctpFile) {
      const res = await fetch('/api/ai/analyze-cctp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ao_id: id, file_url: cctpFile.url }),
      })
      if (res.ok) cctp = (await res.json()).analyse
    }

    if (!rc && !cctp) {
      setAnalyseError('Aucun fichier RC ou CCTP trouvé. Retournez à l\'étape 1 et ajoutez vos documents.')
      setAnalysing(false)
      return
    }

    setAnalyseRC(rc)
    setAnalyseCCTP(cctp)
    setAnalysing(false)
    setStep(3)
  }

  async function handleSaveSelection() {
    const supabase = createClient()
    await supabase.from('appels_offres').update({
      references_selectionnees: selectedRefs,
      collaborateurs_selectionnes: selectedCollabs,
      notes_utilisateur: notes,
      statut: 'analyse',
    }).eq('id', id)
    setStep(4)
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenError('')
    const docs: { type: DocType; url: string; nom: string }[] = []
    const errors: string[] = []

    for (const docType of docsToGenerate) {
      try {
        const res = await fetch(`/api/ai/generate-${docType === 'memoire_technique' ? 'memoire' : docType}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ao_id: id, format: outputFormat }),
        })
        if (res.ok) {
          const data = await res.json()
          docs.push({ type: docType, url: data.url, nom: data.nom })
        } else {
          const errBody = await res.json().catch(() => ({}))
          errors.push(`${docLabels[docType]} : ${errBody.error || `Erreur ${res.status}`}`)
        }
      } catch (e: any) {
        errors.push(`${docLabels[docType]} : ${e.message || 'Erreur réseau'}`)
      }
    }

    if (docs.length === 0) {
      setGenError(`Tous les documents ont échoué :\n${errors.join('\n')}`)
      setGenerating(false)
      return
    }
    if (errors.length > 0) {
      setGenError(`Certains documents ont échoué :\n${errors.join('\n')}`)
    }

    const supabase = createClient()
    // Fusionner avec les docs existants (remplace les types régénérés)
    const existingDocs = ao?.documents_generes || []
    const existingKept = existingDocs.filter(d => !docsToGenerate.includes(d.type))
    await supabase.from('appels_offres').update({
      statut: 'genere',
      documents_generes: [
        ...existingKept,
        ...docs.map(d => ({ type: d.type, url: d.url, version: 1, genere_le: new Date().toISOString() }))
      ]
    }).eq('id', id)

    setGeneratedDocs(docs)
    setGenerating(false)
    setStep(5)
  }

  // Étapes déjà complétées (pour navigation)
  function isStepDone(s: number) {
    if (s === 1) return existingFiles.length > 0
    if (s === 2) return !!(analyseRC || analyseCCTP)
    if (s === 3) return !!(ao?.statut === 'analyse' || ao?.statut === 'genere' || ao?.statut === 'soumis')
    if (s === 4) return !!(ao?.documents_generes && ao.documents_generes.length > 0) || generatedDocs.length > 0
    return false
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Link href={`/appels-offres/${id}`} className="text-text-secondary hover:text-primary text-sm">← Retour</Link>
        </div>
        <h1 className="text-2xl font-bold text-text-primary">Modifier la réponse</h1>
        <p className="text-text-secondary mt-1 truncate max-w-2xl">{titre}</p>
      </div>

      {/* Stepper cliquable */}
      <div className="flex items-center mb-10">
        {STEPS.map((s, i) => {
          const done = isStepDone(s.id)
          const clickable = done || s.id <= step
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div className={cn('flex flex-col items-center', i < STEPS.length - 1 ? 'flex-1' : '')}>
                <button
                  onClick={() => clickable && setStep(s.id)}
                  disabled={!clickable}
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors',
                    clickable && 'hover:opacity-80',
                    step > s.id || done ? 'bg-primary border-primary text-white' :
                    step === s.id ? 'border-primary text-primary bg-primary-light' :
                    'border-border text-text-secondary bg-white cursor-not-allowed'
                  )}
                >
                  {(step > s.id || (done && step !== s.id)) ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-4 h-4" />}
                </button>
                <span className={cn(
                  'text-xs mt-1.5 font-medium',
                  step >= s.id || done ? 'text-primary' : 'text-text-secondary'
                )}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('h-0.5 flex-1 mx-2 mb-5', (step > s.id || done) ? 'bg-primary' : 'bg-border')} />
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-border p-8">

        {/* ÉTAPE 1 — Documents et infos */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-text-primary">Informations et documents</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1.5">Titre *</label>
                <input value={titre} onChange={e => setTitre(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Acheteur public</label>
                <input value={acheteur} onChange={e => setAcheteur(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Référence du marché</label>
                <input value={referenceMarche} onChange={e => setReferenceMarche(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Date limite de réponse</label>
                <input type="datetime-local" value={dateLimite} onChange={e => setDateLimite(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
            </div>

            {/* Fichiers existants */}
            {existingFiles.length > 0 && (
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">Documents déjà uploadés</p>
                <div className="space-y-2">
                  {existingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                      <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                      <span className="text-sm text-text-primary flex-1 truncate">{f.nom}</span>
                      <select
                        value={f.type}
                        onChange={e => {
                          const updated = [...existingFiles]
                          updated[i] = { ...updated[i], type: e.target.value }
                          setExistingFiles(updated)
                        }}
                        className="text-xs border border-border rounded px-2 py-1 bg-white"
                      >
                        <option value="rc">RC</option>
                        <option value="cctp">CCTP</option>
                        <option value="avis">Avis</option>
                        <option value="autre">Autre</option>
                      </select>
                      <button
                        onClick={() => setExistingFiles(existingFiles.filter((_, j) => j !== i))}
                        className="text-text-secondary hover:text-danger"
                        title="Retirer ce fichier"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Zone ajout nouveaux fichiers */}
            <div>
              <p className="text-sm font-medium text-text-primary mb-2">
                {existingFiles.length > 0 ? 'Ajouter de nouveaux documents' : 'Documents de l\'appel d\'offres'}
              </p>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                onDragEnter={e => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={e => { e.preventDefault(); setIsDragOver(false) }}
                onDrop={handleDrop}
                className={cn(
                  'flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl transition-colors',
                  isDragOver ? 'border-primary bg-primary-light/50' : 'border-border hover:border-primary hover:bg-primary-light/30'
                )}
              >
                <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
                  <Plus className={cn('w-7 h-7 mb-2', isDragOver ? 'text-primary' : 'text-text-secondary')} />
                  <span className={cn('text-sm font-medium', isDragOver ? 'text-primary' : 'text-text-secondary')}>
                    {isDragOver ? 'Relâchez pour ajouter' : 'Glissez ou cliquez pour ajouter des fichiers'}
                  </span>
                  <span className="text-xs text-text-secondary mt-0.5">PDF, DOCX · RC, CCTP, Avis…</span>
                  <input type="file" multiple accept=".pdf,.docx,.doc"
                    onChange={e => {
                      const added = Array.from(e.target.files || [])
                      setNewFiles(prev => [...prev, ...added.map(f => ({ file: f, type: detectFileType(f.name) }))])
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Nouveaux fichiers à uploader */}
            {newFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-text-secondary uppercase">Nouveaux fichiers</p>
                {newFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-surface rounded-lg px-4 py-3">
                    <File className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm text-text-primary flex-1 truncate">{f.file.name}</span>
                    <select
                      value={f.type}
                      onChange={e => {
                        const updated = [...newFiles]
                        updated[i].type = e.target.value as 'rc' | 'cctp' | 'avis' | 'autre'
                        setNewFiles(updated)
                      }}
                      className="text-xs border border-border rounded px-2 py-1 bg-white"
                    >
                      <option value="rc">RC</option>
                      <option value="cctp">CCTP</option>
                      <option value="avis">Avis</option>
                      <option value="autre">Autre</option>
                    </select>
                    <button onClick={() => setNewFiles(newFiles.filter((_, j) => j !== i))}
                      className="text-text-secondary hover:text-danger"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleSaveStep1}
                disabled={uploading || !titre.trim()}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {uploading ? 'Enregistrement...' : 'Enregistrer et continuer'}
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 — Analyse IA */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Analyse IA des documents</h2>
                <p className="text-text-secondary text-sm mt-1">Lancez ou relancez l&apos;analyse pour mettre à jour les résultats.</p>
              </div>
              {(analyseRC || analyseCCTP) && (
                <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">Analyse existante</span>
              )}
            </div>

            {/* Fichiers disponibles */}
            {existingFiles.length > 0 && (
              <div className="space-y-2">
                {existingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-3">
                    <File className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm text-text-primary flex-1 truncate">{f.nom}</span>
                    <span className="text-xs bg-primary-light text-primary px-2 py-0.5 rounded-full">{f.type.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            )}

            {analyseError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                <span className="text-sm text-danger">{analyseError}</span>
              </div>
            )}

            {/* Résultats existants */}
            {analyseRC && (
              <div className="bg-surface rounded-xl p-5 space-y-3 border border-border">
                <p className="text-sm font-semibold text-text-primary">Analyse RC</p>
                {analyseRC.objet && <p className="text-sm text-text-primary">{analyseRC.objet}</p>}
                {Array.isArray(analyseRC.criteres_notation) && analyseRC.criteres_notation.length > 0 && (
                  <div className="space-y-1">
                    {analyseRC.criteres_notation.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-text-primary">{c.critere}</span>
                        <span className="font-medium text-primary">{c.ponderation_pourcentage}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {analyseCCTP && (
              <div className="bg-surface rounded-xl p-5 border border-border">
                <p className="text-sm font-semibold text-text-primary mb-2">Analyse CCTP</p>
                {analyseCCTP.prestations_attendues && (
                  <p className="text-sm text-text-primary">{analyseCCTP.prestations_attendues}</p>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm">
                <ChevronLeft className="w-4 h-4" /> Retour
              </button>
              <div className="flex gap-3">
                {(analyseRC || analyseCCTP) && (
                  <button
                    onClick={() => setStep(3)}
                    className="flex items-center gap-2 border border-border text-text-secondary hover:text-primary hover:border-primary rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" /> Continuer sans relancer
                  </button>
                )}
                <button
                  onClick={handleAnalyse}
                  disabled={analysing}
                  className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {analysing ? 'Analyse en cours...' : analyseRC || analyseCCTP ? 'Relancer l\'analyse' : 'Lancer l\'analyse'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 — Sélection */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-text-primary">Sélection des éléments</h2>

            {references.length === 0 && collaborateurs.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                Vous n&apos;avez pas encore ajouté de références ni de collaborateurs dans votre profil.{' '}
                <Link href="/references" className="underline font-medium">Ajouter des références</Link>
              </div>
            )}

            {references.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-3">
                  Références à inclure ({selectedRefs.length} sélectionnée{selectedRefs.length > 1 ? 's' : ''})
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {references.map(ref => (
                    <label key={ref.id} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                      <input type="checkbox" checked={selectedRefs.includes(ref.id)}
                        onChange={e => setSelectedRefs(prev => e.target.checked ? [...prev, ref.id] : prev.filter(x => x !== ref.id))}
                        className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{ref.titre}</p>
                        <p className="text-xs text-text-secondary">{ref.client}{ref.annee ? ` — ${ref.annee}` : ''}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {collaborateurs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-3">Collaborateurs à affecter</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {collaborateurs.map(c => (
                    <label key={c.id} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                      <input type="checkbox" checked={selectedCollabs.includes(c.id)}
                        onChange={e => setSelectedCollabs(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id))}
                        className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{c.prenom} {c.nom}</p>
                        <p className="text-xs text-text-secondary">{c.poste}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Notes et instructions pour l&apos;IA</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                placeholder="Ex: Mettre en avant notre expertise en communication santé, insister sur la méthodologie agile, inclure le référent M. Dupont..." />
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm">
                <ChevronLeft className="w-4 h-4" /> Retour
              </button>
              <button onClick={handleSaveSelection}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors">
                <ChevronRight className="w-4 h-4" /> Continuer
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 4 — Génération */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Génération des documents</h2>
              <p className="text-text-secondary text-sm mt-1">
                Choisissez les documents à (re)générer. Les documents déjà générés seront remplacés.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Documents à générer</h3>
              <div className="space-y-2">
                {(Object.entries(docLabels) as [DocType, string][]).map(([type, label]) => {
                  const alreadyGenerated = ao?.documents_generes?.some(d => d.type === type)
                  return (
                    <label key={type} className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                      <input type="checkbox" checked={docsToGenerate.includes(type)}
                        onChange={e => setDocsToGenerate(prev => e.target.checked ? [...prev, type] : prev.filter(t => t !== type))} />
                      <span className="text-sm text-text-primary flex-1">{label}</span>
                      {alreadyGenerated && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Déjà généré</span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Format</h3>
              <div className="flex gap-4">
                {(['docx', 'pdf'] as OutputFormat[]).map(fmt => (
                  <label key={fmt} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={outputFormat === fmt} onChange={() => setOutputFormat(fmt)} />
                    <span className="text-sm text-text-primary">{fmt === 'docx' ? 'Word (.docx)' : 'PDF'}</span>
                  </label>
                ))}
              </div>
            </div>

            {genError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                <div className="text-sm text-danger whitespace-pre-line">{genError}</div>
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(3)} className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm">
                <ChevronLeft className="w-4 h-4" /> Retour
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating || docsToGenerate.length === 0}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                {generating ? 'Génération en cours...' : 'Générer les documents'}
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 5 — Téléchargement */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <CheckCircle2 className="w-14 h-14 text-secondary mx-auto mb-3" />
              <h2 className="text-xl font-bold text-text-primary">Documents disponibles</h2>
              <p className="text-text-secondary mt-1 text-sm">Téléchargez vos documents ou relancez une génération</p>
            </div>

            {/* Tous les docs générés (existants + nouvellement générés) */}
            {(() => {
              const allDocs = [
                ...(ao?.documents_generes || []).map(d => ({
                  type: d.type, url: d.url, nom: d.type,
                  genere_le: d.genere_le, version: d.version
                })),
                ...generatedDocs.filter(d => !ao?.documents_generes?.some(e => e.type === d.type))
                  .map(d => ({ type: d.type, url: d.url, nom: d.type, genere_le: new Date().toISOString(), version: 1 }))
              ]
              return allDocs.length > 0 ? (
                <div className="space-y-2">
                  {allDocs.map((doc, i) => (
                    <div key={i} className="flex items-center justify-between bg-surface rounded-lg px-4 py-3 border border-border">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-secondary" />
                        <div>
                          <p className="text-sm font-medium text-text-primary">{docLabels[doc.type as DocType] || doc.type}</p>
                          <p className="text-xs text-text-secondary">v{doc.version} — {new Date(doc.genere_le).toLocaleDateString('fr-FR')}</p>
                        </div>
                      </div>
                      <a href={doc.url} download className="text-sm text-primary hover:underline font-medium flex items-center gap-1.5">
                        <FileDown className="w-4 h-4" /> Télécharger
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-text-secondary text-sm">
                  Aucun document généré. Allez à l&apos;étape 4.
                </div>
              )
            })()}

            <div className="flex gap-3 flex-wrap justify-between">
              <button
                onClick={() => setStep(4)}
                className="flex items-center gap-2 border border-primary text-primary hover:bg-primary-light rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Régénérer des documents
              </button>
              <button
                onClick={async () => {
                  const res = await fetch('/api/documents/download-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ao_id: id }),
                  })
                  if (res.ok) {
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `AO-${titre.replace(/[^a-z0-9]/gi, '-')}-documents.zip`
                    a.click()
                  }
                }}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
              >
                <FileDown className="w-4 h-4" />
                Tout télécharger (.zip)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
