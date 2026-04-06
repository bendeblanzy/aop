'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, TrendingUp, CheckCircle, Clock, Plus, AlertCircle,
  ChevronRight, Star, Zap, RefreshCw, Euro, Building2, Calendar,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { cn, formatDate, getStatutColor, getStatutLabel } from '@/lib/utils'
import { toast } from 'sonner'
import type { AppelOffre } from '@/lib/types'

// ── Types locaux ──────────────────────────────────────────────────────────────

interface TopTender {
  idweb: string
  objet: string | null
  nomacheteur: string | null
  datelimitereponse: string | null
  valeur_estimee: number | null
  url_profil_acheteur: string | null
  description_detail: string | null
  score: number | null
  reason: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDeadlineDays(iso: string | null): { label: string; urgent: boolean } {
  if (!iso) return { label: '—', urgent: false }
  try {
    const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
    if (days < 0) return { label: 'Expiré', urgent: true }
    if (days <= 7) return { label: `J-${days}`, urgent: true }
    return {
      label: new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      urgent: false,
    }
  } catch { return { label: '—', urgent: false } }
}

function formatEuros(v: number | null) {
  if (!v) return null
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M€`
  if (v >= 1_000) return `${Math.round(v / 1_000)} k€`
  return `${v} €`
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-green-100 text-green-700' :
    score >= 60 ? 'bg-blue-100 text-blue-700' :
    'bg-amber-100 text-amber-700'
  return <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', color)}>{score}%</span>
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [raisonSociale, setRaisonSociale] = useState<string | null>(null)
  const [aos, setAos] = useState<AppelOffre[]>([])
  const [topTenders, setTopTenders] = useState<TopTender[]>([])
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [favLoading, setFavLoading] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // ── Chargement initial ──
  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const [
        { data: profile },
        { data: aoData },
      ] = await Promise.all([
        supabase.from('profiles').select('raison_sociale').maybeSingle(),
        supabase.from('appels_offres').select('*').order('updated_at', { ascending: false }).limit(20),
      ])
      setRaisonSociale(profile?.raison_sociale ?? null)
      setAos((aoData as AppelOffre[]) ?? [])

      // Meilleurs matchs + favoris en parallèle
      const [tendersRes, favsRes] = await Promise.all([
        fetch('/api/veille/tenders?limit=20&active_only=true').then(r => r.ok ? r.json() : null),
        fetch('/api/veille/favorites').then(r => r.ok ? r.json() : null),
      ])

      if (favsRes?.favorites) setFavorites(new Set(favsRes.favorites))

      if (tendersRes?.tenders) {
        const allTenders = tendersRes.tenders as TopTender[]

        // Auto-scorer les annonces sans score (max 10)
        const unscored = allTenders.filter(t => t.score === null).slice(0, 10)
        if (unscored.length > 0) {
          await Promise.allSettled(
            unscored.map(t =>
              fetch('/api/veille/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idweb: t.idweb }),
              }).then(r => r.ok ? r.json() : null).then(res => {
                if (res?.score !== undefined) {
                  t.score = res.score
                  t.reason = res.reason ?? t.reason
                }
              }).catch(() => null)
            )
          )
        }

        // Filtrer sur les scorés ≥ 60% et trier
        const scored: TopTender[] = allTenders
          .filter(t => t.score !== null && t.score >= 60)
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, 5)
        setTopTenders(scored)
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Toggle favori ──
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

  function handleRepondre(tender: TopTender) {
    const p = new URLSearchParams()
    if (tender.objet) p.set('titre', tender.objet)
    if (tender.nomacheteur) p.set('acheteur', tender.nomacheteur)
    if (tender.idweb) p.set('boamp_idweb', tender.idweb)
    if (tender.datelimitereponse) p.set('deadline', tender.datelimitereponse.split('T')[0])
    if (tender.url_profil_acheteur) p.set('boamp_url', tender.url_profil_acheteur)
    router.push(`/appels-offres/nouveau?${p.toString()}`)
  }

  // ── Computed ──
  const aoEnCours = aos.filter(a => ['en_cours', 'analyse'].includes(a.statut))
  const stats = {
    total: aos.length,
    enCours: aoEnCours.length,
    generes: aos.filter(a => a.statut === 'genere').length,
    soumis: aos.filter(a => a.statut === 'soumis').length,
  }
  const proches = aos.filter(a => {
    if (!a.date_limite_reponse) return false
    const diff = new Date(a.date_limite_reponse).getTime() - Date.now()
    return diff > 0 && diff < 7 * 86400000
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <RefreshCw className="w-7 h-7 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Titre */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Bonjour{raisonSociale ? `, ${raisonSociale}` : ''} 👋
        </h1>
        <p className="text-text-secondary mt-1 text-sm">Voici un résumé de votre activité</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total AO', value: stats.total, icon: FileText, color: 'text-primary', bg: 'bg-primary-light' },
          { label: 'En cours', value: stats.enCours, icon: Clock, color: 'text-warning', bg: 'bg-amber-50' },
          { label: 'Générés', value: stats.generes, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary-light' },
          { label: 'Soumis', value: stats.soumis, icon: CheckCircle, color: 'text-secondary', bg: 'bg-green-50' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-border p-5">
            <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="text-2xl font-bold text-text-primary">{stat.value}</div>
            <div className="text-sm text-text-secondary mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Alerte dates limites */}
      {proches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm">Dates limites proches ⚠️</p>
            <ul className="mt-1 space-y-0.5">
              {proches.map(a => (
                <li key={a.id} className="text-sm text-text-secondary">
                  <Link href={`/appels-offres/${a.id}`} className="text-primary hover:underline">{a.titre}</Link>
                  {' — '}échéance le {formatDate(a.date_limite_reponse!)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Réponses en cours */}
      {aoEnCours.length > 0 && (
        <div className="bg-white rounded-xl border border-border">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="font-semibold text-text-primary">Réponses en cours</h2>
              <p className="text-xs text-text-secondary mt-0.5">AO non finalisés — à compléter avant la date limite</p>
            </div>
            <Link href="/appels-offres" className="text-xs text-primary hover:underline flex items-center gap-1">
              Voir tout <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {aoEnCours.map(ao => {
              const dl = formatDeadlineDays(ao.date_limite_reponse ?? null)
              return (
                <Link
                  key={ao.id}
                  href={`/appels-offres/${ao.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-surface transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-text-primary truncate">{ao.titre}</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      {ao.acheteur && `${ao.acheteur} — `}
                      Modifié le {formatDate(ao.updated_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {ao.date_limite_reponse && (
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        dl.urgent ? 'bg-red-100 text-red-700' : 'bg-surface text-text-secondary',
                      )}>
                        {dl.label}
                      </span>
                    )}
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatutColor(ao.statut)}`}>
                      {getStatutLabel(ao.statut)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Meilleurs matchs BOAMP */}
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-text-primary flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Meilleurs matchs du moment
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">Annonces scorées ≥ 60% par l&apos;IA selon votre profil</p>
          </div>
          <Link href="/veille" className="text-xs text-primary hover:underline flex items-center gap-1">
            Toute la veille <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {topTenders.length === 0 ? (
          <div className="text-center py-12">
            <Zap className="w-10 h-10 text-border mx-auto mb-3" />
            <p className="text-text-secondary text-sm font-medium">Aucun match scoré pour l&apos;instant</p>
            <p className="text-text-secondary text-xs mt-1">
              Allez dans <Link href="/veille" className="text-primary hover:underline">la veille</Link> et lancez le scoring IA
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {topTenders.map(tender => {
              const isFav = favorites.has(tender.idweb)
              const dl = formatDeadlineDays(tender.datelimitereponse)
              const euros = formatEuros(tender.valeur_estimee)
              return (
                <div key={tender.idweb} className={cn('px-5 py-4 hover:bg-surface/60 transition-colors', isFav ? 'bg-amber-50/30' : '')}>
                  {/* Titre + score + étoile */}
                  <div className="flex items-start gap-2 mb-1.5">
                    <p className="font-medium text-sm text-text-primary flex-1 leading-snug line-clamp-2">
                      {tender.objet ?? '(sans titre)'}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {tender.score !== null && <ScorePill score={tender.score} />}
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        dl.urgent ? 'bg-red-100 text-red-700' : 'bg-surface text-text-secondary',
                      )}>{dl.label}</span>
                      <button
                        onClick={() => toggleFav(tender.idweb)}
                        disabled={favLoading.has(tender.idweb)}
                        className="p-1 rounded-full transition-colors"
                        title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                      >
                        <Star className={cn('w-4 h-4', isFav ? 'fill-amber-400 text-amber-500' : 'text-text-secondary hover:text-amber-400')} />
                      </button>
                    </div>
                  </div>

                  {/* Résumé */}
                  {tender.description_detail && (
                    <p className="text-xs text-text-secondary mb-2 line-clamp-2 leading-relaxed">
                      {tender.description_detail}
                    </p>
                  )}

                  {/* Raison IA */}
                  {tender.reason && (
                    <p className="text-xs text-primary italic mb-2 flex items-start gap-1">
                      <Zap className="w-3 h-3 shrink-0 mt-0.5" />
                      {tender.reason}
                    </p>
                  )}

                  {/* Méta */}
                  <div className="flex items-center gap-4 text-xs text-text-secondary mb-3">
                    {tender.nomacheteur && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{tender.nomacheteur}</span>}
                    {euros && <span className="flex items-center gap-1 font-medium text-text-primary"><Euro className="w-3 h-3" />{euros}</span>}
                    {tender.datelimitereponse && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Limite : {new Date(tender.datelimitereponse).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => handleRepondre(tender)}
                    className="flex items-center gap-1.5 text-xs bg-primary hover:bg-primary-hover text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
                  >
                    Répondre à cet AO <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tous les AO récents */}
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-text-primary">Derniers appels d&apos;offres</h2>
          <Link
            href="/appels-offres/nouveau"
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouvel AO
          </Link>
        </div>
        {aos.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-border mx-auto mb-3" />
            <p className="text-text-secondary font-medium">Aucun appel d&apos;offres pour l&apos;instant</p>
            <Link href="/appels-offres/nouveau" className="text-primary hover:underline text-sm mt-1 block">
              Créer votre premier AO
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {aos.slice(0, 8).map((ao) => (
              <Link key={ao.id} href={`/appels-offres/${ao.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-primary text-sm truncate">{ao.titre}</p>
                  <p className="text-text-secondary text-xs mt-0.5">
                    {ao.acheteur && `${ao.acheteur} — `}{formatDate(ao.created_at)}
                  </p>
                </div>
                <span className={`ml-4 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${getStatutColor(ao.statut)}`}>
                  {getStatutLabel(ao.statut)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
