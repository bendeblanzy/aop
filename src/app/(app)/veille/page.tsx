'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search, Zap, AlertCircle, Settings, FileText, Building2, Calendar,
  Clock, RefreshCw, X, Star, MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

interface TenderItem {
  id: string
  idweb: string
  objet: string | null
  nomacheteur: string | null
  dateparution: string | null
  datelimitereponse: string | null
  descripteur_libelles: string[]
  valeur_estimee: number | null
  budget_estime: number | null
  duree_mois: number | null
  url_profil_acheteur: string | null
  description_detail: string | null
  score: number | null
  reason: string | null
  nature_libelle: string | null
  type_procedure: string | null
  procedure_libelle: string | null
  code_departement: string[]
  cpv_codes: string[]
  code_nuts: string | null
  nb_lots: number | null
  lots_titres: string[]
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
type SearchMode = 'keyword' | 'semantic'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDeadline(iso: string | null): { label: string; urgent: boolean; expired: boolean } {
  if (!iso) return { label: 'Pas de date limite', urgent: false, expired: false }
  try {
    const d = new Date(iso)
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
    const formatted = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    if (days < 0) return { label: formatted, urgent: true, expired: true }
    if (days === 0) return { label: `${formatted} à ${time} (0j restants)`, urgent: true, expired: false }
    return { label: `${formatted} à ${time} (${days}j restants)`, urgent: days <= 7, expired: false }
  } catch { return { label: '—', urgent: false, expired: false } }
}

function formatEuros(v: number | null) {
  if (!v) return null
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`
  if (v >= 1_000) return `${Math.round(v / 1_000)}k€`
  return `${v}€`
}

function getScoreLabel(score: number) {
  if (score >= 80) return 'Excellent match'
  if (score >= 60) return 'Bon match'
  if (score >= 40) return 'Match partiel'
  return 'Faible'
}

function getScoreColor(score: number) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-[#0000FF]'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-gray-400'
}

function getScoreBadgeStyle(score: number) {
  if (score >= 80) return 'bg-green-100 text-green-700 border-green-200'
  if (score >= 60) return 'bg-[#E6E6FF] text-[#0000FF] border-[#ccccff]'
  if (score >= 40) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

// Retourne "Restreint", "Ouvert" ou null depuis les champs procédure
function getProcedureAccess(procedureLibelle: string | null, typeProcedure: string | null): 'restreint' | 'ouvert' | null {
  const src = ((procedureLibelle ?? '') + ' ' + (typeProcedure ?? '')).toLowerCase()
  if (src.includes('restreint') || src.includes('restricted') || src.includes('négocié') || src.includes('negocie')) return 'restreint'
  if (src.includes('ouvert') || src.includes('open') || src.includes('mapa') || src.includes('adapté') || src.includes('adapte')) return 'ouvert'
  return null
}

function sortTenders(tenders: TenderItem[], sortBy: SortKey): TenderItem[] {
  return [...tenders].sort((a, b) => {
    if (sortBy === 'score') {
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
    return new Date(b.dateparution ?? 0).getTime() - new Date(a.dateparution ?? 0).getTime()
  })
}

// ── Card Component ───────────────────────────────────────────────────────────

function TenderCard({
  tender,
  isFav,
  onToggleFav,
  favLoading,
}: {
  tender: TenderItem
  isFav: boolean
  onToggleFav: () => void
  favLoading: boolean
}) {
  const deadline = formatDeadline(tender.datelimitereponse)
  const euros = formatEuros(tender.valeur_estimee ?? tender.budget_estime)
  const depts = Array.isArray(tender.code_departement) ? tender.code_departement : []
  const descripteurs = Array.isArray(tender.descripteur_libelles) ? tender.descripteur_libelles : []
  const nature = tender.nature_libelle ?? null
  const duree = tender.duree_mois ? `${tender.duree_mois} mois` : null
  const procedureAccess = getProcedureAccess(tender.procedure_libelle, tender.type_procedure)

  const summaryParts: string[] = []
  if (tender.score !== null) summaryParts.push(`Similarité ${tender.score}%`)
  const summaryLine = summaryParts.join(' — ')

  return (
    <Link
      href={`/veille/${encodeURIComponent(tender.idweb)}`}
      className="block bg-white rounded-xl border border-[#E0E0F0] shadow-sm hover:shadow-lg hover:border-[#0000FF]/30 hover:bg-[#F5F5FF] transition-all flex flex-col group"
    >
      <div className="p-5 pb-3 flex-1 min-w-0">
        {/* Header : badges critiques + étoile */}
        <div className="flex items-start gap-2 mb-2.5 min-w-0">
          <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
            {/* Badge Ouvert / Restreint — PRIORITÉ MAX */}
            {procedureAccess === 'restreint' && (
              <span className="inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                🔒 Restreint
              </span>
            )}
            {procedureAccess === 'ouvert' && (
              <span className="inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300 shrink-0">
                ✓ Ouvert
              </span>
            )}
            {/* Badge Nature */}
            {nature && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#E6E6FF] text-[#0000FF] border border-[#ccccff] shrink-0 truncate max-w-[160px]">
                {nature}
              </span>
            )}
            {deadline.expired && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 shrink-0">
                Expiré
              </span>
            )}
          </div>
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFav() }}
            disabled={favLoading}
            className="p-1 shrink-0"
          >
            <Star className={cn('w-5 h-5', isFav ? 'fill-amber-400 text-amber-500' : 'text-gray-300 hover:text-amber-400')} />
          </button>
        </div>

        {/* Title */}
        <p className="font-bold text-[#0000FF] text-sm leading-snug line-clamp-3 uppercase mb-3 min-w-0">
          {tender.objet ?? '(sans titre)'}
        </p>

        {/* Meta acheteur + localisation */}
        <div className="space-y-1.5 mb-3 text-xs text-gray-500 min-w-0">
          {tender.nomacheteur && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-gray-700 truncate">{tender.nomacheteur}</span>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {tender.dateparution && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 shrink-0" />
                {new Date(tender.dateparution).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
            {depts.length > 0 && (
              <span className="flex items-center gap-1 font-medium text-gray-600">
                <MapPin className="w-3 h-3 shrink-0" />
                {depts.slice(0, 3).join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Données financières & durée — TOUJOURS AFFICHÉES */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-400 uppercase font-bold mb-0.5">Budget</p>
            <p className={cn('text-sm font-bold', euros ? 'text-gray-800' : 'text-gray-400 italic text-xs font-normal mt-0.5')}>
              {euros ?? 'Non communiqué'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-400 uppercase font-bold mb-0.5">Durée</p>
            <p className={cn('text-sm font-bold', duree ? 'text-gray-800' : 'text-gray-400 italic text-xs font-normal mt-0.5')}>
              {duree ?? 'Non précisée'}
            </p>
          </div>
        </div>

        {/* Score */}
        {tender.score !== null && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className={cn('text-xs font-bold px-2.5 py-0.5 rounded-full border', getScoreBadgeStyle(tender.score))}>
                {getScoreLabel(tender.score)}
              </span>
              <span className="text-xs font-bold text-gray-600">{tender.score}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', getScoreColor(tender.score))} style={{ width: `${tender.score}%` }} />
            </div>
          </div>
        )}

        {/* AI Summary (score seul) */}
        {summaryLine && (
          <div className="bg-[#E6E6FF] rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-[#0000FF] flex items-start gap-1.5">
              <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="break-words min-w-0">{summaryLine}</span>
            </p>
          </div>
        )}

        {/* Reason excerpt */}
        {tender.reason && (
          <p className="text-xs text-gray-500 italic mb-3 leading-relaxed line-clamp-2">{tender.reason}</p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {descripteurs.slice(0, 3).map((d, i) => (
            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full truncate max-w-[150px]">{d}</span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#E0E0F0] flex items-center justify-between min-w-0">
        <div className="flex items-center gap-1 text-xs min-w-0">
          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className={cn(
            'font-medium truncate',
            deadline.expired ? 'text-orange-500' : deadline.urgent ? 'text-red-600' : 'text-gray-500',
          )}>
            {deadline.label}
          </span>
        </div>
        <span className="text-xs font-semibold text-[#0000FF] group-hover:underline shrink-0 ml-2">
          Voir le détail →
        </span>
      </div>
    </Link>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function VeillePage() {
  const searchParams = useSearchParams()

  const [tenders, setTenders] = useState<TenderItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasBoampCodes, setHasBoampCodes] = useState(true)
  const [hasActiviteMetier, setHasActiviteMetier] = useState(true)
  const LIMIT = 30

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword')
  const [activeOnly, setActiveOnly] = useState(true)
  const [minScore, setMinScore] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('score')
  const [tab, setTab] = useState<TabKey>(() =>
    searchParams.get('tab') === 'favorites' ? 'favorites' : 'all'
  )
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Synchronise le tab lorsque l'URL change (ex. clic sidebar "Mes favoris" depuis n'importe quelle page)
  useEffect(() => {
    setTab(searchParams.get('tab') === 'favorites' ? 'favorites' : 'all')
  }, [searchParams])

  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [favLoading, setFavLoading] = useState<Set<string>>(new Set())
  const [favTenders, setFavTenders] = useState<TenderItem[]>([])
  const [favTendersLoading, setFavTendersLoading] = useState(false)

  // Charger la liste des idwebs favoris
  useEffect(() => {
    fetch('/api/veille/favorites')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.favorites)) setFavorites(new Set(d.favorites)) })
      .catch(() => {})
  }, [])

  // Charger les tenders favoris quand tab=favorites
  useEffect(() => {
    if (tab !== 'favorites') return
    setFavTendersLoading(true)
    fetch('/api/veille/tenders?favorites_only=true&limit=50&active_only=false')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tenders) setFavTenders(data.tenders)
      })
      .catch(() => {})
      .finally(() => setFavTendersLoading(false))
  }, [tab, favorites.size]) // reload when favorites change

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

  const fetchTenders = useCallback(async (p = 0, s = search) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT),
        active_only: String(activeOnly),
        // Mode mots-clés : filtre ILIKE sur objet/acheteur/description
        ...(searchMode === 'keyword' && s.trim() ? { search: s } : {}),
        // Mode Recherche IA : embedding sémantique de la requête
        ...(searchMode === 'semantic' && s.trim() ? { semantic_query: s } : {}),
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

      const unscored = data.tenders.filter(t => t.score === null).map(t => t.idweb).slice(0, 20)
      if (unscored.length > 0 && data.hasActiviteMetier) autoScore(unscored)
    } catch {
      toast.error('Impossible de charger les annonces')
    } finally {
      setLoading(false)
    }
  }, [search, activeOnly, minScore, searchMode]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function handleSearchChange(value: string) {
    setSearchInput(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    // Mode sémantique : debounce plus long pour éviter des appels OpenAI excessifs
    const delay = searchMode === 'semantic' ? 700 : 400
    searchTimeoutRef.current = setTimeout(() => setSearch(value), delay)
  }

  useEffect(() => { fetchTenders(0, search) }, [search, activeOnly, minScore, searchMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const sortedTenders = sortTenders(tenders, sortBy)
  const displayedTenders = tab === 'favorites'
    ? sortTenders(favTenders, sortBy)
    : sortedTenders

  const totalPages = Math.ceil(total / LIMIT)
  const favCount = favorites.size
  const isLoadingDisplay = tab === 'favorites' ? favTendersLoading : loading

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recherche d&apos;appels d&apos;offres</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Annonces pertinentes scorées automatiquement selon votre profil
          </p>
        </div>
      </div>

      {/* Alerts */}
      {!hasBoampCodes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">Codes BOAMP non configurés</p>
            <p className="text-gray-500 text-xs mt-0.5">Sans codes BOAMP, toutes les annonces sont affichées sans filtre.</p>
          </div>
          <Link href="/profil" className="flex items-center gap-1 text-[#0000FF] text-xs font-medium hover:underline shrink-0">
            <Settings className="w-3 h-3" /> Configurer
          </Link>
        </div>
      )}
      {!hasActiviteMetier && (
        <div className="bg-[#E6E6FF] border border-[#ccccff] rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#0000FF] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">Profil métier non renseigné</p>
            <p className="text-gray-500 text-xs mt-0.5">Renseignez votre activité pour activer le scoring IA.</p>
          </div>
          <Link href="/profil" className="flex items-center gap-1 text-[#0000FF] text-xs font-medium hover:underline shrink-0">
            <Settings className="w-3 h-3" /> Compléter
          </Link>
        </div>
      )}

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-[#E0E0F0] p-4 mb-4 space-y-3">
        <div className="flex gap-3 flex-wrap">
          {/* Search mode tabs */}
          <div className="flex rounded-lg border border-[#E0E0F0] overflow-hidden text-sm shrink-0">
            <button
              onClick={() => { setSearchMode('keyword'); setSearchInput(''); setSearch('') }}
              className={cn('px-4 py-2 font-medium transition-colors', searchMode === 'keyword' ? 'bg-[#0000FF] text-white' : 'text-gray-500 hover:bg-gray-50')}
            >
              Mots-clés
            </button>
            <button
              onClick={() => { setSearchMode('semantic'); setSearchInput(''); setSearch('') }}
              className={cn('px-4 py-2 font-medium transition-colors flex items-center gap-1.5', searchMode === 'semantic' ? 'bg-[#0000FF] text-white' : 'text-gray-500 hover:bg-gray-50')}
            >
              <Zap className={cn('w-3.5 h-3.5', searchMode === 'semantic' ? 'text-amber-300' : 'text-gray-400')} />
              Recherche IA
            </button>
          </div>
          {searchMode === 'semantic' && (
            <span className="text-xs bg-[#E6E6FF] text-[#0000FF] px-2.5 py-1 rounded-full font-medium self-center">
              Décrivez librement la prestation recherchée
            </span>
          )}
        </div>

        <div className="relative">
          {searchMode === 'semantic'
            ? <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0000FF]" />
            : <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          }
          <input
            type="text"
            placeholder={searchMode === 'semantic'
              ? 'Ex : refonte site web, campagne pub événementielle, motion design...'
              : 'Rechercher dans le titre, acheteur...'}
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            className={cn(
              'w-full pl-10 pr-8 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors',
              searchMode === 'semantic'
                ? 'border-[#0000FF]/30 focus:ring-[#0000FF]/20 focus:border-[#0000FF] bg-[#F5F5FF]'
                : 'border-[#E0E0F0] focus:ring-[#0000FF]/20 focus:border-[#0000FF]',
            )}
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setSearch('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">Score min :</div>
          <div className="flex rounded-lg border border-[#E0E0F0] overflow-hidden text-xs">
            {([
              [null, 'Tous'],
              [20, '20+'],
              [40, '40+'],
              [60, '60+'],
            ] as [number | null, string][]).map(([val, label]) => (
              <button
                key={label}
                onClick={() => setMinScore(val)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  minScore === val ? 'bg-[#0000FF] text-white font-medium' : 'hover:bg-gray-50 text-gray-500',
                )}
              >{label}</button>
            ))}
          </div>

          <span className="text-gray-300">|</span>

          <div className="flex items-center gap-1.5 text-xs text-gray-500">Trier par :</div>
          <div className="flex rounded-lg border border-[#E0E0F0] overflow-hidden text-xs">
            {([['score', 'Pertinence'], ['date', 'Date'], ['deadline', 'Deadline']] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  sortBy === key ? 'bg-[#0000FF] text-white font-medium' : 'hover:bg-gray-50 text-gray-500',
                )}
              >{label}</button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none ml-auto">
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="rounded border-gray-300 text-[#0000FF] focus:ring-[#0000FF]" />
            Actifs seulement
          </label>
        </div>
      </div>

      {/* Suggestion bar */}
      <div className="bg-[#E6E6FF] rounded-xl p-3 mb-4 flex items-center gap-2">
        <Zap className="w-4 h-4 text-[#0000FF] shrink-0" />
        <span className="text-sm text-[#0000FF] font-medium">
          {searchMode === 'semantic' && search.trim()
            ? `Recherche IA : résultats sémantiques pour « ${search} » — ${total} annonces trouvées`
            : `Annonces de services communication & numérique — ${total} correspondances profil${search.trim() ? ` · filtre « ${search} »` : ''}`
          }
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {([['all', 'Toutes les annonces', null], ['favorites', 'Mes favoris', favCount]] as [TabKey, string, number | null][]).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === key ? 'bg-[#0000FF] text-white' : 'bg-white border border-[#E0E0F0] text-gray-500 hover:border-[#0000FF]/50',
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

      {/* Card Grid */}
      {isLoadingDisplay ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-[#0000FF]" />
        </div>
      ) : displayedTenders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#E0E0F0]">
          {tab === 'favorites' ? (
            <>
              <Star className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Aucun favori pour le moment</p>
              <p className="text-gray-400 text-sm mt-1">Cliquez sur l&apos;étoile d&apos;une annonce pour la sauvegarder ici.</p>
            </>
          ) : (
            <>
              <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Aucune annonce trouvée</p>
              {!hasBoampCodes && (
                <p className="text-sm mt-1">
                  <Link href="/profil" className="text-[#0000FF] hover:underline">Configurez vos codes BOAMP</Link> pour voir les annonces pertinentes
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedTenders.map(tender => (
            <TenderCard
              key={tender.idweb}
              tender={tender}
              isFav={favorites.has(tender.idweb)}
              onToggleFav={() => toggleFavorite(tender.idweb)}
              favLoading={favLoading.has(tender.idweb)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && tab === 'all' && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button disabled={page === 0} onClick={() => fetchTenders(page - 1)} className="px-4 py-2 text-sm border border-[#E0E0F0] rounded-lg disabled:opacity-40 hover:bg-gray-50 font-medium">Précédent</button>
          <span className="text-sm text-gray-500">Page {page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => fetchTenders(page + 1)} className="px-4 py-2 text-sm border border-[#E0E0F0] rounded-lg disabled:opacity-40 hover:bg-gray-50 font-medium">Suivant</button>
        </div>
      )}
    </div>
  )
}
