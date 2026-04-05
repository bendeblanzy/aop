'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Zap, AlertCircle, Settings, ExternalLink,
  FileText, Building2, Calendar, Euro, Clock, ChevronRight,
  RefreshCw, Filter, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { toast } from 'sonner'

interface TenderItem {
  id: string
  idweb: string
  objet: string | null
  nomacheteur: string | null
  dateparution: string | null
  datelimitereponse: string | null
  descripteur_libelles: string[]
  valeur_estimee: number | null
  duree_mois: number | null
  url_avis: string | null
  url_profil_acheteur: string | null
  description_detail: string | null
  score: number | null
  reason: string | null
}

interface ApiResponse {
  tenders: TenderItem[]
  total: number
  page: number
  limit: number
  hasBoampCodes: boolean
  hasActiviteMetier: boolean
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return (
    <span className="text-xs text-text-secondary bg-gray-100 px-2 py-0.5 rounded-full">Non scoré</span>
  )
  const color =
    score >= 80 ? 'bg-green-100 text-green-700' :
    score >= 60 ? 'bg-blue-100 text-blue-700' :
    score >= 40 ? 'bg-amber-100 text-amber-700' :
    'bg-red-100 text-red-700'
  return (
    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', color)}>
      {score}%
    </span>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return iso }
}

function formatDeadline(iso: string | null): { label: string; urgent: boolean } {
  if (!iso) return { label: '—', urgent: false }
  try {
    const d = new Date(iso)
    const diff = d.getTime() - Date.now()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (days < 0) return { label: 'Expiré', urgent: true }
    if (days <= 7) return { label: `J-${days}`, urgent: true }
    return { label: formatDate(iso), urgent: false }
  } catch { return { label: iso, urgent: false } }
}

function formatEuros(value: number | null) {
  if (!value) return null
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M€`
  if (value >= 1_000) return `${Math.round(value / 1_000)} k€`
  return `${value} €`
}

export default function VeillePage() {
  const router = useRouter()
  const [tenders, setTenders] = useState<TenderItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [minScore, setMinScore] = useState<number | null>(null)
  const [hasBoampCodes, setHasBoampCodes] = useState(true)
  const [hasActiviteMetier, setHasActiviteMetier] = useState(true)
  const LIMIT = 30
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchTenders = useCallback(async (p = 0, s = search) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT),
        active_only: String(activeOnly),
        ...(s.trim() ? { search: s } : {}),
        ...(minScore !== null ? { min_score: String(minScore) } : {}),
      })
      const res = await fetch(`/api/veille/tenders?${params}`)
      if (!res.ok) throw new Error('Erreur API')
      const data: ApiResponse = await res.json()
      setTenders(data.tenders)
      setTotal(data.total)
      setPage(p)
      setHasBoampCodes(data.hasBoampCodes)
      setHasActiviteMetier(data.hasActiviteMetier)

      // Auto-score les tenders sans score (max 20 en arrière-plan)
      const unscored = data.tenders.filter(t => t.score === null).map(t => t.idweb).slice(0, 20)
      if (unscored.length > 0 && data.hasActiviteMetier) {
        autoScore(unscored, data.tenders)
      }
    } catch (e) {
      toast.error('Impossible de charger les annonces')
    } finally {
      setLoading(false)
    }
  }, [search, activeOnly, minScore])

  async function autoScore(idwebs: string[], currentTenders: TenderItem[]) {
    try {
      const res = await fetch('/api/veille/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idwebs }),
      })
      if (!res.ok) return
      const { scores } = await res.json()
      if (!Array.isArray(scores)) return

      setTenders(prev => prev.map(t => {
        const found = scores.find((s: { idweb: string; score: number; raison: string }) => s.idweb === t.idweb)
        if (!found) return t
        return { ...t, score: found.score, reason: found.raison }
      }))
    } catch {
      // silent fail — scoring is best-effort
    }
  }

  async function handleManualScore() {
    setScoring(true)
    const idwebs = tenders.map(t => t.idweb).slice(0, 20)
    try {
      const res = await fetch('/api/veille/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idwebs }),
      })
      if (!res.ok) throw new Error()
      const { scores } = await res.json()
      if (Array.isArray(scores)) {
        setTenders(prev => prev.map(t => {
          const found = scores.find((s: { idweb: string; score: number; raison: string }) => s.idweb === t.idweb)
          if (!found) return t
          return { ...t, score: found.score, reason: found.raison }
        }))
        toast.success(`${scores.length} annonces scorées par l'IA`)
      }
    } catch {
      toast.error('Erreur lors du scoring IA')
    } finally {
      setScoring(false)
    }
  }

  // Recherche avec debounce
  function handleSearchChange(value: string) {
    setSearchInput(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setSearch(value)
    }, 400)
  }

  function handleRepondreCetAO(tender: TenderItem) {
    const params = new URLSearchParams()
    if (tender.objet) params.set('titre', tender.objet)
    if (tender.nomacheteur) params.set('acheteur', tender.nomacheteur)
    if (tender.idweb) params.set('boamp_idweb', tender.idweb)
    if (tender.datelimitereponse) params.set('deadline', tender.datelimitereponse.split('T')[0])
    if (tender.url_avis) params.set('boamp_url', tender.url_avis)
    router.push(`/appels-offres/nouveau?${params.toString()}`)
  }

  useEffect(() => {
    fetchTenders(0, search)
  }, [search, activeOnly, minScore])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Veille BOAMP</h1>
          <p className="text-text-secondary mt-1 text-sm">
            Annonces publiées sur le Bulletin Officiel des Annonces des Marchés Publics
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleManualScore}
            disabled={scoring || tenders.length === 0}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {scoring
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Scoring en cours…</>
              : <><Zap className="w-4 h-4" /> Scorer avec l'IA</>
            }
          </button>
        </div>
      </div>

      {/* Alertes configuration */}
      {!hasBoampCodes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-text-primary text-sm">Codes BOAMP non configurés</p>
            <p className="text-text-secondary text-xs mt-0.5">
              Sans codes BOAMP, toutes les annonces sont affichées sans filtre thématique.
            </p>
          </div>
          <Link href="/profil" className="flex items-center gap-1 text-primary text-xs font-medium hover:underline shrink-0">
            <Settings className="w-3 h-3" /> Configurer
          </Link>
        </div>
      )}

      {!hasActiviteMetier && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-text-primary text-sm">Profil métier non renseigné</p>
            <p className="text-text-secondary text-xs mt-0.5">
              Renseignez votre activité métier pour activer le scoring IA des annonces.
            </p>
          </div>
          <Link href="/profil" className="flex items-center gap-1 text-primary text-xs font-medium hover:underline shrink-0">
            <Settings className="w-3 h-3" /> Compléter
          </Link>
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-border p-4 mb-4">
        <div className="flex gap-3 items-center flex-wrap">
          {/* Recherche */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Rechercher un objet, un acheteur…"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearch('') }} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Score minimum */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-secondary" />
            <select
              value={minScore ?? ''}
              onChange={e => setMinScore(e.target.value ? parseInt(e.target.value) : null)}
              className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Tous les scores</option>
              <option value="60">Score ≥ 60%</option>
              <option value="70">Score ≥ 70%</option>
              <option value="80">Score ≥ 80%</option>
            </select>
          </div>

          {/* Actif uniquement */}
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={e => setActiveOnly(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            Actifs seulement
          </label>

          {/* Compteur */}
          <span className="text-xs text-text-secondary ml-auto">
            {total} annonce{total > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Liste des tenders */}
      <div className="bg-white rounded-xl border border-border divide-y divide-border">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : tenders.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-border mx-auto mb-3" />
            <p className="text-text-secondary font-medium">Aucune annonce trouvée</p>
            {!hasBoampCodes && (
              <p className="text-text-secondary text-sm mt-1">
                <Link href="/profil" className="text-primary hover:underline">Configurez vos codes BOAMP</Link> pour voir les annonces pertinentes
              </p>
            )}
          </div>
        ) : (
          tenders.map(tender => {
            const deadline = formatDeadline(tender.datelimitereponse)
            const euros = formatEuros(tender.valeur_estimee)
            return (
              <div key={tender.idweb} className="p-4 hover:bg-surface transition-colors group">
                <div className="flex items-start gap-4">
                  {/* Contenu principal */}
                  <div className="flex-1 min-w-0">
                    {/* Titre + badges */}
                    <div className="flex items-start gap-2 flex-wrap mb-1">
                      <h3 className="font-medium text-text-primary text-sm leading-snug flex-1">
                        {tender.objet ?? '(sans titre)'}
                      </h3>
                      <ScoreBadge score={tender.score} />
                    </div>

                    {/* Raison du score */}
                    {tender.reason && (
                      <p className="text-xs text-text-secondary italic mb-2 leading-relaxed">
                        {tender.reason}
                      </p>
                    )}

                    {/* Méta */}
                    <div className="flex items-center gap-4 flex-wrap text-xs text-text-secondary">
                      {tender.nomacheteur && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {tender.nomacheteur}
                        </span>
                      )}
                      {euros && (
                        <span className="flex items-center gap-1">
                          <Euro className="w-3 h-3" />
                          {euros}
                        </span>
                      )}
                      {tender.duree_mois && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {tender.duree_mois} mois
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Paru le {formatDate(tender.dateparution)}
                      </span>
                    </div>

                    {/* Descripteurs */}
                    {Array.isArray(tender.descripteur_libelles) && tender.descripteur_libelles.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-2">
                        {tender.descripteur_libelles.slice(0, 4).map((lib, i) => (
                          <span key={i} className="text-xs bg-primary-light text-primary px-2 py-0.5 rounded-full">
                            {lib}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {/* Date limite */}
                    <span className={cn(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      deadline.urgent ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-text-secondary'
                    )}>
                      {deadline.label}
                    </span>

                    {/* Boutons */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {tender.url_profil_acheteur && (
                        <a
                          href={tender.url_profil_acheteur}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-white bg-primary hover:bg-primary-hover rounded px-2 py-1 transition-colors font-medium"
                          title="Accéder au dossier de consultation (DCE)"
                        >
                          <FileText className="w-3 h-3" />
                          DCE
                        </a>
                      )}
                      {tender.url_avis && (
                        <a
                          href={tender.url_avis}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary border border-border rounded px-2 py-1 transition-colors"
                          title="Voir sur BOAMP"
                        >
                          <ExternalLink className="w-3 h-3" />
                          BOAMP
                        </a>
                      )}
                      <button
                        onClick={() => handleRepondreCetAO(tender)}
                        className="flex items-center gap-1 text-xs bg-primary hover:bg-primary-hover text-white rounded px-2 py-1 transition-colors font-medium"
                      >
                        Répondre
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page === 0}
            onClick={() => fetchTenders(page - 1)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-surface transition-colors"
          >
            Précédent
          </button>
          <span className="text-sm text-text-secondary">
            Page {page + 1} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => fetchTenders(page + 1)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-surface transition-colors"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  )
}
