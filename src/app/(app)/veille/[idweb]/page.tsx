'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Calendar, MapPin, Clock,
  ExternalLink, Zap, FileText,
  Star, RefreshCw, Layers, Target, Tag,
  Mail, Phone, MapPinned, Award, CheckCircle2,
} from 'lucide-react'
import { cn, decodeHtmlEntities, isUnscored } from '@/lib/utils'
import { toast } from 'sonner'
import { buildProfileKeywords, getMatchingLots } from '@/lib/boamp/lot-matching'

// ── Types ────────────────────────────────────────────────────────────────────

interface TenderDetail {
  id: string
  idweb: string
  source: 'boamp' | 'ted' | 'atexo' | null
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

// ─── Helpers source/plateforme ───────────────────────────────────────────────

/**
 * Label court d'une plateforme (pour les chips de référence).
 * Décode les préfixes Atexo (atx-place-..., atx-mxm-..., etc.) en nom lisible.
 */
function sourceLabel(source: string | null | undefined, idweb: string | null | undefined): string {
  if (source === 'ted') return 'TED'
  if (source === 'boamp') return 'BOAMP'
  if (source === 'atexo' && idweb) {
    if (idweb.startsWith('atx-place-')) return 'PLACE'
    if (idweb.startsWith('atx-mxm-')) return 'Maximilien'
    if (idweb.startsWith('atx-bdr-')) return 'Marchés 13'
    if (idweb.startsWith('atx-pdl-')) return 'PdL'
    if (idweb.startsWith('atx-adullact-')) return 'Adullact'
    if (idweb.startsWith('atx-mtp3m-')) return 'Montpellier 3M'
    if (idweb.startsWith('atx-grandest-')) return 'Grand Est'
    if (idweb.startsWith('atx-alsace-')) return 'Alsace'
    return 'Atexo'
  }
  return 'Source'
}

/** Nom long pour la phrase descriptive ("plateforme XXX"). */
function platformDescription(source: string | null | undefined, idweb: string | null | undefined): string {
  if (source === 'ted') return 'TED (Tenders Electronic Daily — Journal officiel UE)'
  if (source === 'boamp') return 'BOAMP'
  if (source === 'atexo') return `${sourceLabel(source, idweb)} (Atexo Local Trust MPE)`
  return 'la plateforme acheteur'
}

interface ProfileInfo {
  activite_metier: string | null
  raison_sociale: string | null
  domaines_competences: string[] | null
  positionnement?: string | null
  atouts_differenciants?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise les libellés de procédure TED (anglais brut) en français. */
function normalizeProcedureLibelle(libelle: string | null): string | null {
  if (!libelle) return null
  const lower = libelle.toLowerCase().trim()
  const map: Record<string, string> = {
    'open': 'Procédure Ouverte',
    'restricted': 'Procédure Restreinte',
    'negotiated': 'Procédure Négociée',
    'negotiated with prior publication': 'Procédure Négociée avec publication',
    'competitive dialogue': 'Dialogue Compétitif',
    'innovation partnership': 'Partenariat d\'Innovation',
    'competitive procedure with negotiation': 'Procédure Concurrentielle avec Négociation',
  }
  return map[lower] ?? libelle
}

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

function getScoreLabel(score: number, reason?: string | null): string {
  if (isUnscored(reason)) return 'Non évalué'
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
  const sourceRef = tender.idweb ? `${sourceLabel(tender.source, tender.idweb)} : ${tender.idweb}` : null

  // Matching lots ↔ profil
  const profileKeywords = buildProfileKeywords(profile ? {
    activite_metier: profile.activite_metier,
    domaines_competence: profile.domaines_competences,
    positionnement: profile.positionnement,
    atouts_differenciants: profile.atouts_differenciants,
  } : null)
  const hasProfileData = !!(profile?.activite_metier || (profile?.domaines_competences?.length ?? 0) > 0)

  // Détecter ouvert / restreint
  const src = ((tender.procedure_libelle ?? '') + ' ' + (tender.type_procedure ?? '')).toLowerCase()
  const isRestreint = src.includes('restreint') || src.includes('restricted') || src.includes('négocié') || src.includes('negocie')
  const isOuvert = !isRestreint && (src.includes('ouvert') || src.includes('open') || src.includes('mapa') || src.includes('adapté') || src.includes('adapte'))

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
        {/* Badge OUVERT / RESTREINT — priorité maximale */}
        {isRestreint && (
          <span className="text-sm font-bold bg-amber-100 text-amber-800 border border-amber-300 px-4 py-1.5 rounded-full">
            🔒 Procédure RESTREINTE
          </span>
        )}
        {isOuvert && (
          <span className="text-sm font-bold bg-green-100 text-green-800 border border-green-300 px-4 py-1.5 rounded-full">
            ✓ Procédure OUVERTE
          </span>
        )}
        <span className="text-xs font-bold bg-[#0000FF] text-white px-3 py-1 rounded-full uppercase">
          {tender.nature_libelle ?? 'Services'}
        </span>
        {tender.type_marche && tender.type_marche.toLowerCase() !== (tender.nature_libelle ?? '').toLowerCase() && (
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
        {sourceRef && (
          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{sourceRef}</span>
        )}
        {tender.nomacheteur && (
          <span className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4" />
            <span className="font-medium text-gray-700">{decodeHtmlEntities(tender.nomacheteur)}</span>
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
      <div className="grid grid-cols-1 gap-4">
        {/* Voir l'annonce originale */}
        <div className="bg-[#F5F5FF] rounded-xl border border-[#E0E0F0] p-5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Candidater à cet appel d&apos;offres</h3>
            <p className="text-xs text-gray-500 mt-0.5">Accédez à l&apos;annonce officielle sur {platformDescription(tender.source, tender.idweb)}</p>
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
                  {isUnscored(tender.reason) ? 'Non évalué' : `${getScoreLabel(tender.score, tender.reason)} — ${tender.score}%`}
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

        {/* Short summary or full description from BOAMP live */}
        {(extra.description_complete || tender.short_summary) && (
          <div className="bg-[#E6E6FF] rounded-lg px-4 py-3">
            <p className="text-sm text-[#0000FF] leading-relaxed whitespace-pre-line">
              {(extra.description_complete as string) ?? tender.short_summary}
            </p>
          </div>
        )}

        {/* Key facts grid — données critiques toujours affichées */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Nature</p>
            <p className="text-sm font-semibold text-gray-800">{tender.nature_libelle ?? '—'}</p>
          </div>
          <div className={cn('rounded-lg p-3 text-center border', euros ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100')}>
            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Budget estimé</p>
            {euros
              ? <p className="text-base font-bold text-[#0000FF]">{euros}</p>
              : <p className="text-xs text-gray-400 italic mt-1">Non communiqué</p>
            }
          </div>
          <div className={cn('rounded-lg p-3 text-center border', tender.duree_mois ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100')}>
            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Durée</p>
            {tender.duree_mois
              ? <p className="text-base font-bold text-[#0000FF]">{tender.duree_mois} mois</p>
              : <p className="text-xs text-gray-400 italic mt-1">Non précisée</p>
            }
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Lots</p>
            <p className="text-sm font-semibold text-gray-800">{tender.nb_lots ?? 'Lot unique'}</p>
          </div>
        </div>
        {/* Procédure mise en avant */}
        {tender.procedure_libelle && (
          <div className={cn('rounded-lg px-4 py-3 border text-sm font-medium flex items-center gap-2',
            isRestreint ? 'bg-amber-50 border-amber-200 text-amber-800' :
            isOuvert ? 'bg-green-50 border-green-200 text-green-800' :
            'bg-gray-50 border-gray-200 text-gray-700'
          )}>
            <span className="font-bold">Procédure :</span> {normalizeProcedureLibelle(tender.procedure_libelle)}
          </div>
        )}

        {/* Mission / Description — use DB field or BOAMP live description */}
        {(() => {
          const descText = tender.description_detail || (extra.description_complete as string) || null
          if (!descText) return null
          return (
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Target className="w-3.5 h-3.5" />
                Description de la mission
              </h3>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {showFullDescription || descText.length <= 800
                  ? descText
                  : `${descText.slice(0, 800)}...`
                }
                {descText.length > 800 && (
                  <button
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="ml-1 text-[#0000FF] font-medium hover:underline text-xs"
                  >
                    {showFullDescription ? 'Voir moins' : 'Voir plus'}
                  </button>
                )}
              </div>
            </div>
          )
        })()}

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
            <p className="text-sm text-gray-700">{normalizeProcedureLibelle(tender.procedure_libelle)}</p>
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
            <p className="text-sm font-medium text-gray-900">{tender.nomacheteur ? decodeHtmlEntities(tender.nomacheteur) : '—'}</p>
          </div>

          {/* Procédure */}
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase">Procédure</span>
            <p className="text-sm text-gray-700">{normalizeProcedureLibelle(tender.procedure_libelle) ?? tender.type_procedure ?? '—'}</p>
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
            {Array.isArray(extra.lots_details) && extra.lots_details.length > 0 ? (() => {
              const lotsEnriched = extra.lots_details as { titre: string; description?: string; cpv?: string }[]
              const titres = lotsEnriched.map(l => l.titre)
              const matchData = hasProfileData ? getMatchingLots(titres, profileKeywords) : null
              return (
                <div className="space-y-2">
                  {lotsEnriched.map((lot, i) => {
                    const isRelevant = matchData?.[i]?.relevant ?? null
                    return (
                      <div key={i} className={cn(
                        'rounded-lg px-4 py-3',
                        isRelevant === true ? 'bg-green-50 border border-green-200' :
                        isRelevant === false ? 'bg-gray-50 border border-gray-100 opacity-70' :
                        'bg-gray-50',
                      )}>
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold text-[#0000FF] bg-[#E6E6FF] px-2 py-0.5 rounded shrink-0">Lot {i + 1}</span>
                          {isRelevant === true && (
                            <span className="text-xs font-semibold text-green-700 bg-green-100 border border-green-200 px-2 py-0.5 rounded-full shrink-0">
                              ✓ Pour vous
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-sm font-medium', isRelevant === false ? 'text-gray-500' : 'text-gray-900')}>{lot.titre}</p>
                            {lot.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{lot.description}</p>}
                            {lot.cpv && <span className="text-xs text-gray-400 font-mono mt-1 inline-block">CPV: {lot.cpv}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })() : lots.length > 0 ? (() => {
              const matchData = hasProfileData ? getMatchingLots(lots, profileKeywords) : null
              return (
                <div className="space-y-1">
                  {lots.map((lot, i) => {
                    const isRelevant = matchData?.[i]?.relevant ?? null
                    return (
                      <div key={i} className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2',
                        isRelevant === true ? 'bg-green-50 border border-green-200' :
                        isRelevant === false ? 'bg-gray-50 opacity-70' :
                        'bg-gray-50',
                      )}>
                        <span className="text-xs font-bold text-[#0000FF] shrink-0">Lot {i + 1} :</span>
                        <span className={cn('text-sm flex-1', isRelevant === false ? 'text-gray-400' : 'text-gray-700')}>{lot}</span>
                        {isRelevant === true && (
                          <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">✓ Pour vous</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })() : (
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
              Voir sur {sourceLabel(tender.source, tender.idweb)}
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

      {/* Critères d'attribution (structured or text) */}
      {(Array.isArray(extra.criteres_attribution) || extra.criteres_attribution_texte) && (
        <div className="bg-white rounded-xl border border-[#E0E0F0] p-6 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-[#0000FF]" />
            Critères d&apos;attribution
          </h2>
          {Array.isArray(extra.criteres_attribution) ? (
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
          ) : (
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-4 py-3 leading-relaxed">
              {extra.criteres_attribution_texte as string}
            </p>
          )}
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
            {(extra.contact_acheteur as Record<string, string>).organisme && (
              <div className="flex items-center gap-2 text-sm sm:col-span-2">
                <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-gray-900 font-semibold">{(extra.contact_acheteur as Record<string, string>).organisme}</span>
                {(extra.contact_acheteur as Record<string, string>).siret && (
                  <span className="text-xs text-gray-400 font-mono ml-1">SIRET {(extra.contact_acheteur as Record<string, string>).siret}</span>
                )}
              </div>
            )}
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
            {(extra.contact_acheteur as Record<string, string>).correspondant && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-gray-500">{(extra.contact_acheteur as Record<string, string>).correspondant}</span>
              </div>
            )}
            {(extra.contact_acheteur as Record<string, string>).site_web && (
              <div className="flex items-center gap-2 text-sm">
                <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
                <a href={(extra.contact_acheteur as Record<string, string>).site_web} target="_blank" rel="noopener noreferrer" className="text-[#0000FF] hover:underline">
                  Site web
                </a>
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

      {/* Justifications / pièces à fournir */}
      {extra.justifications && (
        <div className="bg-white rounded-xl border border-[#E0E0F0] p-6 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#0000FF]" />
            Pièces à fournir
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{extra.justifications as string}</p>
        </div>
      )}

      {/* Informations complémentaires */}
      {extra.informations_complementaires && (
        <div className="bg-white rounded-xl border border-[#E0E0F0] p-6 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#0000FF]" />
            Informations complémentaires
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{extra.informations_complementaires as string}</p>
        </div>
      )}

      {/* Lien vers les documents de consultation */}
      {extra.url_documents && (
        <div className="bg-[#F5F5FF] rounded-xl border border-[#0000FF]/20 p-5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Documents de consultation (DCE)</h3>
            <p className="text-xs text-gray-500 mt-0.5">Accédez aux pièces du dossier de consultation</p>
          </div>
          <a
            href={extra.url_documents as string}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
            Voir les documents
          </a>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="flex items-center bg-white rounded-xl border border-[#E0E0F0] p-4">
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
      </div>
    </div>
  )
}
