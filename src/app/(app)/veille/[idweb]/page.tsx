'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Calendar, MapPin, Clock,
  ExternalLink, Zap, FileText, ChevronDown, ChevronUp,
  Star, RefreshCw, Layers, Target, Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

interface TenderDetail {
  id: string
  idweb: string
  objet: string | null
  nomacheteur: string | null
  famille: string | null
  nature: string | null
  nature_libelle: string | null
  dateparution: string | null
  datelimitereponse: string | null
  datefindiffusion: string | null
  descripteur_codes: string[]
  descripteur_libelles: string[]
  type_marche: string | null
  url_avis: string | null
  url_profil_acheteur: string | null
  description_detail: string | null
  valeur_estimee: number | null
  budget_estime: number | null
  duree_mois: number | null
  short_summary: string | null
  code_departement: string[]
  type_procedure: string | null
  procedure_libelle: string | null
  cpv_codes: string[]
  code_nuts: string | null
  nb_lots: number | null
  lots_titres: string[]
  score: number | null
  reason: string | null
  created_at: string
  updated_at: string
}

interface ProfileInfo {
  activite_metier: string | null
  raison_sociale: string | null
  domaines_competences: string[] | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return '—' }
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  } catch { return '—' }
}

function formatEuros(v: number | null) {
  if (!v) return null
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M€`
  if (v >= 1_000) return `${Math.round(v / 1_000)} k€`
  return `${v} €`
}

function getDeadlineInfo(iso: string | null) {
  if (!iso) return { label: 'Pas de date limite', urgent: false, expired: false, daysLeft: null }
  try {
    const d = new Date(iso)
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
    if (days < 0) return { label: formatDateTime(iso), urgent: true, expired: true, daysLeft: days }
    return { label: formatDateTime(iso), urgent: days <= 7, expired: false, daysLeft: days }
  } catch { return { label: '—', urgent: false, expired: false, daysLeft: null } }
}

function getScoreLabel(score: number) {
  if (score >= 80) return 'Excellent match'
  if (score >= 60) return 'Bon match'
  if (score >= 40) return 'Match partiel'
  return 'Faible'
}

function getScoreBadgeStyle(score: number) {
  if (score >= 80) return 'bg-green-100 text-green-700 border-green-200'
  if (score >= 60) return 'bg-[#E6E6FF] text-[#0000FF] border-[#ccccff]'
  if (score >= 40) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function getScoreBarColor(score: number) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-[#0000FF]'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-gray-400'
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TenderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const idweb = params.idweb as string

  const [tender, setTender] = useState<TenderDetail | null>(null)
  const [profile, setProfile] = useState<ProfileInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFav, setIsFav] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [showFullDescription, setShowFullDescription] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [tenderRes, favsRes] = await Promise.all([
          fetch(`/api/veille/tenders/${encodeURIComponent(idweb)}`),
          fetch('/api/veille/favorites'),
        ])

        if (tenderRes.ok) {
          const data = await tenderRes.json()
          setTender(data.tender)
          setProfile(data.profile)
        }

        if (favsRes.ok) {
          const favsData = await favsRes.json()
          if (Array.isArray(favsData.favorites)) {
            setIsFav(favsData.favorites.includes(idweb))
          }
        }
      } catch {
        toast.error('Impossible de charger le détail')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [idweb])

  async function toggleFav() {
    setFavLoading(true)
    try {
      const res = await fetch('/api/veille/favorites', {
        method: isFav ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idweb }),
      })
      if (res.ok) {
        setIsFav(!isFav)
        toast.success(isFav ? 'Retiré des favoris' : 'Ajouté aux favoris')
      }
    } catch {
      toast.error('Erreur favoris')
    } finally {
      setFavLoading(false)
    }
  }

  function handleRepondre() {
    if (!tender) return
    const p = new URLSearchParams()
    if (tender.objet) p.set('titre', tender.objet)
    if (tender.nomacheteur) p.set('acheteur', tender.nomacheteur)
    if (tender.idweb) p.set('boamp_idweb', tender.idweb)
    if (tender.datelimitereponse) p.set('deadline', tender.datelimitereponse.split('T')[0])
    if (tender.url_profil_acheteur) p.set('boamp_url', tender.url_profil_acheteur)
    router.push(`/appels-offres/nouveau?${p.toString()}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <RefreshCw className="w-7 h-7 animate-spin text-[#0000FF]" />
      </div>
    )
  }

  if (!tender) {
    return (
      <div className="text-center py-16">
        <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Annonce introuvable</p>
        <Link href="/veille" className="text-[#0000FF] text-sm hover:underline mt-2 inline-block">
          ← Retour à la recherche
        </Link>
      </div>
    )
  }

  const deadline = getDeadlineInfo(tender.datelimitereponse)
  const euros = formatEuros(tender.valeur_estimee ?? tender.budget_estime)
  const depts = Array.isArray(tender.code_departement) ? tender.code_departement : []
  const descripteurs = Array.isArray(tender.descripteur_libelles) ? tender.descripteur_libelles : []
  const lots = Array.isArray(tender.lots_titres) ? tender.lots_titres : []
  const boampRef = tender.idweb ? `BOAMP : ${tender.idweb}` : null

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/veille"
        className="inline-flex items-center gap-1.5 text-sm text-[#0000FF] hover:underline font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour à la recherche
      </Link>

      {/* Header badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold bg-[#0000FF] text-white px-3 py-1 rounded-full uppercase">
          {tender.nature_libelle ?? 'Services'}
        </span>
        {tender.type_marche && (
          <span className="text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
            {tender.type_marche}
          </span>
        )}
        {deadline.expired && (
          <span className="text-xs font-bold bg-orange-100 text-orange-600 px-3 py-1 rounded-full">
            Expiré
          </span>
        )}
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-[#0000FF] leading-snug uppercase">
        {tender.objet ?? '(sans titre)'}
      </h1>

      {/* Reference + Meta line */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
        {boampRef && (
          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{boampRef}</span>
        )}
        {tender.nomacheteur && (
          <span className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4" />
            <span className="font-medium text-gray-700">{tender.nomacheteur}</span>
          </span>
        )}
        {depts.length > 0 && (
          <span className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            Dép. {depts.join(', ')}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          Publié le {formatDate(tender.dateparution)}
        </span>
      </div>

      <hr className="border-[#E0E0F0]" />

      {/* Action cards row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Voir l'annonce originale */}
        <div className="bg-[#F5F5FF] rounded-xl border border-[#E0E0F0] p-5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Candidater à cet appel d&apos;offres</h3>
            <p className="text-xs text-gray-500 mt-0.5">Accédez à l&apos;annonce officielle sur la plateforme BOAMP</p>
          </div>
          {tender.url_avis ? (
            <a
              href={tender.url_avis}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
              Voir l&apos;annonce
            </a>
          ) : tender.url_profil_acheteur ? (
            <a
              href={tender.url_profil_acheteur}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
              Voir l&apos;annonce
            </a>
          ) : (
            <span className="text-xs text-gray-400 italic">Lien non disponible</span>
          )}
        </div>

        {/* Générer une réponse */}
        <div className="bg-[#F5F5FF] rounded-xl border border-[#E0E0F0] p-5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Générer une réponse automatique</h3>
            <p className="text-xs text-gray-500 mt-0.5">Utilisez l&apos;IA pour générer un brouillon de réponse à partir du DCE</p>
          </div>
          <button
            onClick={handleRepondre}
            className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors shrink-0"
          >
            <FileText className="w-4 h-4" />
            Générer une réponse
          </button>
        </div>
      </div>

      {/* Résumé rapide / Score IA */}
      <div className="bg-white rounded-xl border border-[#E0E0F0] p-6 space-y-5">
        <h2 className="font-bold text-gray-900 flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#0000FF]" />
          Résumé rapide
        </h2>

        {/* Mission */}
        {tender.description_detail && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5" />
              Mission
            </h3>
            <div className="text-sm text-gray-700 leading-relaxed">
              {showFullDescription || tender.description_detail.length <= 400
                ? tender.description_detail
                : `${tender.description_detail.slice(0, 400)}...`
              }
              {tender.description_detail.length > 400 && (
                <button
                  onClick={() => setShowFullDescription(!showFullDescription)}
                  className="ml-1 text-[#0000FF] font-medium hover:underline text-xs"
                >
                  {showFullDescription ? 'Voir moins' : 'Voir plus'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Score / Pourquoi ça matche */}
        {tender.score !== null && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5" />
              Pourquoi ça matche
            </h3>
            <div className="flex items-center gap-3 mb-2">
              <span className={cn('text-xs font-bold px-3 py-1 rounded-full border', getScoreBadgeStyle(tender.score))}>
                {getScoreLabel(tender.score)} — {tender.score}%
              </span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', getScoreBarColor(tender.score))} style={{ width: `${tender.score}%` }} />
              </div>
            </div>
            {tender.reason && (
              <p className="text-sm text-[#0000FF] italic bg-[#E6E6FF] rounded-lg px-4 py-3 leading-relaxed">
                {tender.reason}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Informations détaillées */}
      <div className="bg-white rounded-xl border border-[#E0E0F0] p-6 space-y-5">
        <h2 className="font-bold text-gray-900">Informations détaillées</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Acheteur */}
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase">Acheteur</span>
            <p className="text-sm font-medium text-gray-900">{tender.nomacheteur ?? '—'}</p>
          </div>

          {/* Procédure */}
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase">Procédure</span>
            <p className="text-sm text-gray-700">{tender.procedure_libelle ?? tender.type_procedure ?? '—'}</p>
          </div>

          {/* Budget */}
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase">Budget estimé</span>
            <p className="text-sm font-medium text-gray-900">{euros ?? 'Non renseigné'}</p>
          </div>

          {/* Durée */}
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase">Durée</span>
            <p className="text-sm text-gray-700">{tender.duree_mois ? `${tender.duree_mois} mois` : 'Non renseignée'}</p>
          </div>

          {/* Département */}
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase">Département</span>
            <p className="text-sm text-gray-700">{depts.length > 0 ? depts.join(', ') : '—'}</p>
          </div>

          {/* Date limite */}
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase">Date limite de réponse</span>
            <p className={cn('text-sm font-medium', deadline.expired ? 'text-orange-500' : deadline.urgent ? 'text-red-600' : 'text-gray-900')}>
              {deadline.label}
              {deadline.daysLeft !== null && !deadline.expired && (
                <span className="ml-1 text-xs text-gray-500">({deadline.daysLeft}j restants)</span>
              )}
            </p>
          </div>
        </div>

        {/* Lots */}
        {tender.nb_lots !== null && tender.nb_lots > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Lots ({tender.nb_lots})
            </h3>
            {lots.length > 0 ? (
              <div className="space-y-1">
                {lots.map((lot, i) => (
                  <div key={i} className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="font-medium text-gray-500 mr-2">Lot {i + 1} :</span>
                    {lot}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">Titres des lots non disponibles</p>
            )}
          </div>
        )}

        {/* Descripteurs / Tags */}
        {descripteurs.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              Descripteurs
            </h3>
            <div className="flex flex-wrap gap-2">
              {descripteurs.map((d, i) => (
                <span key={i} className="text-xs bg-[#E6E6FF] text-[#0000FF] px-3 py-1 rounded-full font-medium">{d}</span>
              ))}
            </div>
          </div>
        )}

        {/* Liens source */}
        <div className="pt-3 border-t border-[#E0E0F0] flex flex-wrap gap-3">
          {tender.url_avis && (
            <a
              href={tender.url_avis}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[#0000FF] hover:underline font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Voir sur le BOAMP
            </a>
          )}
          {tender.url_profil_acheteur && (
            <a
              href={tender.url_profil_acheteur}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[#0000FF] hover:underline font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Plateforme de l&apos;acheteur
            </a>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-[#E0E0F0] p-4">
        <button
          onClick={toggleFav}
          disabled={favLoading}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
            isFav
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-white border-[#E0E0F0] text-gray-600 hover:border-amber-300 hover:text-amber-600'
          )}
        >
          <Star className={cn('w-4 h-4', isFav ? 'fill-amber-400' : '')} />
          {isFav ? 'Dans vos favoris' : 'Ajouter aux favoris'}
        </button>

        <div className="flex items-center gap-3">
          {!deadline.expired && (
            <button
              onClick={handleRepondre}
              className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              <FileText className="w-4 h-4" />
              Répondre à cet AO
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
