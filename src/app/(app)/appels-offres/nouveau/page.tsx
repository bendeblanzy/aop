'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/context/OrganizationContext'
import { Upload, Brain, CheckSquare, FileDown, Eye, ChevronRight, ChevronLeft, Loader2, X, File, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnalyseRC, AnalyseCCTP, Reference, Collaborateur } from '@/lib/types'

const STEPS = [
  { id: 1, label: 'Documents', icon: Upload },
  { id: 2, label: 'Analyse IA', icon: Brain },
  { id: 3, label: 'Sélection', icon: CheckSquare },
  { id: 4, label: 'Génération', icon: FileDown },
  { id: 5, label: 'Téléchargement', icon: Eye },
]

type DocType = 'dc1' | 'dc2' | 'dc4' | 'dume' | 'memoire_technique'
type OutputFormat = 'docx' | 'pdf'

export default function NouvelAOPage() {
  const router = useRouter()
  const { orgId } = useOrganization()
  const [step, setStep] = useState(1)
  const [aoId, setAoId] = useState<string | null>(null)
  const [titre, setTitre] = useState('')
  const [acheteur, setAcheteur] = useState('')
  const [referencemarche, setReferencemarche] = useState('')
  const [dateLimite, setDateLimite] = useState('')

  // Étape 1
  const [files, setFiles] = useState<{ file: File; type: 'rc' | 'cctp' | 'avis' | 'autre' }[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<{ nom: string; url: string; type: string; taille: number }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

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

  function detectFileType(name: string): 'rc' | 'cctp' | 'avis' | 'autre' {
    const n = name.toLowerCase().replace(/\.[^.]+$/, '') // retire l'extension
    // Découpe sur séparateurs pour tester les mots exacts
    const words = n.split(/[\s\-_\.\/\\]+/)
    if (words.includes('rc') || n.includes('reglement') || n.includes('règlement') || n.includes('consultation')) return 'rc'
    if (words.includes('cctp') || n.includes('cahier des charges') || n.includes('technique') || n.includes('prescriptions')) return 'cctp'
    if (words.includes('avis') || n.includes('avis de marche') || n.includes('avis de marché') || n.includes('annonce')) return 'avis'
    return 'autre'
  }

  async function handleFileAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const added = Array.from(e.target.files || [])
    const typed = added.map(f => ({ file: f, type: detectFileType(f.name) }))
    setFiles(prev => [...prev, ...typed])
  }

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
    const typed = dropped.map(f => ({ file: f, type: detectFileType(f.name) }))
    setFiles(prev => [...prev, ...typed])
  }

  async function handleUpload() {
    if (!titre.trim()) return alert('Veuillez saisir un titre pour cet appel d\'offres')
    if (!orgId) return alert('Organisation non chargée, veuillez réessayer.')
    setUploading(true)
    const supabase = createClient()

    // Créer l'AO
    const { data: ao, error } = await supabase.from('appels_offres').insert({
      organization_id: orgId,
      titre,
      acheteur: acheteur || null,
      reference_marche: referencemarche || null,
      date_limite_reponse: dateLimite || null,
      statut: 'en_cours',
    }).select().single()

    if (error || !ao) {
      alert('Erreur lors de la création de l\'AO: ' + error?.message)
      setUploading(false)
      return
    }
    setAoId(ao.id)

    // Upload files
    const uploaded = []
    for (const { file, type } of files) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('ao_id', ao.id)
      formData.append('type', type)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        uploaded.push({ nom: file.name, url: data.url, type, taille: file.size })
      }
    }
    setUploadedFiles(uploaded)

    // Update AO with files
    await supabase.from('appels_offres').update({
      fichiers_source: uploaded
    }).eq('id', ao.id)

    setUploading(false)
    setStep(2)
  }

  async function handleAnalyse() {
    if (!aoId) return
    setAnalysing(true)
    setAnalyseError('')

    const rcFile = uploadedFiles.find(f => f.type === 'rc')
    const cctpFile = uploadedFiles.find(f => f.type === 'cctp')

    let rc = null
    let cctp = null

    if (rcFile) {
      const res = await fetch('/api/ai/analyze-rc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ao_id: aoId, file_url: rcFile.url }),
      })
      if (res.ok) rc = (await res.json()).analyse
    }

    if (cctpFile) {
      const res = await fetch('/api/ai/analyze-cctp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ao_id: aoId, file_url: cctpFile.url }),
      })
      if (res.ok) cctp = (await res.json()).analyse
    }

    if (!rc && !cctp) {
      setAnalyseError('Aucun fichier RC ou CCTP trouvé. Uploadez au moins un de ces documents.')
      setAnalysing(false)
      return
    }

    setAnalyseRC(rc)
    setAnalyseCCTP(cctp)

    // Charger références et collaborateurs pour l'étape 3 (RLS filtre automatiquement par org)
    const supabase = createClient()
    const [{ data: refs }, { data: collabs }] = await Promise.all([
      supabase.from('references').select('*').order('annee', { ascending: false }),
      supabase.from('collaborateurs').select('*').order('nom'),
    ])
    setReferences(refs || [])
    setCollaborateurs(collabs || [])

    setAnalysing(false)
    setStep(3)
  }

  async function handleSaveSelection() {
    if (!aoId) return
    const supabase = createClient()
    await supabase.from('appels_offres').update({
      references_selectionnees: selectedRefs,
      collaborateurs_selectionnes: selectedCollabs,
      notes_utilisateur: notes,
      statut: 'analyse',
    }).eq('id', aoId)
    setStep(4)
  }

  async function handleGenerate() {
    if (!aoId) return
    setGenerating(true)
    setGenError('')

    const docs = []
    for (const docType of docsToGenerate) {
      const res = await fetch(`/api/ai/generate-${docType === 'memoire_technique' ? 'memoire' : docType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ao_id: aoId, format: outputFormat }),
      })
      if (res.ok) {
        const data = await res.json()
        docs.push({ type: docType, url: data.url, nom: data.nom })
      }
    }

    if (docs.length === 0) {
      setGenError('Erreur lors de la génération des documents. Vérifiez votre clé API Anthropic.')
      setGenerating(false)
      return
    }

    setGeneratedDocs(docs)
    const supabase = createClient()
    await supabase.from('appels_offres').update({
      statut: 'genere',
      documents_generes: docs.map((d) => ({
        type: d.type, url: d.url, version: 1, genere_le: new Date().toISOString()
      }))
    }).eq('id', aoId)

    setGenerating(false)
    setStep(5)
  }

  const docLabels: Record<DocType, string> = {
    dc1: 'DC1 — Lettre de candidature',
    dc2: 'DC2 — Déclaration du candidat',
    dc4: 'DC4 — Déclaration de sous-traitance',
    dume: 'DUME — Document Unique Européen',
    memoire_technique: 'Mémoire technique',
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Nouvel appel d&apos;offres</h1>
        <p className="text-text-secondary mt-1">Suivez les étapes pour générer vos documents</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center mb-10">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <div className={cn(
              'flex flex-col items-center',
              i < STEPS.length - 1 ? 'flex-1' : ''
            )}>
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors',
                step > s.id ? 'bg-primary border-primary text-white' :
                step === s.id ? 'border-primary text-primary bg-primary-light' :
                'border-border text-text-secondary bg-white'
              )}>
                {step > s.id ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-4 h-4" />}
              </div>
              <span className={cn(
                'text-xs mt-1.5 font-medium',
                step >= s.id ? 'text-primary' : 'text-text-secondary'
              )}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('h-0.5 flex-1 mx-2 mb-5', step > s.id ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border p-8">

        {/* ÉTAPE 1 — Upload */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-text-primary">Informations et documents</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1.5">Titre de l&apos;appel d&apos;offres *</label>
                <input value={titre} onChange={e => setTitre(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="Ex: Maintenance réseau informatique 2025" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Acheteur public</label>
                <input value={acheteur} onChange={e => setAcheteur(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="Ex: Mairie de Lyon" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Référence du marché</label>
                <input value={referencemarche} onChange={e => setReferencemarche(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="Ex: BOAMP 26-24653" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Date limite de réponse</label>
                <input type="datetime-local" value={dateLimite} onChange={e => setDateLimite(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Documents de l&apos;appel d&apos;offres</label>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                onDragEnter={e => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={e => { e.preventDefault(); setIsDragOver(false) }}
                onDrop={handleDrop}
                className={cn(
                  'flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl transition-colors',
                  isDragOver
                    ? 'border-primary bg-primary-light/50 scale-[1.01]'
                    : 'border-border hover:border-primary hover:bg-primary-light/30'
                )}
              >
                <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
                  <Upload className={cn('w-8 h-8 mb-2', isDragOver ? 'text-primary' : 'text-text-secondary')} />
                  <span className={cn('text-sm font-medium', isDragOver ? 'text-primary' : 'text-text-secondary')}>
                    {isDragOver ? 'Relâchez pour ajouter les fichiers' : 'Glissez vos fichiers ici ou cliquez pour sélectionner'}
                  </span>
                  <span className="text-xs text-text-secondary mt-1">PDF, DOCX acceptés · RC, CCTP, avis de marché</span>
                  <input type="file" multiple accept=".pdf,.docx,.doc" onChange={handleFileAdd} className="hidden" />
                </label>
              </div>
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-surface rounded-lg px-4 py-3">
                    <File className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm text-text-primary flex-1 truncate">{f.file.name}</span>
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
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-text-secondary hover:text-danger">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleUpload}
                disabled={uploading || !titre.trim()}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {uploading ? 'Envoi en cours...' : 'Continuer'}
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 — Analyse IA */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-text-primary">Analyse IA des documents</h2>
            <p className="text-text-secondary text-sm">L&apos;IA va analyser vos documents et extraire toutes les informations clés (critères de notation, pièces exigées, etc.)</p>

            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                    <span className="text-sm text-text-primary">{f.nom}</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-auto">{f.type.toUpperCase()}</span>
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

            {analyseRC && (
              <div className="bg-surface rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-text-primary">Résultats analyse RC</h3>
                {analyseRC.objet && <div><span className="text-xs font-medium text-text-secondary uppercase">Objet</span><p className="text-sm text-text-primary mt-0.5">{analyseRC.objet}</p></div>}
                {Array.isArray(analyseRC.criteres_notation) && analyseRC.criteres_notation.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-text-secondary uppercase">Critères de notation</span>
                    <div className="mt-2 space-y-1">
                      {analyseRC.criteres_notation.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-text-primary">{c.critere}</span>
                          <span className="font-medium text-primary">{c.ponderation_pourcentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(analyseRC.pieces_exigees) && analyseRC.pieces_exigees.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-text-secondary uppercase">Pièces exigées</span>
                    <ul className="mt-1 space-y-0.5">
                      {analyseRC.pieces_exigees.map((p, i) => <li key={i} className="text-sm text-text-primary">• {p}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm">
                <ChevronLeft className="w-4 h-4" /> Retour
              </button>
              <button
                onClick={handleAnalyse}
                disabled={analysing}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {analysing ? 'Analyse en cours...' : analyseRC ? 'Continuer' : 'Lancer l\'analyse'}
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 — Sélection */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-text-primary">Sélection des éléments</h2>

            {references.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-3">Références à inclure ({selectedRefs.length} sélectionnée{selectedRefs.length > 1 ? 's' : ''})</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {references.map(ref => (
                    <label key={ref.id} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                      <input type="checkbox" checked={selectedRefs.includes(ref.id)} onChange={e => setSelectedRefs(prev => e.target.checked ? [...prev, ref.id] : prev.filter(id => id !== ref.id))} className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{ref.titre}</p>
                        <p className="text-xs text-text-secondary">{ref.client} {ref.annee ? `— ${ref.annee}` : ''}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {collaborateurs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-3">Collaborateurs à affecter</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {collaborateurs.map(c => (
                    <label key={c.id} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                      <input type="checkbox" checked={selectedCollabs.includes(c.id)} onChange={e => setSelectedCollabs(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} className="mt-0.5" />
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
              <label className="block text-sm font-medium text-text-primary mb-1.5">Notes complémentaires</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" placeholder="Instructions particulières pour la génération des documents..." />
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm">
                <ChevronLeft className="w-4 h-4" /> Retour
              </button>
              <button onClick={handleSaveSelection} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors">
                <ChevronRight className="w-4 h-4" /> Continuer
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 4 — Génération */}
        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-text-primary">Génération des documents</h2>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Documents à générer</h3>
              <div className="space-y-2">
                {(Object.entries(docLabels) as [DocType, string][]).map(([type, label]) => (
                  <label key={type} className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-surface">
                    <input
                      type="checkbox"
                      checked={docsToGenerate.includes(type)}
                      onChange={e => setDocsToGenerate(prev => e.target.checked ? [...prev, type] : prev.filter(t => t !== type))}
                    />
                    <span className="text-sm text-text-primary">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Format de sortie</h3>
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
                <AlertCircle className="w-4 h-4 text-danger mt-0.5" />
                <span className="text-sm text-danger">{genError}</span>
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
            <div className="text-center py-6">
              <CheckCircle2 className="w-16 h-16 text-secondary mx-auto mb-4" />
              <h2 className="text-xl font-bold text-text-primary">Documents générés avec succès !</h2>
              <p className="text-text-secondary mt-1">Vos documents sont prêts à être téléchargés</p>
            </div>

            <div className="space-y-3">
              {generatedDocs.map((doc) => (
                <div key={doc.type} className="flex items-center justify-between bg-surface rounded-lg px-4 py-3 border border-border">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-secondary" />
                    <span className="text-sm font-medium text-text-primary">{docLabels[doc.type]}</span>
                  </div>
                  <a href={doc.url} download={doc.nom} className="text-sm text-primary hover:underline font-medium">
                    Télécharger
                  </a>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-between">
              <button
                onClick={async () => {
                  const res = await fetch('/api/documents/download-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ao_id: aoId }),
                  })
                  if (res.ok) {
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `AO-${titre}-documents.zip`
                    a.click()
                  }
                }}
                className="flex items-center gap-2 border border-primary text-primary hover:bg-primary-light rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
              >
                <FileDown className="w-4 h-4" />
                Tout télécharger (.zip)
              </button>
              <button
                onClick={() => router.push(`/appels-offres/${aoId}`)}
                className="bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
              >
                Voir le détail de l&apos;AO
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
