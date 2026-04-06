'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search, Zap, AlertCircle, Settings, FileText, Building2, Calendar,
  Euro, Clock, ChevronRight, RefreshCw, Filter, X, Star, SortAsc,
  Bookmark, BookmarkCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  url_profil_acheteur: string | null
  description_detail: string | null
  score: number | null
  reason: string | null
}

interface ApiResponse {
  tenders: TenderItem[]
  total: number
  filteredTotal: number
  page: number
  limit: number
  hasBoampCodes: boolean
  hasActiviteMetier: boolean
}

type SortKey = 'score' | 'date' | 'deadline'
type TabKey = 'all' | 'favorites'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return iso }
}

function formatDeadline(iso: string | null): { label: string; urgent: boolean; days: number | null } {
  if (!iso) return { label: '—', urgent: false, days: null }
  try {
    const d = new Date(iso)
    const diff = d.getTime() - Date.now()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (days < 0) return { label: 'Expiré', urgent: true, days }
    if (days <= 7) return { label: `J-${days}`, urgent: true, days }
    if (days <= 30) return { label: `J-${days}`, urgent: false, days }
    return { label: formatDate(iso), urgent: false, days }
  } catch { return { label: iso ?? '—', urgent: false, days: null } }
}

function formatEuros(value: number | null) {
  if (!value) return null
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M€`
  if (value >= 1_000) return `${Math.round(value / 1_000)} k€`
  return `${value} €`
}

function sortTenders(tenders: TenderItem[], sortBy: SortKey): TenderItem[] {
  return [...tenders].sort((a, b) => {
    if (sortBy === 'score') {
      // Scorés en premier, puis par score décroissant, puis par date
      if (a.score !== null && b.score !== null) return b.score - a.score
      if (a.score !== null) return -1
      if (b.score !== null) return 1
      return new Date(b.dateparution ?? 0).getTime() - new Date(a.dateparution ?? 0).getTime()
    }
    if (sortBy === 'deadline') {
      const da = a.datelimitereponse ? new Date(a.datelimitereponse).getTime() : Infinity
      const db = b.datelimitereponse ? new Date(b.datelimitereponse).getTime() : Infinity
      return da - db
    }
    // date (parution)
    return new Date(b.dateparution ?? 0).getTime() - new Date(a.dateparution ?? 0).getTime()
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return (
    <span className="text-xs text-text-secondary bg-surface px-2 py-0.5 rounded-full border border-border">Non scoré</span>
  )
  const color =
    score >= 80 ? 'bg-green-100 text-green-700 border-green-200' :
    score >= 60 ? 'bg-blue-100 text-blue-700 border-blue-200' :
    score >= 40 ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-red-100 text-red-700 border-red-200'
  const label = score >= 80 ? '⭐ Excellent' : score >= 60 ? 'Bon match' : score >= 40 ? 'Partiel' : 'Faible'
  return (
    <span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full border', color)}>
      {score}% — {label}
    </span>
  )
}

function StarButton({ isFav, onToggle, loading }: { isFav: boolean; onToggle: () => void; loading: boolean }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      disabled={loading}
      title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={cn(
        'p-1.5 rounded-full transition-all shrink-0',
        isFav
          ? 'text-amber-500 hover:text-amber-600'
          : 'text-text-secondary hover:text-amber-400',
        loading ? 'opacity-50 cursor-not-allowed' : '',
      )}
    >
      <Star className={cn('w-4 h-4', isFav ? 'fill-amber-400' : '')} />
    </button>
  )
}

function TenderCard({
  tender,
  isFav,
  onToggleFav,
  favLoading,
  onRepondre,
}: {
  tender: TenderItem
  isFav: boolean
  onToggleFav: () => void
  favLoading: boolean
  onRepondre: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const deadline = formatDeadline(tender.datelimitereponse)
  const euros = formatEuros(tender.valeur_estimee)
  const hasDescription = !!tender.description_detail?.trim()
  const descShort = tender.description_detail?.slice(0, 220)
  const needsTruncate = (tender.description_detail?.length ?? 0) > 220

  return (
    <div className={cn(
      'p-4 hover:bg-surface/60 transition-colors',
      isFav ? 'bg-amber-50/30' : '',
    )}>
      {/* Ligne 1 : titre + score + étoile + deadline */}
      <div className="flex items-start gap-2 mb-1.5">
        <h3 className="font-medium text-text-primary text-sm leading-snug flex-1 line-clamp-2">
          {tender.objet ?? '(sans titre)'}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <ScoreBadge score={tender.score} />
          <span className={cn(
            'text-xs font-semibold px-2 py-0.5 rounded-full',
            deadline.urgent ? 'bg-red-100 text-red-700' :
            deadline.days !== null && deadline.days <= 30 ? 'bg-amber-50 text-amber-700' :
            'bg-surface text-text-secondary',
          )}>
            {deadline.label}
          </span>
          <StarButton isFav={isFav} onToggle={onToggleFav} loading={favLoading} />
        </div>
      </div>

      {/* Ligne 2 : raison du score (mise en avant) */}
      {tender.reason && (
        <div className="flex items-start gap-1.5 bg-primary-light/50 border border-primary/10 rounded-lg px-3 py-2 mb-2.5 text-xs text-primary">
          <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="italic">{tender.reason}</span>
        </div>
      )}

      {/* Description détaillée */}
      {hasDescription && (
        <div className="text-xs text-text-secondary mb-2 leading-relaxed">
          {expanded ? tender.description_detail : descShort}
          {needsTruncate && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-1 text-primary font-medium hover:underline"
            >
              {expanded ? '← Moins' : '… Voir plus'}
            </button>
          )}
        </div>
      )}

      {/* Méta + tags */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary mb-2">
        {tender.nomacheteur && (
          <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{tender.nomacheteur}</span>
        )}
        {euros && (
          <span className="flex items-center gap-1 font-medium text-text-primary"><Euro className="w-3 h-3" />{euros}</span>
        )}
        {tender.duree_mois && (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tender.duree_mois} mois</span>
        )}
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Paru le {formatDate(tender.dateparution)}</span>
      </div>

      {Array.isArray(tender.descripteur_libelles) && tender.descripteur_libelles.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-3">
          {tender.descripteur_libelles.slice(0, 5).map((lib, i) => (
            <span key={i} className="text-xs bg-primary-light text-primary px-2 py-0.5 rounded-full">{lib}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onRepondre}
          className="flex items-center gap-1.5 text-xs bg-primary hover:bg-primary-hover text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
        >
          Répondre à cet AO <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function VeillePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Tenders
  const [tenders, setTenders] = useState<TenderItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [hasBoampCodes, setHasBoampCodes] = useState(true)
  const [hasActiviteMetier, setHasActiviteMetier] = useState(true)
  const LIMIT = 30

  // Filtres & tri
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [minScore, setMinScore] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('score')
  const [tab, setTab] = useState<TabKey>(() =>
    searchParams.get('tab') === 'favorites' ? 'favorites' : 'all'
  )
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Favoris
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [favLoading, setFavLoading] = useState<Set<string>>(new Set())

  // ── Chargement des favoris ──
  useEffect(() => {
    fetch('/api/veille/favorites')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.favorites)) setFavorites(new Set(d.favorites))
      })
      .catch(() => {}) // silent
  }, [])

  // ── Toggle favori ──
  async function toggleFavorite(idweb: string) {
    const isFav = favorites.has(idweb)
    setFavLoading(prev => new Set(prev).add(idweb))
    try {
      const res = await fetch('/api/veille/favorites', {
        method: isFav ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idweb }),
      })
      if (res.ok) {
        setFavorites(prev => {
          const next = new Set(prev)
          isFav ? next.delete(idweb) : next.add(idweb)
          return next
        })
        toast.success(isFav ? 'Retiré des favoris' : 'Ajouté aux favoris')
      }
    } catch {
      toast.error('Erreur lors de la mise à jour des favoris')
    } finally {
      setFavLoading(prev => { const next = new Set(prev); next.delete(idweb); return next })
    }
  }

  // ── Chargement des tenders ──
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
      if (!res.ok) throw new Error()
      const data: ApiResponse = await res.json()
      setTenders(data.tenders)
      setTotal(data.total)
      setPage(p)
      setHasBoampCodes(data.hasBoampCodes)
      setHasActiviteMetier(data.hasActiviteMetier)

      // Auto-score les non-scorés
      const unscored = data.tenders.filter(t => t.score === null).map(t => t.idweb).slice(0, 20)
      if (unscored.length > 0 && data.hasActiviteMetier) autoScore(unscored)
    } catch {
      toast.error('Impossible de charger les annonces')
    } finally {
      setLoading(false)
    }
  }, [search, activeOnly, minScore]) // eslint-disable-line react-hooks/exhaustive-deps

  async function autoScore(idwebs: string[]) {
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
        return found ? { ...t, score: found.score, reason: found.raison } : t
      }))
    } catch { /* silent */ }
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
          return found ? { ...t, score: found.score, reason: found.raison } : t
        }))
        toast.success(`${scores.length} annonces scorées`)
      }
    } catch {
      toast.error('Erreur lors du scoring IA')
    } finally {
      setScoring(false)
    }
  }

  function handleSearchChange(value: string) {
    setSearchInput(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => setSearch(value), 400)
  }

  function handleRepondre(tender: TenderItem) {
    const params = new URLSearchParams()
    if (tender.objet) params.set('titre', tender.objet)
    if (tender.nomacheteur) params.set('acheteur', tender.nomacheteur)
    if (tender.idweb) params.set('boamp_idweb', tender.idweb)
    if (tender.datelimitereponse) params.set('deadline', tender.datelimitereponse.split('T')[0])
    if (tender.url_profil_acheteur) params.set('boamp_url', tender.url_profil_acheteur)
    router.push(`/appels-offres/nouveau?${params.toString()}`)
  }

  useEffect(() => { fetchTenders(0, search) }, [search, activeOnly, minScore]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tri + filtre onglet
  const sortedTenders = sortTenders(tenders, sortBy)
  const displayedTenders = tab === 'favorites'
    ? sortedTenders.filter(t => favorites.has(t.idweb))
    : sortedTenders

  const totalPages = Math.ceil(total / LIMIT)
  const favCount = tenders.filter(t => favorites.has(t.idweb)).length

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Veille marchés publics</h1>
          <p className="text-text-secondary mt-1 text-sm">
            Annonces pertinentes scorées par l&apos;IA selon votre profil
          </p>
        </div>
        <button
          onClick={handleManualScore}
          disabled={scoring || tenders.length === 0}
          className="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0"
        >
          {scoring ? <><RefreshCw className="w-4 h-4 animate-spin" />Scoring…</> : <><Zap className="w-4 h-4" />Scorer avec l&apos;IA</>}
        </button>
      </div>

      {/* Alertes config */}
      {!hasBoampCodes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">Codes BOAMP non configurés</p>
            <p className="text-text-secondary text-xs mt-0.5">Sans codes BOAMP, toutes les annonces sont affichées sans filtre.</p>
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
            <p className="font-medium text-sm">Profil métier non renseigné</p>
            <p className="text-text-secondary text-xs mt-0.5">Renseignez votre activité pour activer le scoring IA.</p>
          </div>
          <Link href="/profil" className="flex items-center gap-1 text-primary text-xs font-medium hover:underline shrink-0">
            <Settings className="w-3 h-3" /> Compléter
          </Link>
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-border p-3 mb-4 space-y-3">
        {/* Barre de recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Rechercher un objet, un acheteur…"
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setSearch('') }} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Ligne de contrôles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tri */}
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <SortAsc className="w-3.5 h-3.5" />
            <span>Trier&nbsp;:</span>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {([['score', 'Score IA'], ['deadline', 'Échéance'], ['date', 'Date parution']] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  sortBy === key ? 'bg-primary text-white font-medium' : 'hover:bg-surface text-text-secondary',
                )}
              >{label}</button>
            ))}
          </div>

          {/* Score min */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-text-secondary" />
            <select
              value={minScore ?? ''}
              onChange={e => setMinScore(e.target.value ? parseInt(e.target.value) : null)}
              className="border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Tous scores</option>
              <option value="60">Score ≥ 60%</option>
              <option value="70">Score ≥ 70%</option>
              <option value="80">Score ≥ 80%</option>
            </select>
          </div>

          {/* Actifs seulement */}
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
            Actifs seulement
          </label>

          <span className="text-xs text-text-secondary ml-auto">{total} annonce{total > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Onglets Tous / Favoris */}
      <div className="flex gap-1 mb-3">
        {([['all', 'Toutes les annonces', null], ['favorites', 'Mes favoris', favCount]] as [TabKey, string, number | null][]).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === key ? 'bg-primary text-white' : 'bg-white border border-border text-text-secondary hover:border-primary/50',
            )}
          >
            {key === 'favorites' && <Star className={cn('w-3.5 h-3.5', tab === key ? 'fill-amber-300' : '')} />}
            {label}
            {count !== null && count > 0 && (
              <span className={cn('text-xs rounded-full px-1.5 py-0.5', tab === key ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700')}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl border border-border divide-y divide-border">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : displayedTenders.length === 0 ? (
          <div className="text-center py-16">
            {tab === 'favorites' ? (
              <>
                <BookmarkCheck className="w-12 h-12 text-border mx-auto mb-3" />
                <p className="text-text-secondary font-medium">Aucun favori pour le moment</p>
                <p className="text-text-secondary text-sm mt-1">Cliquez sur l&apos;étoile ★ d&apos;une annonce pour la sauvegarder ici.</p>
              </>
            ) : (
              <>
                <FileText className="w-12 h-12 text-border mx-auto mb-3" />
                <p className="text-text-secondary font-medium">Aucune annonce trouvée</p>
                {!hasBoampCodes && (
                  <p className="text-sm mt-1">
                    <Link href="/profil" className="text-primary hover:underline">Configurez vos codes BOAMP</Link> pour voir les annonces pertinentes
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          displayedTenders.map(tender => (
            <TenderCard
              key={tender.idweb}
              tender={tender}
              isFav={favorites.has(tender.idweb)}
              onToggleFav={() => toggleFavorite(tender.idweb)}
              favLoading={favLoading.has(tender.idweb)}
              onRepondre={() => handleRepondre(tender)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && tab === 'all' && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button disabled={page === 0} onClick={() => fetchTenders(page - 1)} className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-surface">Précédent</button>
          <span className="text-sm text-text-secondary">Page {page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => fetchTenders(page + 1)} className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-surface">Suivant</button>
        </div>
      )}
    </div>
  )
}
