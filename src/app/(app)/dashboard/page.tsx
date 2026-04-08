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

interface AppelOffre {
  id: string
  titre: string
  acheteur: string | null
  statut: string
  date_limite_reponse: string | null
  updated_at: string
  tender_idweb: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDeadline(iso: string | null): { label: string; short: string; urgent: boolean; expired: boolean; daysLeft: number | null } {
  if (!iso) return { label: 'Pas de date limite', short: 'Pas de deadline', urgent: false, expired: false, daysLeft: null }
  try {
    const d = new Date(iso)
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
    const formatted = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    if (days < 0) return { label: formatted, short: 'Expiré', urgent: true, expired: true, daysLeft: days }
    if (days === 0) return { label: `${formatted} à ${time}`, short: '0j restants', urgent: true, expired: false, daysLeft: 0 }
    return { label: `${formatted} à ${time}`, short: `${days}j restants`, urgent: days <= 7, expired: false, daysLeft: days }
  } catch { return { label: '—', short: '—', urgent: false, expired: false, daysLeft: null } }
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

// ── Tender Card (entièrement cliquable) ─────────────────────────────────────

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
  const deadline = formatDeadline(tender.datelimitereponse)
  const euros = formatEuros(tender.valeur_estimee ?? tender.budget_estime)
  const depts = Array.isArray(tender.code_departement) ? tender.code_departement : []
  const descripteurs = Array.isArray(tender.descripteur_libelles) ? tender.descripteur_libelles : []
  const nature = tender.nature_libelle ?? 'SERVICES'
  const duree = tender.duree_mois ? `${tender.duree_mois} mois` : null

  const summaryParts: string[] = []
  if (tender.score !== null) summaryParts.push(`Similarité sémantique (${tender.score}%)`)
  if (euros) summaryParts.push(`budget estimé ${euros}`)
  if (duree) summaryParts.push(`durée ${duree}`)
  const summaryLine = summaryParts.join(' — ')

  return (
    <Link
      href={`/veille/${encodeURIComponent(tender.idweb)}`}
      className="bg-white rounded-xl border border-[#E0E0F0] shadow-sm hover:shadow-lg hover:border-[#0000FF]/30 transition-all flex flex-col group cursor-pointer"
    >
      <div className="p-4 sm:p-5 pb-3 flex-1 min-w-0">
        {/* Title + Star */}
        <div className="flex items-start gap-2 mb-2">
          <h3 className="font-bold text-[#0000FF] text-sm leading-snug flex-1 line-clamp-2 uppercase group-hover:underline min-w-0">
            {tender.objet ?? '(sans titre)'}
          </h3>
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFav() }}
            disabled={favLoading}
            className="p-1 shrink-0"
          >
            <Star className={cn('w-4 h-4', isFav ? 'fill-amber-400 text-amber-500' : 'text-gray-300 hover:text-amber-400')} />
          </button>
        </div>

        {deadline.expired && (
          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 mb-2">Expiré</span>
        )}

        {/* Meta */}
        <div className="space-y-1 mb-2 text-xs text-gray-500 min-w-0">
          {tender.nomacheteur && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="font-medium text-gray-700 truncate">{tender.nomacheteur}</span>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {tender.dateparution && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Calendar className="w-3 h-3 shrink-0" />
                {new Date(tender.dateparution).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
            {depts.length > 0 && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <MapPin className="w-3 h-3 shrink-0" />
                {depts.slice(0, 2).join(', ')}
              </span>
            )}
            <span className="text-gray-400 whitespace-nowrap">{nature}</span>
          </div>
        </div>

        {/* Score */}
        {tender.score !== null && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', getScoreBadgeStyle(tender.score))}>
                {getScoreLabel(tender.score)}
              </span>
              <span className="text-xs font-bold text-gray-500">{tender.score}%</span>
            </div>
            <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', getScoreColor(tender.score))} style={{ width: `${tender.score}%` }} />
            </div>
          </div>
        )}

        {/* AI Summary */}
        {summaryLine && (
          <div className="bg-[#E6E6FF] rounded-lg px-2.5 py-1.5 mb-2">
            <p className="text-[11px] text-[#0000FF] flex items-start gap-1">
              <Zap className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="min-w-0">{summaryLine}</span>
            </p>
          </div>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {descripteurs.slice(0, 2).map((d, i) => (
            <span key={i} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full truncate max-w-[140px]">{d}</span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 sm:px-5 py-2.5 border-t border-[#E0E0F0] flex items-center justify-between min-w-0">
        <span className={cn(
          'text-xs font-medium truncate',
          deadline.expired ? 'text-orange-500' : deadline.urgent ? 'text-red-600' : 'text-gray-500',
        )}>
          {deadline.short}
        </span>
        <span className="text-xs font-semibold text-[#0000FF] flex items-center gap-1 shrink-0">
          Détail <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  )
}

// ── AO En Cours Card ────────────────────────────────────────────────────────

function AoCard({ ao }: { ao: AppelOffre }) {
  const dl = formatDeadline(ao.date_limite_reponse)
  return (
    <Link
      href={`/appels-offres/${ao.id}`}
      className="bg-white rounded-xl border border-[#E0E0F0] shadow-sm hover:shadow-lg hover:border-[#0000FF]/30 transition-all p-4 sm:p-5 flex flex-col group cursor-pointer"
    >
      <h3 className="font-bold text-[#0000FF] text-sm leading-snug line-clamp-2 uppercase group-hover:underline mb-2 min-w-0">
        {ao.titre}
      </h3>
      {ao.acheteur && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 min-w-0">
          <Building2 className="w-3 h-3 shrink-0" />
          <span className="truncate">{ao.acheteur}</span>
        </div>
      )}
      <div className="mt-auto pt-2 flex items-center justify-between">
        <span className={cn(
          'text-xs font-medium',
          dl.expired ? 'text-orange-500' : dl.urgent ? 'text-red-600' : 'text-gray-500',
        )}>
          {dl.short}
        </span>
        <span className="text-xs font-semibold text-[#0000FF] flex items-center gap-1">
          Continuer <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [raisonSociale, setRaisonSociale] = useState<string | null>(null)
  const [topTenders, setTopTenders] = useState<TopTender[]>([])
  const [favTenders, setFavTenders] = useState<TopTender[]>([])
  const [aoEnCours, setAoEnCours] = useState<AppelOffre[]>([])
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

      const [
        { data: profile },
        { data: aoData },
        tendersRes,
        favsRes,
        favTendersRes,
      ] = await Promise.all([
        supabase.from('profiles').select('raison_sociale').maybeSingle(),
        supabase.from('appels_offres').select('*').in('statut', ['en_cours', 'analyse']).order('updated_at', { ascending: false }).limit(6),
        fetch('/api/veille/tenders?limit=50&active_only=true').then(r => r.ok ? r.json() : null),
        fetch('/api/veille/favorites').then(r => r.ok ? r.json() : null),
        fetch('/api/veille/tenders?favorites_only=true&limit=6&active_only=false').then(r => r.ok ? r.json() : null),
      ])

      setRaisonSociale(profile?.raison_sociale ?? null)
      setAoEnCours((aoData as AppelOffre[]) ?? [])
      if (favsRes?.favorites) setFavorites(new Set(favsRes.favorites))
      if (favTendersRes?.tenders) setFavTenders(favTendersRes.tenders as TopTender[])

      if (tendersRes?.tenders) {
        const allTenders = tendersRes.tenders as TopTender[]
        setTotalCount(tendersRes.total ?? allTenders.length)

        // Auto-score en background (silencieux, pas de bouton)
        const unscored = allTenders.filter(t => t.score === null).slice(0, 15)
        if (unscored.length > 0) {
          // Fire and forget — update state when done
          fetch('/api/veille/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idwebs: unscored.map(t => t.idweb) }),
          }).then(r => r.ok ? r.json() : null).then(data => {
            if (data?.scores && Array.isArray(data.scores)) {
              setTopTenders(prev => {
                const updated = [...prev]
                for (const s of data.scores) {
                  const t = updated.find(x => x.idweb === s.idweb)
                  if (t) { t.score = s.score; t.reason = s.raison ?? t.reason }
                }
                return updated.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
              })
            }
          }).catch(() => {})
        }

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
    <div className="space-y-8 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
            Bonjour{raisonSociale ? `, ${raisonSociale}` : ''} 👋
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Votre veille du jour — {today}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastSync && <span className="text-xs text-gray-400 hidden sm:block">Sync : {lastSync}</span>}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 border border-[#E0E0F0] rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
            <span className="hidden sm:inline">Synchroniser</span>
          </button>
        </div>
      </div>

      {/* ── Section 1 : Réponses en cours (cartes) ── */}
      {aoEnCours.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#0000FF] shrink-0" />
              <span>Réponses en cours</span>
              <span className="text-xs font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">{aoEnCours.length}</span>
            </h2>
            <Link href="/appels-offres" className="text-sm text-[#0000FF] font-medium hover:underline flex items-center gap-1 shrink-0">
              Voir tout <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {aoEnCours.map(ao => <AoCard key={ao.id} ao={ao} />)}
          </div>
        </div>
      )}

      {/* ── Section 2 : Mes favoris ── */}
      {favTenders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500 shrink-0" />
              <span>Mes favoris</span>
              <span className="text-xs font-bold bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">{favorites.size}</span>
            </h2>
            <Link href="/veille?tab=favorites" className="text-sm text-[#0000FF] font-medium hover:underline flex items-center gap-1 shrink-0">
              Voir tout <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {favTenders.slice(0, 3).map(tender => (
              <TenderCard key={tender.idweb} tender={tender} isFav={true} onToggleFav={() => toggleFav(tender.idweb)} favLoading={favLoading.has(tender.idweb)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Section 3 : Annonces pour vous ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#0000FF] shrink-0" />
            <span>Annonces pour vous</span>
            <span className="text-xs font-bold bg-[#0000FF] text-white px-2 py-0.5 rounded-full">{totalCount}</span>
          </h2>
          <Link href="/veille" className="text-sm text-[#0000FF] font-medium hover:underline flex items-center gap-1 shrink-0">
            Voir tout <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

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
              <TenderCard key={tender.idweb} tender={tender} isFav={favorites.has(tender.idweb)} onToggleFav={() => toggleFav(tender.idweb)} favLoading={favLoading.has(tender.idweb)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
