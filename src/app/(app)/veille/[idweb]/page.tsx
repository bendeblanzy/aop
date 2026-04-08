'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Calendar, MapPin, Clock,
  ExternalLink, Zap, FileText,
  Star, RefreshCw, Layers, Target, Tag,
  Mail, Phone, MapPinned, Award, CheckCircle2,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [extra, setExtra] = useState<Record<string, any>>({})
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
          if (data.extra) setExtra(data.extra)
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

      {/* Pourquoi cette offre vous correspond */}
      {(tender.score !== null || (profile?.domaines_competences && profile.domaines_competences.length > 0)) && (
        <div className="bg-[#F5F5FF] rounded-xl border border-[#0000FF]/20 p-6 space-y-4">
          <h2 className="font-bold text-[#0000FF] flex items-center gap-2">
            <Target className="w-5 h-5" />
            Pourquoi cette offre vous correspond
          </h2>

          {/* Score bar */}
          {tender.score !== null && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className={cn('text-xs font-bold px-3 py-1 rounded-full border', getScoreBadgeStyle(tender.score))}>
                  {getScoreLabel(tender.score)} — {tender.score}%
                </span>
                <div className="flex-1 h-2.5 bg-white rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', getScoreBarColor(tender.score))} style={{ width: `${tender.score}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* AI reason */}
          {tender.reason && (
            <p className="text-sm text-gray-700 bg-white rounded-lg px-4 py-3 leading-relaxed border border-[#E0E0F0]">
              <Zap className="w-3.5 h-3.5 text-[#0000FF] inline mr-1.5 -mt-0.5" />
              {tender.reason}
            </p>
          )}

          {/* Profile competences match hint */}
          {profile?.domaines_competences && profile.domaines_competences.length > 0 && (
            <div className="text-sm text-gray-600">
              <span className="font-medium text-gray-700">Vos compétences en lien :</span>{' '}
              {profile.domaines_competences.slice(0, 5).join(', ')}
            </div>
          )}

          {!tender.score && !tender.reason && (
            <p className="text-sm text-gray-500 italic">
              Le scoring automatique de cette annonce est en cours. Revenez dans quelques instants.
            </p>
          )}
        </div>
      )}

      {/* Résumé rapide */}
      <div className="bg-white rounded-xl border border-[#E0E0F0] p-6 space-y-5">
        <h2 className="font-bold text-gray-900 flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#0000FF]" />
          Résumé rapide
        </h2>

        {/* Short summary (AI-generated or from BOAMP) */}
        {tender.short_summary && (
          <div className="bg-[#E6E6FF] rounded-lg px-4 py-3">
            <p className="text-sm text-[#0000FF] leading-relaxed">{tender.short_summary}</p>
          </div>
        )}

        {/* Key facts grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Nature</p>
            <p className="text-sm font-semibold text-gray-800">{tender.nature_libelle ?? '—'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Budget</p>
            <p className="text-sm font-semibold text-gray-800">{euros ?? 'N/C'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Durée</p>
            <p className="text-sm font-semibold text-gray-800">{tender.duree_mois ? `${tender.duree_mois} mois` : 'N/C'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Lots</p>
            <p className="text-sm font-semibold text-gray-800">{tender.nb_lots ?? 'Unique'}</p>
          </div>
        </div>

        {/* Mission / Description */}
        {tender.description_detail && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5" />
              Description de la mission
            </h3>
            <div className="text-sm text-gray-700 leading-relaxed">
              {showFullDescription || tender.description_detail.length <= 600
                ? tender.description_detail
                : `${tender.description_detail.slice(0, 600)}...`
              }
              {tender.description_detail.length > 600 && (
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

        {/* CPV codes */}
        {tender.cpv_codes && tender.cpv_codes.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Codes CPV</h3>
            <div className="flex flex-wrap gap-2">
              {tender.cpv_codes.map((code, i) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-mono">{code}</span>
              ))}
            </div>
          </div>
        )}

        {/* NUTS code */}
        {tender.code_nuts && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Code NUTS</h3>
            <p className="text-sm text-gray-700 font-mono">{tender.code_nuts}</p>
          </div>
        )}

        {/* Procedure detail */}
        {tender.procedure_libelle && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Type de procédure</h3>
            <p className="text-sm text-gray-700">{tender.procedure_libelle}</p>
          </div>
        )}

        {/* Diffusion end date */}
        {tender.datefindiffusion && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Fin de diffusion</h3>
            <p className="text-sm text-gray-700">{formatDate(tender.datefindiffusion)}</p>
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

        {/* Lieu d'exécution (from BOAMP live) */}
        {extra.lieu_execution && (
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1.5">
              <MapPinned className="w-3.5 h-3.5" />
              Lieu d&apos;exécution
            </span>
            <p className="text-sm text-gray-700">{extra.lieu_execution as string}</p>
          </div>
        )}

        {/* Lots — enriched with descriptions from BOAMP live */}
        {tender.nb_lots !== null && tender.nb_lots > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Lots ({tender.nb_lots})
            </h3>
            {Array.isArray(extra.lots_details) && extra.lots_details.length > 0 ? (
              <div className="space-y-2">
                {(extra.lots_details as { titre: string; description?: string; cpv?: string }[]).map((lot, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-bold text-[#0000FF] bg-[#E6E6FF] px-2 py-0.5 rounded shrink-0">Lot {i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{lot.titre}</p>
                        {lot.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{lot.description}</p>}
                        {lot.cpv && <span className="text-xs text-gray-400 font-mono mt-1 inline-block">CPV: {lot.cpv}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : lots.length > 0 ? (
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

      {/* Critères d'attribution (from BOAMP live) */}
      {Array.isArray(extra.criteres_attribution) && extra.criteres_attribution.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E0E0F0] p-6 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-[#0000FF]" />
            Critères d&apos;attribution
          </h2>
          <div className="space-y-2">
            {(extra.criteres_attribution as { nom: string; poids?: string }[]).map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                <span className="text-sm text-gray-700 font-medium">{c.nom}</span>
                {c.poids && (
                  <span className="text-sm font-bold text-[#0000FF] bg-[#E6E6FF] px-2.5 py-0.5 rounded-full">{c.poids}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conditions de participation (from BOAMP live) */}
      {Array.isArray(extra.conditions_participation) && extra.conditions_participation.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E0E0F0] p-6 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#0000FF]" />
            Conditions de participation
          </h2>
          <div className="space-y-2">
            {(extra.conditions_participation as string[]).map((cond, i) => (
              <div key={i} className="text-sm text-gray-700 bg-gray-50 rounded-lg px-4 py-3 leading-relaxed">
                {cond}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact acheteur (from BOAMP live) */}
      {extra.contact_acheteur && typeof extra.contact_acheteur === 'object' && (
        <div className="bg-white rounded-xl border border-[#E0E0F0] p-6 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#0000FF]" />
            Contact de l&apos;acheteur
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(extra.contact_acheteur as Record<string, string>).nom && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-gray-700">{(extra.contact_acheteur as Record<string, string>).nom}</span>
              </div>
            )}
            {(extra.contact_acheteur as Record<string, string>).email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                <a href={`mailto:${(extra.contact_acheteur as Record<string, string>).email}`} className="text-[#0000FF] hover:underline">
                  {(extra.contact_acheteur as Record<string, string>).email}
                </a>
              </div>
            )}
            {(extra.contact_acheteur as Record<string, string>).telephone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-gray-700">{(extra.contact_acheteur as Record<string, string>).telephone}</span>
              </div>
            )}
            {(extra.contact_acheteur as Record<string, string>).adresse && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-gray-700">{(extra.contact_acheteur as Record<string, string>).adresse}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modalités de remise des offres (from BOAMP live) */}
      {extra.modalites_remise && (
        <div className="bg-white rounded-xl border border-[#E0E0F0] p-6 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#0000FF]" />
            Modalités de remise des offres
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{extra.modalites_remise as string}</p>
        </div>
      )}

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
