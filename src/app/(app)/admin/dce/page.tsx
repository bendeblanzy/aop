'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ExternalLink, EyeOff, Eye, FileText, CheckCircle2,
  Clock, Building2, Euro, Loader2, AlertCircle, Upload,
  RefreshCw, ArrowRight, Zap, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DceDocument {
  filename: string
  url: string
  type: string
  label: string
  taille: number
  uploaded_at: string
}

interface DceRecord {
  id: string
  status: string
  documents: DceDocument[]
  ao_id: string | null
  updated_at: string
}

interface TenderItem {
  idweb: string
  objet: string | null
  nomacheteur: string | null
  dateparution: string | null
  datelimitereponse: string | null
  url_profil_acheteur: string | null
  url_avis: string | null
  descripteur_libelles: string[]
  valeur_estimee: number | null
  famille: string | null
  score: number | null
  dce: DceRecord | null
  dce_status: string
}

type TabKey = 'pending' | 'uploaded' | 'ignored'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDeadline(iso: string | null): { label: string; urgent: boolean; days: number } {
  if (!iso) return { label: '—', urgent: false, days: 999 }
  const d = new Date(iso)
  const diff = d.getTime() - Date.now()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days < 0) return { label: 'Expiré', urgent: true, days }
  if (days <= 7) return { label: `J-${days}`, urgent: true, days }
  if (days <= 14) return { label: `J-${days}`, urgent: false, days }
  return { label: `J-${days}`, urgent: false, days }
}

function formatEuros(v: number | null) {
  if (!v) return null
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M€`
  if (v >= 1_000) return `${Math.round(v / 1_000)} k€`
  return `${v} €`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function isToday(iso: string | null) {
  if (!iso) return false
  const d = new Date(iso)
  const today = new Date()
  return d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
}

const DOC_TYPE_COLORS: Record<string, string> = {
  rc: 'bg-blue-100 text-blue-700',
  ccap: 'bg-purple-100 text-purple-700',
  cctp: 'bg-indigo-100 text-indigo-700',
  bpu: 'bg-green-100 text-green-700',
  ae: 'bg-orange-100 text-orange-700',
  dpgf: 'bg-teal-100 text-teal-700',
  avis: 'bg-gray-100 text-gray-700',
  autre: 'bg-gray-100 text-gray-500',
}

// ── Composant TenderCard ──────────────────────────────────────────────────────

interface TenderCardProps {
  tender: TenderItem
  onIgnore: (idweb: string) => void
  onUnignore: (idweb: string) => void
  onUploadComplete: (idweb: string, aoId: string, docs: DceDocument[], hasRc: boolean) => void
}

function TenderCard({ tender, onIgnore, onUnignore, onUploadComplete }: TenderCardProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [dragging, setDragging] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const deadline = formatDeadline(tender.datelimitereponse)
  const isUploaded = tender.dce_status === 'uploaded'
  const isIgnored = tender.dce_status === 'ignored'
  const docs = tender.dce?.documents ?? []

  const handleFiles = useCallback(async (files: File[]) => {
    if (!files.length || uploading) return
    setUploading(true)
    setUploadProgress('Préparation…')

    try {
      // Étape 1 : créer / récupérer l'AO lié
      const prepRes = await fetch('/api/admin/dce/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tender_idweb: tender.idweb }),
      })
      if (!prepRes.ok) throw new Error('Impossible de préparer l\'AO')
      const { ao_id } = await prepRes.json()

      // Étape 2 : upload chaque fichier via signed URL
      const uploadedFiles: { filename: string; url: string; size: number }[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadProgress(`Upload ${i + 1}/${files.length} : ${file.name}`)

        // Obtenir une signed URL
        const signedRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            aoId: ao_id,
            contentType: file.type || 'application/octet-stream',
          }),
        })
        if (!signedRes.ok) throw new Error(`Erreur signed URL pour ${file.name}`)
        const { signedUrl, publicUrl } = await signedRes.json()

        // Upload direct vers Supabase Storage
        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        })
        if (!uploadRes.ok) throw new Error(`Erreur upload ${file.name}`)

        uploadedFiles.push({ filename: file.name, url: publicUrl, size: file.size })
      }

      // Étape 3 : analyse Claude
      setUploadProgress('Analyse IA en cours…')
      const analyzeRes = await fetch('/api/admin/dce/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tender_idweb: tender.idweb, ao_id, files: uploadedFiles }),
      })
      if (!analyzeRes.ok) throw new Error('Erreur lors de l\'analyse')
      const result = await analyzeRes.json()

      toast.success(
        result.has_rc
          ? '✅ Documents analysés — RC extrait avec succès'
          : '✅ Documents importés — RC non détecté, analyse manuelle possible'
      )

      onUploadComplete(tender.idweb, ao_id, result.documents, result.has_rc)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error(`Erreur : ${msg}`)
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }, [tender.idweb, uploading, onUploadComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.name.toLowerCase().endsWith('.pdf') ||
           f.name.toLowerCase().endsWith('.docx') ||
           f.name.toLowerCase().endsWith('.doc')
    )
    if (files.length) handleFiles(files)
    else toast.error('Seuls les fichiers PDF et DOCX sont acceptés')
  }, [handleFiles])

  return (
    <div className={cn(
      'bg-white border rounded-xl overflow-hidden transition-all',
      isIgnored ? 'border-border opacity-60' : 'border-border shadow-sm',
      isUploaded && 'border-l-4 border-l-success',
    )}>
      {/* Header de la carte */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Score */}
          {tender.score !== null && (
            <span className={cn(
              'shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
              tender.score >= 7 ? 'bg-success/10 text-success' :
              tender.score >= 5 ? 'bg-warning/10 text-warning' :
              'bg-gray-100 text-gray-500'
            )}>
              {tender.score}
            </span>
          )}

          {/* Titre + meta */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-text-primary text-sm leading-snug line-clamp-2">
              {tender.objet ?? 'Sans titre'}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
              {tender.nomacheteur && (
                <span className="flex items-center gap-1 text-xs text-text-secondary">
                  <Building2 className="w-3 h-3 shrink-0" />
                  {tender.nomacheteur}
                </span>
              )}
              <span className={cn(
                'flex items-center gap-1 text-xs font-medium',
                deadline.urgent ? 'text-danger' : 'text-text-secondary'
              )}>
                <Clock className="w-3 h-3 shrink-0" />
                {deadline.label}
              </span>
              {tender.valeur_estimee && (
                <span className="flex items-center gap-1 text-xs text-text-secondary">
                  <Euro className="w-3 h-3 shrink-0" />
                  {formatEuros(tender.valeur_estimee)}
                </span>
              )}
              {isToday(tender.dateparution) && (
                <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded-full">
                  Nouveau
                </span>
              )}
            </div>
          </div>

          {/* Actions rapides */}
          <div className="shrink-0 flex items-center gap-1.5">
            {tender.url_profil_acheteur ? (
              <a
                href={tender.url_profil_acheteur}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 bg-primary text-white text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-primary-hover transition-colors"
                title="Ouvrir la plateforme"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Plateforme
              </a>
            ) : tender.url_avis ? (
              <a
                href={tender.url_avis}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 bg-primary text-white text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-primary-hover transition-colors"
                title="Voir l'avis BOAMP"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                BOAMP
              </a>
            ) : null}

            {!isIgnored ? (
              <button
                onClick={() => onIgnore(tender.idweb)}
                className="p-1.5 text-text-secondary hover:text-danger hover:bg-red-50 rounded-lg transition-colors"
                title="Ignorer cet AO"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => onUnignore(tender.idweb)}
                className="p-1.5 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                title="Remettre dans la liste"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Zone documents / upload */}
      {!isIgnored && (
        <div className="border-t border-border/60">
          {isUploaded && docs.length > 0 ? (
            /* Documents uploadés */
            <div className="px-4 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex flex-wrap gap-1.5">
                  {docs.map((doc) => (
                    <a
                      key={doc.filename}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-opacity hover:opacity-80',
                        DOC_TYPE_COLORS[doc.type] ?? DOC_TYPE_COLORS.autre
                      )}
                      title={`${doc.label} — ${(doc.taille / 1024).toFixed(0)} ko`}
                    >
                      <FileText className="w-3 h-3 shrink-0" />
                      {doc.label ?? doc.filename}
                    </a>
                  ))}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {/* Bouton ajouter d'autres documents */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-xs text-text-secondary hover:text-primary transition-colors"
                    title="Ajouter des documents"
                  >
                    + doc
                  </button>
                  {tender.dce?.ao_id && (
                    <Link
                      href={`/appels-offres/${tender.dce.ao_id}`}
                      className="flex items-center gap-1 text-xs font-medium text-success hover:underline"
                    >
                      Voir l&apos;AO <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : uploading ? (
            /* En cours d'upload */
            <div className="px-4 py-3 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              <span className="text-sm text-text-secondary">{uploadProgress}</span>
            </div>
          ) : (
            /* Zone de drop */
            <div
              className={cn(
                'mx-4 my-2.5 border-2 border-dashed rounded-lg px-4 py-3 text-center cursor-pointer transition-colors',
                dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border/60 hover:border-primary/40 hover:bg-surface'
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="flex items-center justify-center gap-2 text-text-secondary">
                <Upload className="w-4 h-4 shrink-0" />
                <span className="text-xs">
                  Déposer RC, CCAP, CCTP… ou <span className="text-primary font-medium">cliquer pour sélectionner</span>
                </span>
              </div>
              <p className="text-xs text-text-secondary/60 mt-0.5">PDF, DOCX — plusieurs fichiers acceptés</p>
            </div>
          )}
        </div>
      )}

      {/* Input file caché */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) handleFiles(files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function AdminDcePage() {
  const [tenders, setTenders] = useState<TenderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [showIgnored, setShowIgnored] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTenders = useCallback(async (tab: TabKey) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/dce?status=${tab}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Erreur serveur')
      }
      const data = await res.json()
      setTenders(data.tenders ?? [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTenders(activeTab)
  }, [activeTab, fetchTenders])

  const handleIgnore = useCallback(async (idweb: string) => {
    await fetch('/api/admin/dce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ignore', tender_idweb: idweb }),
    })
    setTenders(prev => prev.filter(t => t.idweb !== idweb))
    toast.success('AO ignoré')
  }, [])

  const handleUnignore = useCallback(async (idweb: string) => {
    await fetch('/api/admin/dce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unignore', tender_idweb: idweb }),
    })
    setTenders(prev => prev.filter(t => t.idweb !== idweb))
    toast.success('AO remis dans la liste')
  }, [])

  const handleUploadComplete = useCallback((
    idweb: string,
    aoId: string,
    docs: DceDocument[],
    _hasRc: boolean,
  ) => {
    setTenders(prev => prev.map(t => {
      if (t.idweb !== idweb) return t
      return {
        ...t,
        dce_status: 'uploaded',
        dce: {
          id: t.dce?.id ?? '',
          status: 'uploaded',
          documents: docs,
          ao_id: aoId,
          updated_at: new Date().toISOString(),
        },
      }
    }))
    // Si on est sur l'onglet "pending", retirer le tender après un court délai
    if (activeTab === 'pending') {
      setTimeout(() => {
        setTenders(prev => prev.filter(t => t.idweb !== idweb))
      }, 2000)
    }
  }, [activeTab])

  // Séparer nouveaux (aujourd'hui) et anciens
  const todayTenders = tenders.filter(t => isToday(t.dateparution))
  const olderTenders = tenders.filter(t => !isToday(t.dateparution))

  // Stats
  const totalPending = tenders.length

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'pending', label: 'À traiter', icon: <Clock className="w-4 h-4" /> },
    { key: 'uploaded', label: 'Avec DCE', icon: <CheckCircle2 className="w-4 h-4" /> },
    { key: 'ignored', label: 'Ignorés', icon: <EyeOff className="w-4 h-4" /> },
  ]

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Gestion des DCE
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Téléchargez les documents sur la plateforme, puis déposez-les ici pour analyse automatique
          </p>
        </div>
        <button
          onClick={() => fetchTenders(activeTab)}
          disabled={loading}
          className="p-2 text-text-secondary hover:text-primary hover:bg-surface rounded-lg transition-colors"
          title="Rafraîchir"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 mb-5">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-white text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Erreur */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-danger border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          {error.includes('does not exist') && (
            <span className="ml-2 font-medium">
              → <a href="/api/admin/migrate-005" target="_blank" className="underline">Exécuter la migration 005</a> dans Supabase SQL Editor
            </span>
          )}
        </div>
      )}

      {/* Contenu */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : tenders.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
          <p className="font-medium text-text-primary">
            {activeTab === 'pending' ? 'Tout est traité ✓' :
             activeTab === 'uploaded' ? 'Aucun DCE importé pour le moment' :
             'Aucun AO ignoré'}
          </p>
          <p className="text-sm text-text-secondary mt-1">
            {activeTab === 'pending' && 'Revenez demain pour les nouvelles annonces'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Nouveaux aujourd'hui */}
          {activeTab === 'pending' && todayTenders.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  Aujourd&apos;hui — {todayTenders.length} nouveau{todayTenders.length > 1 ? 'x' : ''}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {todayTenders.map(t => (
                <TenderCard
                  key={t.idweb}
                  tender={t}
                  onIgnore={handleIgnore}
                  onUnignore={handleUnignore}
                  onUploadComplete={handleUploadComplete}
                />
              ))}
            </>
          )}

          {/* AOs plus anciens (onglet pending uniquement) */}
          {activeTab === 'pending' && olderTenders.length > 0 && (
            <>
              {todayTenders.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    En attente — {olderTenders.length}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              {olderTenders.map(t => (
                <TenderCard
                  key={t.idweb}
                  tender={t}
                  onIgnore={handleIgnore}
                  onUnignore={handleUnignore}
                  onUploadComplete={handleUploadComplete}
                />
              ))}
            </>
          )}

          {/* Onglets uploaded / ignored : liste simple */}
          {activeTab !== 'pending' && tenders.map(t => (
            <TenderCard
              key={t.idweb}
              tender={t}
              onIgnore={handleIgnore}
              onUnignore={handleUnignore}
              onUploadComplete={handleUploadComplete}
            />
          ))}
        </div>
      )}

      {/* Compteur bas de page */}
      {!loading && tenders.length > 0 && (
        <p className="text-center text-xs text-text-secondary mt-5">
          {totalPending} AO{totalPending > 1 ? 's' : ''} affiché{totalPending > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
