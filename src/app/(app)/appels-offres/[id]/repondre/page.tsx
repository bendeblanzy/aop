'use client'
import { useState, useEffect, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/context/OrganizationContext'
import {
  Upload, Brain, FileCheck, ChevronRight, ChevronLeft, Loader2, X, File,
  AlertCircle, CheckCircle2, Plus, RefreshCw, Download, FileDown, ExternalLink,
  Clock, Target, Shield, Users, FileText, Sparkles, Package, Send, AlertTriangle,
  Eye, Star, BarChart3, Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadFileToStorage } from '@/lib/upload'
import type { AppelOffre, AnalyseRC, AnalyseCCTP, Reference, Collaborateur, FichierSource } from '@/lib/types'
import Link from 'next/link'
import { toast } from 'sonner'

type DocType = 'dc1' | 'dc2' | 'dc4' | 'dume' | 'memoire_technique'
type OutputFormat = 'docx' | 'pdf'
type Phase = 1 | 2 | 3
type FileSourceType = 'rc' | 'cctp' | 'ccap' | 'bpu' | 'ae' | 'dpgf' | 'avis' | 'autre'

const docLabels: Record<DocType, string> = {
  dc1: 'DC1 — Lettre de candidature',
  dc2: 'DC2 — Déclaration du candidat',
  dc4: 'DC4 — Déclaration de sous-traitance',
  dume: 'DUME — Document Unique Européen',
  memoire_technique: 'Mémoire technique',
}

function detectFileType(name: string): FileSourceType {
  const n = name.toLowerCase().replace(/\.[^.]+$/, '')
  const words = n.split(/[\s\-_\.\/\\]+/)
  if (words.includes('rc') || n.includes('reglement') || n.includes('règlement') || n.includes('consultation')) return 'rc'
  if (words.includes('cctp') || n.includes('technique') || n.includes('prescriptions')) return 'cctp'
  if (words.includes('ccap') || n.includes('administratives')) return 'ccap'
  if (words.includes('bpu') || n.includes('bordereau') || n.includes('prix')) return 'bpu'
  if (words.includes('ae') || n.includes('engagement') || n.includes('acte')) return 'ae'
  if (words.includes('dpgf') || n.includes('decomposition') || n.includes('décomposition') || n.includes('forfaitaire')) return 'dpgf'
  if (words.includes('avis') || n.includes('annonce')) return 'avis'
  return 'autre'
}

const PHASE_COLORS = {
  1: 'bg-blue-50 border-blue-200',
  2: 'bg-purple-50 border-purple-200',
  3: 'bg-green-50 border-green-200',
}

const PHASE_ICONS = {
  1: Brain,
  2: FileText,
  3: CheckCircle2,
}

interface ConformityItem {
  id: string
  label: string
  done: boolean
  category: 'document' | 'requirement' | 'signature' | 'format'
}

export default function RepondreAOPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { orgId } = useOrganization()

  const [loading, setLoading] = useState(true)
  const [ao, setAo] = useState<AppelOffre | null>(null)

  // Phases et étapes
  const [phase, setPhase] = useState<Phase>(1)
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  // Données AO
  const [titre, setTitre] = useState('')
  const [acheteur, setAcheteur] = useState('')
  const [referenceMarche, setReferenceMarche] = useState('')
  const [dateLimite, setDateLimite] = useState('')

  // Fichiers
  const [newFiles, setNewFiles] = useState<{ file: File; type: FileSourceType }[]>([])
  const [existingFiles, setExistingFiles] = useState<{ nom: string; url: string; type: string; taille: number }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Analyses
  const [analyseRC, setAnalyseRC] = useState<AnalyseRC | null>(null)
  const [analyseCCTP, setAnalyseCCTP] = useState<AnalyseCCTP | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [analyseError, setAnalyseError] = useState('')

  // Conformité
  const [checklist, setChecklist] = useState<ConformityItem[]>([])

  // Sélection références et équipe
  const [references, setReferences] = useState<Reference[]>([])
  const [collaborateurs, setCollaborateurs] = useState<Collaborateur[]>([])
  const [selectedRefs, setSelectedRefs] = useState<string[]>([])
  const [selectedCollabs, setSelectedCollabs] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [newCollab, setNewCollab] = useState({ prenom: '', nom: '', poste: '' })
  const [addingCollab, setAddingCollab] = useState(false)

  // Documents administratifs
  const [docsToGenerate, setDocsToGenerate] = useState<DocType[]>(['dc1', 'dc2', 'dume', 'memoire_technique'])
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('docx')
  const [generating, setGenerating] = useState(false)
  const [generatedDocs, setGeneratedDocs] = useState<{ type: DocType; url: string; nom: string }[]>([])
  const [genError, setGenError] = useState('')

  // BPU
  const [bpuPrices, setBpuPrices] = useState<Record<string, number>>({})

  // Chargement des données
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

      // Charger références et collaborateurs
      const [{ data: refs }, { data: collabs }] = await Promise.all([
        supabase.from('references').select('*').order('annee', { ascending: false }),
        supabase.from('collaborateurs').select('*').order('nom'),
      ])
      setReferences(refs || [])
      setCollaborateurs(collabs || [])

      // Déterminer la phase de départ
      if (data.statut === 'soumis') setPhase(3)
      else if (data.statut === 'genere') setPhase(3)
      else if (data.statut === 'analyse') setPhase(2)
      else if (data.analyse_rc || data.analyse_cctp) setPhase(2)
      else if (data.fichiers_source && data.fichiers_source.length > 0) setPhase(1)
      else setPhase(1)

      // Initialiser la checklist de conformité (sera remplie au passage à phase 3)
      initializeChecklist(data)

      setLoading(false)
    }
    loadAO()
  }, [id, router])

  function initializeChecklist(data: AppelOffre) {
    const items: ConformityItem[] = []

    // Éléments de conformité basés sur l'analyse RC
    if (data.analyse_rc?.pieces_exigees) {
      data.analyse_rc.pieces_exigees.forEach((piece, i) => {
        items.push({
          id: `piece_${i}`,
          label: typeof piece === 'string' ? piece : `${piece.piece}${piece.detail ? ` — ${piece.detail}` : ''}`,
          done: false,
          category: 'document',
        })
      })
    }

    // Documents générés requis
    const requiredDocs: DocType[] = ['dc1', 'dc2', 'dume']
    requiredDocs.forEach(docType => {
      const isGenerated = data.documents_generes?.some(d => d.type === docType)
      items.push({
        id: `doc_${docType}`,
        label: docLabels[docType],
        done: isGenerated || false,
        category: 'document',
      })
    })

    // Format et signature
    items.push({
      id: 'format_conformite',
      label: 'Fichiers au format conforme (PDF/DOCX)',
      done: false,
      category: 'format',
    })
    items.push({
      id: 'signature',
      label: 'Documents signés (si requis)',
      done: false,
      category: 'signature',
    })

    setChecklist(items)
  }

  // Calculer la progression globale
  const overallProgress = useMemo(() => {
    let total = 0
    let completed = 0

    if (existingFiles.length > 0) completed++
    total++

    if (analyseRC || analyseCCTP) completed++
    total++

    if (selectedRefs.length > 0 || selectedCollabs.length > 0) completed++
    total++

    if (generatedDocs.length > 0) completed++
    total++

    return Math.round((completed / total) * 100)
  }, [existingFiles, analyseRC, analyseCCTP, selectedRefs, selectedCollabs, generatedDocs])

  // Handlers
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' ||
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.type === 'application/msword' ||
      f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      f.type === 'application/vnd.ms-excel' ||
      f.type === 'application/zip' ||
      f.type === 'image/png' || f.type === 'image/jpeg' || f.type === 'image/tiff' || f.type === 'image/bmp' ||
      f.name.endsWith('.pdf') || f.name.endsWith('.docx') || f.name.endsWith('.doc') ||
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.zip') ||
      f.name.endsWith('.png') || f.name.endsWith('.jpg') || f.name.endsWith('.jpeg') ||
      f.name.endsWith('.tiff') || f.name.endsWith('.tif') || f.name.endsWith('.bmp')
    )
    if (dropped.length === 0) return
    setNewFiles(prev => [...prev, ...dropped.map(f => ({ file: f, type: detectFileType(f.name) }))])
  }

  async function handleSaveDocuments() {
    if (!titre.trim()) { toast.error('Veuillez saisir un titre'); return }
    setUploading(true)
    const supabase = createClient()

    const uploaded = [...existingFiles]
    const failed: string[] = []
    for (const { file, type } of newFiles) {
      try {
        const { url } = await uploadFileToStorage(file, id)
        uploaded.push({ nom: file.name, url, type, taille: file.size })
      } catch (uploadErr) {
        console.error('[upload] Fichier échoué:', file.name, uploadErr)
        failed.push(file.name)
      }
    }
    if (failed.length > 0) {
      toast.warning(`${failed.length} fichier(s) n'ont pas pu être uploadés : ${failed.join(', ')}`)
    }

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
    toast.success('Documents enregistrés')
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
      try {
        const res = await fetch('/api/ai/analyze-rc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ao_id: id, file_url: rcFile.url }),
        })
        if (res.ok) rc = (await res.json()).analyse
        else {
          const errData = await res.json().catch(() => ({}))
          setAnalyseError(`Analyse RC échouée : ${errData.error || res.statusText}`)
        }
      } catch (e) {
        console.error('[handleAnalyse] Erreur analyze-rc:', e)
        setAnalyseError('Impossible d\'analyser le RC. Vérifiez votre connexion et réessayez.')
      }
    }
    if (cctpFile) {
      try {
        const res = await fetch('/api/ai/analyze-cctp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ao_id: id, file_url: cctpFile.url }),
        })
        if (res.ok) cctp = (await res.json()).analyse
        else {
          const errData = await res.json().catch(() => ({}))
          if (!rc) setAnalyseError(`Analyse CCTP échouée : ${errData.error || res.statusText}`)
        }
      } catch (e) {
        console.error('[handleAnalyse] Erreur analyze-cctp:', e)
      }
    }

    if (!rc && !cctp) {
      if (!rcFile && !cctpFile) {
        setAnalyseError('Aucun fichier RC ou CCTP trouvé. Ajoutez vos documents ci-dessus.')
      }
      setAnalysing(false)
      return
    }

    setAnalyseRC(rc)
    setAnalyseCCTP(cctp)
    setAnalysing(false)
    toast.success('Analyse terminée')
  }

  async function handleSaveSelection() {
    const supabase = createClient()
    await supabase.from('appels_offres').update({
      references_selectionnees: selectedRefs,
      collaborateurs_selectionnes: selectedCollabs,
      notes_utilisateur: notes,
      statut: 'analyse',
    }).eq('id', id)
    toast.success('Sélection enregistrée')
  }

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
      toast.success('Collaborateur ajouté')
    }
    setAddingCollab(false)
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
    toast.success('Documents générés')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  const allDocs = [
    ...(ao?.documents_generes || []).map(d => ({
      type: d.type, url: d.url, nom: d.type,
      genere_le: d.genere_le, version: d.version
    })),
    ...generatedDocs.filter(d => !ao?.documents_generes?.some(e => e.type === d.type))
      .map(d => ({ type: d.type, url: d.url, nom: d.type, genere_le: new Date().toISOString(), version: 1 }))
  ]

  const checklistDone = checklist.filter(c => c.done).length
  const checklistTotal = checklist.length

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Link href={`/appels-offres/${id}`} className="text-text-secondary hover:text-primary text-sm">
            ← Retour
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-text-primary">Répondre à l'appel d'offres</h1>
        <p className="text-text-secondary mt-1 truncate max-w-2xl">{titre}</p>
      </div>

      {/* Barre de progression globale */}
      <div className="mb-8 bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Progression globale</h3>
          <span className="text-lg font-bold text-primary">{overallProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div
            className="bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Indicateurs des 3 phases */}
        <div className="grid grid-cols-3 gap-4">
          {([1, 2, 3] as Phase[]).map(p => {
            const PhaseIcon = PHASE_ICONS[p]
            const isActive = phase === p
            const isDone = p < phase
            return (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={cn(
                  'text-left p-4 rounded-lg border-2 transition-all cursor-pointer',
                  isDone ? 'border-green-500 bg-green-50' :
                  isActive ? 'border-blue-500 bg-blue-50' :
                  'border-gray-200 bg-white hover:border-gray-300',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white',
                    isDone ? 'bg-green-500' :
                    isActive ? 'bg-blue-500' :
                    'bg-gray-300'
                  )}>
                    {isDone ? <CheckCircle2 className="w-5 h-5" /> : <PhaseIcon className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      Phase {p}
                    </p>
                    <p className={cn(
                      'text-sm font-semibold mt-1',
                      isDone || isActive ? 'text-text-primary' : 'text-text-secondary'
                    )}>
                      {p === 1 && 'Je comprends l\'AO'}
                      {p === 2 && 'Je prépare ma réponse'}
                      {p === 3 && 'Je dépose mon dossier'}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* PHASE 1: Je comprends l'AO */}
      {phase === 1 && (
        <div className="space-y-4">
          {/* Step 1.1: Import des documents */}
          <div className="bg-white rounded-xl border border-border p-6">
            <button
              onClick={() => setExpandedStep(expandedStep === 'phase1_import' ? null : 'phase1_import')}
              className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mt-0.5">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-text-primary">Import des documents</h3>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {existingFiles.length > 0 ? `${existingFiles.length} document(s) uploadé(s)` : 'Aucun document'}
                  </p>
                </div>
              </div>
              <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase1_import' && 'rotate-90')} />
            </button>

            {expandedStep === 'phase1_import' && (
              <div className="mt-6 pt-6 border-t border-border space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Titre *</label>
                    <input
                      value={titre}
                      onChange={e => setTitre(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Acheteur public</label>
                    <input
                      value={acheteur}
                      onChange={e => setAcheteur(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Référence du marché</label>
                    <input
                      value={referenceMarche}
                      onChange={e => setReferenceMarche(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Date limite de réponse</label>
                    <input
                      type="datetime-local"
                      value={dateLimite}
                      onChange={e => setDateLimite(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                {/* Fichiers existants */}
                {existingFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <p className="text-sm font-medium text-text-primary">Documents déjà uploadés</p>
                    </div>
                    <div className="space-y-2">
                      {existingFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                          <File className="w-4 h-4 text-green-600 shrink-0" />
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
                            <option value="ccap">CCAP</option>
                            <option value="bpu">BPU</option>
                            <option value="ae">AE</option>
                            <option value="dpgf">DPGF</option>
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

                {/* Zone d'ajout */}
                <div>
                  <p className="text-sm font-medium text-text-primary mb-2">
                    {existingFiles.length > 0 ? 'Ajouter de nouveaux documents' : 'Télécharger vos documents'}
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
                      <Upload className={cn('w-6 h-6 mb-2', isDragOver ? 'text-primary' : 'text-text-secondary')} />
                      <span className={cn('text-sm font-medium', isDragOver ? 'text-primary' : 'text-text-secondary')}>
                        {isDragOver ? 'Relâchez pour ajouter' : 'Glissez-déposez ou cliquez'}
                      </span>
                      <span className="text-xs text-text-secondary mt-0.5">PDF, DOCX, XLSX, ZIP, images</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.docx,.doc,.xlsx,.xls,.zip,.png,.jpg,.jpeg,.tiff,.tif,.bmp"
                        onChange={e => {
                          const added = Array.from(e.target.files || [])
                          setNewFiles(prev => [...prev, ...added.map(f => ({ file: f, type: detectFileType(f.name) }))])
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Nouveaux fichiers */}
                {newFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-text-secondary uppercase">À uploader</p>
                    {newFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 bg-surface rounded-lg px-4 py-3">
                        <File className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm text-text-primary flex-1 truncate">{f.file.name}</span>
                        <select
                          value={f.type}
                          onChange={e => {
                            const updated = [...newFiles]
                            updated[i].type = e.target.value as FileSourceType
                            setNewFiles(updated)
                          }}
                          className="text-xs border border-border rounded px-2 py-1 bg-white"
                        >
                          <option value="rc">RC</option>
                          <option value="cctp">CCTP</option>
                          <option value="ccap">CCAP</option>
                          <option value="bpu">BPU</option>
                          <option value="ae">AE</option>
                          <option value="dpgf">DPGF</option>
                          <option value="avis">Avis</option>
                          <option value="autre">Autre</option>
                        </select>
                        <button
                          onClick={() => setNewFiles(newFiles.filter((_, j) => j !== i))}
                          className="text-text-secondary hover:text-danger"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end pt-4 border-t border-border">
                  <button
                    onClick={handleSaveDocuments}
                    disabled={uploading || !titre.trim()}
                    className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {uploading ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step 1.2: Analyse IA */}
          <div className="bg-white rounded-xl border border-border p-6">
            <button
              onClick={() => setExpandedStep(expandedStep === 'phase1_analyse' ? null : 'phase1_analyse')}
              className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white mt-0.5',
                  analyseRC || analyseCCTP ? 'bg-green-600' : 'bg-blue-100 text-blue-600'
                )}>
                  <Brain className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-text-primary">Analyse IA des documents</h3>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {analyseRC || analyseCCTP ? 'Analyse complétée' : 'Lancez l\'analyse de vos documents'}
                  </p>
                </div>
                {(analyseRC || analyseCCTP) && (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium">
                    <Sparkles className="w-3 h-3" /> Fait pour vous
                  </span>
                )}
              </div>
              <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase1_analyse' && 'rotate-90')} />
            </button>

            {expandedStep === 'phase1_analyse' && (
              <div className="mt-6 pt-6 border-t border-border space-y-6">
                {analyseError && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                    <span className="text-sm text-danger">{analyseError}</span>
                  </div>
                )}

                {analyseRC && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <p className="text-sm font-semibold text-text-primary">Analyse RC</p>
                    </div>
                    {analyseRC.objet && <p className="text-sm text-text-primary">{analyseRC.objet}</p>}
                    {Array.isArray(analyseRC.criteres_notation) && analyseRC.criteres_notation.length > 0 && (
                      <div className="space-y-2 mt-3">
                        <p className="text-xs font-medium text-text-secondary uppercase">Critères de notation</p>
                        {analyseRC.criteres_notation.map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-text-primary">{c.critere}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-gray-200 rounded-full h-1.5">
                                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${c.ponderation_pourcentage}%` }} />
                              </div>
                              <span className="font-medium text-primary text-xs w-8 text-right">{c.ponderation_pourcentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {analyseRC.decision_go_nogo && (
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <p className="text-xs font-medium text-text-secondary uppercase">Décision</p>
                        <p className={cn(
                          'text-sm font-semibold mt-1',
                          analyseRC.decision_go_nogo === 'GO' ? 'text-green-600' : 'text-orange-600'
                        )}>
                          {analyseRC.decision_go_nogo === 'GO' ? '✓ Nous recommandons de répondre' : '⚠ Analyser les risques avant de répondre'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {analyseCCTP && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      <p className="text-sm font-semibold text-text-primary">Analyse CCTP</p>
                    </div>
                    {analyseCCTP.prestations_attendues && (
                      <p className="text-sm text-text-primary">{analyseCCTP.prestations_attendues}</p>
                    )}
                  </div>
                )}

                <div className="flex justify-end pt-4 border-t border-border">
                  <button
                    onClick={handleAnalyse}
                    disabled={analysing || existingFiles.length === 0}
                    className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {analysing ? 'Analyse en cours...' : analyseRC || analyseCCTP ? 'Relancer l\'analyse' : 'Lancer l\'analyse'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step 1.3: Scoring & Go/No-Go */}
          {analyseRC && (
            <div className="bg-white rounded-xl border border-border p-6">
              <button
                onClick={() => setExpandedStep(expandedStep === 'phase1_scoring' ? null : 'phase1_scoring')}
                className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 mt-0.5">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-text-primary">Scoring et Go/No-Go</h3>
                    <p className="text-sm text-text-secondary mt-0.5">Analyse de votre compatibilité avec l'appel</p>
                  </div>
                </div>
                <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase1_scoring' && 'rotate-90')} />
              </button>

              {expandedStep === 'phase1_scoring' && (
                <div className="mt-6 pt-6 border-t border-border space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    {analyseRC.decision_go_nogo && (
                      <div className={cn('col-span-2 rounded-lg p-4 border-2', analyseRC.decision_go_nogo === 'GO' ? 'bg-green-50 border-green-300' : 'bg-orange-50 border-orange-300')}>
                        <p className={cn(
                          'text-sm font-bold',
                          analyseRC.decision_go_nogo === 'GO' ? 'text-green-700' : 'text-orange-700'
                        )}>
                          {analyseRC.decision_go_nogo === 'GO' ? '✓ GO — Nous recommandons de répondre' : '⚠ NO-GO — À analyser'}
                        </p>
                      </div>
                    )}
                    {dateLimite && (
                      <div className="rounded-lg p-4 bg-blue-50 border border-blue-200">
                        <p className="text-xs font-medium text-blue-600 uppercase mb-1">Date limite</p>
                        <p className="text-sm font-semibold text-text-primary">
                          {new Date(dateLimite).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    )}
                    {analyseRC.duree_marche && (
                      <div className="rounded-lg p-4 bg-purple-50 border border-purple-200">
                        <p className="text-xs font-medium text-purple-600 uppercase mb-1">Durée du marché</p>
                        <p className="text-sm font-semibold text-text-primary">{analyseRC.duree_marche}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 1.4: Checklist exigences */}
          {analyseRC && (
            <div className="bg-white rounded-xl border border-border p-6">
              <button
                onClick={() => setExpandedStep(expandedStep === 'phase1_checklist' ? null : 'phase1_checklist')}
                className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mt-0.5">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-text-primary">Checklist des exigences</h3>
                    <p className="text-sm text-text-secondary mt-0.5">
                      {analyseRC.pieces_exigees?.length || 0} exigences identifiées
                    </p>
                  </div>
                </div>
                <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase1_checklist' && 'rotate-90')} />
              </button>

              {expandedStep === 'phase1_checklist' && (
                <div className="mt-6 pt-6 border-t border-border space-y-3">
                  {analyseRC.pieces_exigees?.map((piece, i) => (
                    <label key={i} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                      <input
                        type="checkbox"
                        className="mt-1"
                        onChange={e => {
                          const updated = [...checklist]
                          const idx = updated.findIndex(c => c.id === `piece_${i}`)
                          if (idx >= 0) updated[idx].done = e.target.checked
                          setChecklist(updated)
                        }}
                      />
                      <span className="text-sm text-text-primary">{typeof piece === 'string' ? piece : `${piece.piece}${piece.detail ? ` — ${piece.detail}` : ''}`}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PHASE 2: Je prépare ma réponse */}
      {phase === 2 && (
        <div className="space-y-4">
          {/* Step 2.1: Sélection références et équipe */}
          <div className="bg-white rounded-xl border border-border p-6">
            <button
              onClick={() => setExpandedStep(expandedStep === 'phase2_selection' ? null : 'phase2_selection')}
              className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mt-0.5">
                  <Users className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-text-primary">Sélection références et équipe</h3>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {selectedRefs.length} ref, {selectedCollabs.length} collab
                  </p>
                </div>
              </div>
              <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase2_selection' && 'rotate-90')} />
            </button>

            {expandedStep === 'phase2_selection' && (
              <div className="mt-6 pt-6 border-t border-border space-y-6">
                {references.length === 0 && collaborateurs.length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                    Vous n'avez pas encore ajouté de références ni de collaborateurs.{' '}
                    <Link href="/references" className="underline font-medium">Ajouter des références</Link>
                  </div>
                )}

                {references.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary mb-3">
                      Références ({selectedRefs.length} sélectionnée{selectedRefs.length > 1 ? 's' : ''})
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {references.map(ref => (
                        <label key={ref.id} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                          <input
                            type="checkbox"
                            checked={selectedRefs.includes(ref.id)}
                            onChange={e => setSelectedRefs(prev => e.target.checked ? [...prev, ref.id] : prev.filter(x => x !== ref.id))}
                            className="mt-0.5"
                          />
                          <div>
                            <p className="text-sm font-medium text-text-primary">{ref.titre}</p>
                            <p className="text-xs text-text-secondary">{ref.client}{ref.annee ? ` — ${ref.annee}` : ''}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-3">
                    Équipe ({selectedCollabs.length} sélectionné{selectedCollabs.length > 1 ? 's' : ''})
                  </h3>
                  {collaborateurs.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
                      {collaborateurs.map(c => (
                        <label key={c.id} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                          <input
                            type="checkbox"
                            checked={selectedCollabs.includes(c.id)}
                            onChange={e => setSelectedCollabs(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id))}
                            className="mt-0.5"
                          />
                          <div>
                            <p className="text-sm font-medium text-text-primary">{c.prenom} {c.nom}</p>
                            <p className="text-xs text-text-secondary">{c.poste}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="border border-dashed border-border rounded-lg p-3">
                    <p className="text-xs font-medium text-text-secondary mb-2">Ajouter un membre ad hoc</p>
                    <div className="flex gap-2">
                      <input
                        value={newCollab.prenom}
                        onChange={e => setNewCollab(prev => ({ ...prev, prenom: e.target.value }))}
                        placeholder="Prénom"
                        className="flex-1 border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <input
                        value={newCollab.nom}
                        onChange={e => setNewCollab(prev => ({ ...prev, nom: e.target.value }))}
                        placeholder="Nom *"
                        className="flex-1 border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <input
                        value={newCollab.poste}
                        onChange={e => setNewCollab(prev => ({ ...prev, poste: e.target.value }))}
                        placeholder="Poste"
                        className="flex-1 border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <button
                        onClick={addCollab}
                        disabled={!newCollab.nom.trim() || addingCollab}
                        className="flex items-center gap-1 bg-primary hover:bg-primary-hover text-white rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {addingCollab ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Ajouter
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Notes pour l'IA</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                    placeholder="Ex: Mettre en avant notre expertise en communication santé, insister sur la méthodologie agile..."
                  />
                </div>

                <div className="flex justify-end pt-4 border-t border-border">
                  <button
                    onClick={handleSaveSelection}
                    className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Enregistrer
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step 2.2: Documents administratifs */}
          <div className="bg-white rounded-xl border border-border p-6">
            <button
              onClick={() => setExpandedStep(expandedStep === 'phase2_docs' ? null : 'phase2_docs')}
              className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white mt-0.5',
                  allDocs.length > 0 ? 'bg-green-600' : 'bg-purple-100 text-purple-600'
                )}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-text-primary">Documents administratifs</h3>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {allDocs.length > 0 ? `${allDocs.length} document(s) généré(s)` : 'DC1, DC2, DC4, DUME'}
                  </p>
                </div>
                {allDocs.length > 0 && (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium">
                    <Sparkles className="w-3 h-3" /> Fait pour vous
                  </span>
                )}
              </div>
              <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase2_docs' && 'rotate-90')} />
            </button>

            {expandedStep === 'phase2_docs' && (
              <div className="mt-6 pt-6 border-t border-border space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-text-primary">Sélectionner les documents à générer</p>
                  {(Object.entries(docLabels) as [DocType, string][]).map(([type, label]) => {
                    const alreadyGenerated = ao?.documents_generes?.some(d => d.type === type)
                    return (
                      <label key={type} className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                        <input
                          type="checkbox"
                          checked={docsToGenerate.includes(type)}
                          onChange={e => setDocsToGenerate(prev => e.target.checked ? [...prev, type] : prev.filter(t => t !== type))}
                        />
                        <span className="text-sm text-text-primary flex-1">{label}</span>
                        {alreadyGenerated && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Généré</span>
                        )}
                      </label>
                    )
                  })}
                </div>

                <div>
                  <p className="text-sm font-medium text-text-primary mb-3">Format de sortie</p>
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

                <div className="flex justify-end pt-4 border-t border-border">
                  <button
                    onClick={handleGenerate}
                    disabled={generating || docsToGenerate.length === 0}
                    className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {generating ? 'Génération en cours...' : 'Générer les documents'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step 2.3: Mémoire technique */}
          <div className="bg-white rounded-xl border border-border p-6">
            <button
              onClick={() => setExpandedStep(expandedStep === 'phase2_memoire' ? null : 'phase2_memoire')}
              className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white mt-0.5',
                  allDocs.some(d => d.type === 'memoire_technique') ? 'bg-green-600' : 'bg-purple-100 text-purple-600'
                )}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-text-primary">Mémoire technique</h3>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {allDocs.some(d => d.type === 'memoire_technique') ? 'Généré' : 'Généralement le critère le plus important'}
                  </p>
                </div>
                {allDocs.some(d => d.type === 'memoire_technique') && (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium">
                    <Sparkles className="w-3 h-3" /> Fait pour vous
                  </span>
                )}
              </div>
              <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase2_memoire' && 'rotate-90')} />
            </button>

            {expandedStep === 'phase2_memoire' && (
              <div className="mt-6 pt-6 border-t border-border space-y-4">
                <p className="text-sm text-text-primary">
                  Le mémoire technique est généralement évalué avec la plus forte pondération. Il doit être complet et convaincant.
                </p>
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <Target className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <span className="text-sm text-blue-700">
                    {analyseRC?.criteres_notation?.find(c => c.critere?.toLowerCase().includes('technique'))?.ponderation_pourcentage}% de la note globale
                  </span>
                </div>
                {!allDocs.some(d => d.type === 'memoire_technique') && (
                  <div className="flex justify-end pt-4 border-t border-border">
                    <button
                      onClick={() => {
                        if (!docsToGenerate.includes('memoire_technique')) {
                          setDocsToGenerate([...docsToGenerate, 'memoire_technique'])
                        }
                        setExpandedStep('phase2_docs')
                      }}
                      className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
                    >
                      <Sparkles className="w-4 h-4" /> Générer le mémoire
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2.4: BPU / Offre financière */}
          <div className="bg-white rounded-xl border border-border p-6">
            <button
              onClick={() => setExpandedStep(expandedStep === 'phase2_bpu' ? null : 'phase2_bpu')}
              className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mt-0.5">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-text-primary">BPU et offre financière</h3>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {existingFiles.some(f => f.type === 'bpu') ? 'BPU fourni' : 'Uploadez votre BPU en Phase 1'}
                  </p>
                </div>
              </div>
              <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase2_bpu' && 'rotate-90')} />
            </button>

            {expandedStep === 'phase2_bpu' && (
              <div className="mt-6 pt-6 border-t border-border space-y-4">
                {existingFiles.some(f => f.type === 'bpu') ? (
                  <div className="text-sm text-text-primary">
                    <p className="mb-3">Saisissez vos prix unitaires :</p>
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2 text-xs font-medium text-text-secondary bg-gray-50 p-2 rounded">
                        <span>Article</span>
                        <span>Quantité</span>
                        <span>Prix unitaire</span>
                      </div>
                      {[1, 2, 3].map(i => (
                        <div key={i} className="grid grid-cols-3 gap-2 items-center p-2 border border-border rounded">
                          <span className="text-sm text-text-primary">Article {i}</span>
                          <input type="number" placeholder="Qty" className="px-2 py-1 text-sm border border-border rounded" />
                          <input
                            type="number"
                            placeholder="€"
                            value={bpuPrices[`article_${i}`] || ''}
                            onChange={e => setBpuPrices(prev => ({ ...prev, [`article_${i}`]: parseFloat(e.target.value) || 0 }))}
                            className="px-2 py-1 text-sm border border-border rounded"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                    <p className="text-sm text-text-secondary">Aucun BPU fourni</p>
                    <p className="text-xs text-text-secondary mt-1">Uploadez votre BPU dans la Phase 1 (Import des documents)</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PHASE 3: Je dépose mon dossier */}
      {phase === 3 && (
        <div className="space-y-4">
          {/* Step 3.1: Checklist de conformité finale */}
          <div className="bg-white rounded-xl border border-border p-6">
            <button
              onClick={() => setExpandedStep(expandedStep === 'phase3_checklist' ? null : 'phase3_checklist')}
              className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 mt-0.5">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-text-primary">Checklist de conformité</h3>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {checklistDone}/{checklistTotal} éléments complétés
                  </p>
                </div>
              </div>
              <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase3_checklist' && 'rotate-90')} />
            </button>

            {expandedStep === 'phase3_checklist' && (
              <div className="mt-6 pt-6 border-t border-border space-y-3">
                {/* Vérifier les documents générés */}
                {allDocs.map((doc, i) => (
                  <label key={i} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary">{docLabels[doc.type as DocType] || doc.type}</p>
                      <p className="text-xs text-text-secondary">Généré le {new Date(doc.genere_le).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  </label>
                ))}

                {/* Éléments de conformité */}
                {checklist.filter(c => c.category !== 'document').map(item => (
                  <label key={item.id} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={e => {
                        const updated = [...checklist]
                        const idx = updated.findIndex(c => c.id === item.id)
                        if (idx >= 0) updated[idx].done = e.target.checked
                        setChecklist(updated)
                      }}
                      className="mt-1"
                    />
                    <span className="text-sm text-text-primary flex-1">{item.label}</span>
                    {item.done && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                  </label>
                ))}

                {checklist.length === 0 && (
                  <div className="text-center py-6 text-text-secondary text-sm">
                    Aucun élément de conformité. Complétez les phases précédentes.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 3.2: Téléchargement ZIP */}
          <div className="bg-white rounded-xl border border-border p-6">
            <button
              onClick={() => setExpandedStep(expandedStep === 'phase3_download' ? null : 'phase3_download')}
              className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 mt-0.5">
                  <Download className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-text-primary">Télécharger tous les documents</h3>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {allDocs.length > 0 ? `${allDocs.length} document(s) à télécharger` : 'Générez les documents ci-dessus'}
                  </p>
                </div>
              </div>
              <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase3_download' && 'rotate-90')} />
            </button>

            {expandedStep === 'phase3_download' && (
              <div className="mt-6 pt-6 border-t border-border space-y-4">
                {allDocs.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-text-primary">Documents inclus :</p>
                      <ul className="space-y-1">
                        {allDocs.map((doc, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                            {docLabels[doc.type as DocType] || doc.type}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-border">
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
                            toast.success('Dossier téléchargé')
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Télécharger (.zip)
                      </button>
                      <button
                        onClick={() => setPhase(2)}
                        className="flex items-center gap-2 border border-border text-text-secondary hover:text-primary hover:border-primary rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Modifier
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <Package className="w-8 h-8 text-text-secondary mx-auto mb-2" />
                    <p className="text-sm text-text-secondary">Aucun document généré</p>
                    <p className="text-xs text-text-secondary mt-1">Allez à la Phase 2 pour générer vos documents</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 3.3: Lien plateforme et deadline */}
          <div className="bg-white rounded-xl border border-border p-6">
            <button
              onClick={() => setExpandedStep(expandedStep === 'phase3_deadline' ? null : 'phase3_deadline')}
              className="w-full flex items-start justify-between hover:bg-gray-50 p-2 -m-2 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 mt-0.5">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-text-primary">Plateforme et deadline</h3>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {dateLimite ? `À remettre avant le ${new Date(dateLimite).toLocaleDateString('fr-FR')}` : 'Date limite non définie'}
                  </p>
                </div>
              </div>
              <ChevronRight className={cn('w-5 h-5 text-text-secondary transition-transform', expandedStep === 'phase3_deadline' && 'rotate-90')} />
            </button>

            {expandedStep === 'phase3_deadline' && (
              <div className="mt-6 pt-6 border-t border-border space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {dateLimite && (
                    <div className="rounded-lg p-4 bg-red-50 border border-red-200">
                      <p className="text-xs font-medium text-red-600 uppercase mb-1">Date limite</p>
                      <p className="text-lg font-bold text-red-700">
                        {new Date(dateLimite).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        À {new Date(dateLimite).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}
                  {ao?.url_profil_acheteur && (
                    <a
                      href={ao.url_profil_acheteur}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg p-4 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      <p className="text-xs font-medium text-blue-600 uppercase mb-1">Plateforme d'achat</p>
                      <p className="text-sm font-semibold text-blue-700 flex items-center gap-1">
                        Accéder <ExternalLink className="w-3 h-3" />
                      </p>
                    </a>
                  )}
                </div>

                <div className="flex justify-center pt-4 border-t border-border">
                  <button
                    onClick={async () => {
                      const supabase = createClient()
                      await supabase.from('appels_offres').update({
                        statut: 'soumis',
                      }).eq('id', id)
                      toast.success('Dossier marqué comme soumis')
                    }}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg px-8 py-3 text-base font-semibold transition-colors"
                  >
                    <Send className="w-5 h-5" />
                    Marquer comme soumis
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
