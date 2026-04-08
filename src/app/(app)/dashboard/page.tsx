'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, Star, Zap, RefreshCw, Building2, Calendar,
  ArrowRight, ChevronDown, ChevronUp, Clock, MapPin,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

interface TopTender {
  idweb: string
  objet: string | null
  nomacheteur: string | null
  dateparution: string | null
  datelimitereponse: string | null
  valeur_estimee: number | null
  budget_estime: number | null
  url_profil_acheteur: string | null
  description_detail: string | null
  score: number | null
  reason: string | null
  procedure_libelle: string | null
  type_procedure: string | null
  nb_lots: number | null
  code_departement: string[]
  descripteur_libelles?: string[]
  duree_mois?: number | null
  nature_libelle?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDeadline(iso: string | null): { label: string; urgent: boolean; expired: boolean; daysLeft: number | null } {
  if (!iso) return { label: 'Pas de date limite', urgent: false, expired: false, daysLeft: null }
  try {
    const d = new Date(iso)
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
    const formatted = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    if (days < 0) return { label: `${formatted}`, urgent: true, expired: true, daysLeft: days }
    if (days === 0) return { label: `${formatted} à ${time} (0j restants)`, urgent: true, expired: false, daysLeft: 0 }
    return { label: `${formatted} à ${time} (${days}j restants)`, urgent: days <= 7, expired: false, daysLeft: days }
  } catch { return { label: '—', urgent: false, expired: false, daysLeft: null } }
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

// ── Tender Card ──────────────────────────────────────────────────────────────

function TenderCard({
  tender,
  isFav,
  onToggleFav,
  favLoading,
}: {
  tender: TopTender
  isFav: boolean
  onToggleFav: () => void
  favLoading: boolean
}) {
  const [showReason, setShowReason] = useState(false)
  const deadline = formatDeadline(tender.datelimitereponse)
  const euros = formatEuros(tender.valeur_estimee ?? tender.budget_estime)
  const depts = Array.isArray(tender.code_departement) ? tender.code_departement : []
  const descripteurs = Array.isArray(tender.descripteur_libelles) ? tender.descripteur_libelles : []
  const nature = tender.nature_libelle ?? 'SERVICES'
  const duree = tender.duree_mois ? `${tender.duree_mois} mois` : null

  // Build AI summary line
  const summaryParts: string[] = []
  if (tender.score !== null) summaryParts.push(`Forte similarité sémantique (${tender.score}%)`)
  if (euros) summaryParts.push(`budget estimé ${euros}`)
  if (duree) summaryParts.push(`durée ${duree}`)
  const summaryLine = summaryParts.join(' — ')

  return (
    <div className="bg-white rounded-xl border border-[#E0E0F0] shadow-sm hover:shadow-md transition-all flex flex-col">
      {/* Header: Title + Star */}
      <div className="p-5 pb-3 flex-1">
        <div className="flex items-start gap-2 mb-3">
          <Link href={`/veille/${encodeURIComponent(tender.idweb)}`} className="font-bold text-[#0000FF] text-sm leading-snug flex-1 line-clamp-3 uppercase hover:underline">
            {tender.objet ?? '(sans titre)'}
          </Link>
          <button
            onClick={e => { e.stopPropagation(); onToggleFav() }}
            disabled={favLoading}
            className="p-1 shrink-0 mt-0.5"
            title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Star className={cn('w-5 h-5', isFav ? 'fill-amber-400 text-amber-500' : 'text-gray-300 hover:text-amber-400')} />
          </button>
        </div>

        {/* Expired badge */}
        {deadline.expired && (
          <span className="inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 mb-3">
            Expiré
          </span>
        )}

        {/* Meta: org, date, dept, nature */}
        <div className="space-y-1.5 mb-3 text-xs text-gray-500">
          {tender.nomacheteur && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-gray-700">{tender.nomacheteur}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            {tender.dateparution && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(tender.dateparution).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            )}
            {depts.length > 0 && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {depts.slice(0, 2).join(', ')}
              </span>
            )}
            <span className="text-gray-400">{nature}</span>
          </div>
        </div>

        {/* Score badge + progress bar */}
        {tender.score !== null && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className={cn(
                'text-xs font-bold px-2.5 py-0.5 rounded-full border',
                getScoreBadgeStyle(tender.score),
              )}>
                {getScoreLabel(tender.score)}
              </span>
              <span className="text-xs font-bold text-gray-600">{tender.score}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', getScoreColor(tender.score))}
                style={{ width: `${tender.score}%` }}
              />
            </div>
          </div>
        )}

        {/* AI Summary box */}
        {summaryLine && (
          <div className="bg-[#E6E6FF] rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-[#0000FF] flex items-start gap-1.5">
              <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {summaryLine}
            </p>
          </div>
        )}

        {/* Expandable AI reason */}
        {tender.reason && (
          <button
            onClick={() => setShowReason(!showReason)}
            className="flex items-center gap-1 text-xs text-[#0000FF] font-medium mb-3 hover:underline"
          >
            <Zap className="w-3 h-3" />
            Résumé IA
            {showReason ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
        {showReason && tender.reason && (
          <p className="text-xs text-gray-600 italic mb-3 leading-relaxed">{tender.reason}</p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tender.procedure_libelle && (
            <span className="text-xs bg-[#E6E6FF] text-[#0000FF] px-2 py-0.5 rounded-full">
              {tender.procedure_libelle}
            </span>
          )}
          {descripteurs.slice(0, 3).map((d, i) => (
            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* Footer: deadline + actions */}
      <div className="px-5 py-3 border-t border-[#E0E0F0] flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span className={cn(
            'font-medium',
            deadline.expired ? 'text-orange-500' : deadline.urgent ? 'text-red-600' : 'text-gray-500',
          )}>
            {deadline.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!deadline.expired && (
            <Link
              href={`/veille?search=${encodeURIComponent(tender.objet ?? '')}`}
              className="text-xs font-semibold text-[#0000FF] hover:underline flex items-center gap-1"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              Candidater
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [raisonSociale, setRaisonSociale] = useState<string | null>(null)
  const [topTenders, setTopTenders] = useState<TopTender[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [favLoading, setFavLoading] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data: profile } = await supabase.from('profiles').select('raison_sociale').maybeSingle()
      setRaisonSociale(profile?.raison_sociale ?? null)

      const [tendersRes, favsRes] = await Promise.all([
        fetch('/api/veille/tenders?limit=50&active_only=true').then(r => r.ok ? r.json() : null),
        fetch('/api/veille/favorites').then(r => r.ok ? r.json() : null),
      ])

      if (favsRes?.favorites) setFavorites(new Set(favsRes.favorites))

      if (tendersRes?.tenders) {
        const allTenders = tendersRes.tenders as TopTender[]
        setTotalCount(tendersRes.total ?? allTenders.length)

        // Auto-score unscored (max 10)
        const unscored = allTenders.filter(t => t.score === null).slice(0, 10)
        if (unscored.length > 0) {
          try {
            const res = await fetch('/api/veille/score', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idwebs: unscored.map(t => t.idweb) }),
            })
            if (res.ok) {
              const { scores } = await res.json()
              if (Array.isArray(scores)) {
                for (const s of scores) {
                  const t = allTenders.find(x => x.idweb === s.idweb)
                  if (t) { t.score = s.score; t.reason = s.raison ?? t.reason }
                }
              }
            }
          } catch {}
        }

        // Sort by score desc, show all (scored and unscored)
        const sorted = [...allTenders].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        setTopTenders(sorted)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function toggleFav(idweb: string) {
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
      }
    } catch {
      toast.error('Erreur favoris')
    } finally {
      setFavLoading(prev => { const next = new Set(prev); next.delete(idweb); return next })
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/veille/tenders?limit=50&active_only=true')
      if (res.ok) {
        const data = await res.json()
        setTopTenders(data.tenders ?? [])
        setTotalCount(data.total ?? 0)
        setLastSync(new Date().toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))
        toast.success('Synchronisation terminée')
      }
    } catch {
      toast.error('Erreur de synchronisation')
    } finally {
      setSyncing(false)
    }
  }

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <RefreshCw className="w-7 h-7 animate-spin text-[#0000FF]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bonjour{raisonSociale ? `, ${raisonSociale}` : ''} 👋
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Votre veille du jour — {today}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {lastSync && (
            <span className="text-xs text-gray-400">Sync : {lastSync}</span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 border border-[#E0E0F0] rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
            Synchroniser
          </button>
        </div>
      </div>

      {/* Section: Annonces pour vous */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#0000FF]" />
          Annonces pour vous
          <span className="text-xs font-bold bg-[#0000FF] text-white px-2.5 py-0.5 rounded-full">
            {totalCount} résultats
          </span>
        </h2>
        <Link
          href="/veille"
          className="text-sm text-[#0000FF] font-medium hover:underline flex items-center gap-1"
        >
          Voir tout <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Card Grid */}
      {topTenders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#E0E0F0]">
          <Zap className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucune annonce pour le moment</p>
          <p className="text-gray-400 text-sm mt-1">
            <Link href="/profil" className="text-[#0000FF] hover:underline">Configurez votre profil</Link> pour recevoir des suggestions
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {topTenders.map(tender => (
            <TenderCard
              key={tender.idweb}
              tender={tender}
              isFav={favorites.has(tender.idweb)}
              onToggleFav={() => toggleFav(tender.idweb)}
              favLoading={favLoading.has(tender.idweb)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
