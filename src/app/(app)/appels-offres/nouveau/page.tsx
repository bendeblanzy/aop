'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/context/OrganizationContext'
import { Loader2, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

/**
 * Création d'un AO suivi.
 *
 * NB : la fonctionnalité "réponse aux AO" (génération DC1/DC2/DUME/mémoire,
 * upload DCE, analyse RC/CCTP) a été retirée. Cette page se contente
 * désormais de créer un suivi d'AO en base, à partir des infos minimales
 * (titre, acheteur, référence, date limite, lien BOAMP/TED).
 */
function NouvelAOPageInner() {
  const router = useRouter()
  const { orgId } = useOrganization()
  const searchParams = useSearchParams()

  const [titre, setTitre] = useState('')
  const [acheteur, setAcheteur] = useState('')
  const [referenceMarche, setReferenceMarche] = useState('')
  const [dateLimite, setDateLimite] = useState('')
  const [urlAvis, setUrlAvis] = useState('')
  const [urlProfilAcheteur, setUrlProfilAcheteur] = useState('')
  const [tenderIdweb, setTenderIdweb] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Pré-remplissage depuis query params (en provenance de la veille)
  useEffect(() => {
    const t = searchParams.get('titre')
    const a = searchParams.get('acheteur')
    const d = searchParams.get('deadline')
    const idweb = searchParams.get('boamp_idweb') || searchParams.get('tender_idweb')
    const url = searchParams.get('boamp_url') || searchParams.get('url_avis')
    const profile = searchParams.get('url_profil_acheteur')
    if (t) setTitre(t)
    if (a) setAcheteur(a)
    if (d) setDateLimite(d.includes('T') ? d.slice(0, 16) : `${d}T00:00`)
    if (idweb) { setTenderIdweb(idweb); setReferenceMarche(idweb) }
    if (url) setUrlAvis(url)
    if (profile) setUrlProfilAcheteur(profile)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!titre.trim()) { toast.error('Veuillez saisir un titre.'); return }
    if (!orgId) { toast.error('Organisation non chargée, veuillez réessayer.'); return }

    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data: ao, error } = await supabase.from('appels_offres').insert({
        organization_id: orgId,
        titre: titre.trim(),
        acheteur: acheteur.trim() || null,
        reference_marche: referenceMarche.trim() || null,
        date_limite_reponse: dateLimite || null,
        statut: 'en_cours',
        notes_utilisateur: notes.trim() || null,
        ...(tenderIdweb ? { tender_idweb: tenderIdweb } : {}),
        ...(urlAvis ? { url_avis: urlAvis } : {}),
        ...(urlProfilAcheteur ? { url_profil_acheteur: urlProfilAcheteur } : {}),
      }).select().single()

      if (error || !ao) {
        toast.error("Erreur lors de la création de l'AO : " + (error?.message ?? 'inconnue'))
        return
      }
      router.push(`/appels-offres/${ao.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/appels-offres" className="text-text-secondary hover:text-primary text-sm flex items-center gap-1.5">
          <ChevronLeft className="w-4 h-4" /> Retour aux appels d&apos;offres
        </Link>
        <h1 className="text-2xl font-bold text-text-primary mt-3">Nouvel appel d&apos;offres suivi</h1>
        <p className="text-text-secondary mt-1 text-sm">
          Suivez un AO de la veille ou ajoutez-le manuellement à partir de ses informations clés.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-border p-6 space-y-5">
        <div>
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Titre *</label>
          <input
            value={titre}
            onChange={e => setTitre(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            placeholder="Ex : Prestations de communication pour l'Anah"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Acheteur</label>
            <input
              value={acheteur}
              onChange={e => setAcheteur(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Ex : Anah"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Référence</label>
            <input
              value={referenceMarche}
              onChange={e => setReferenceMarche(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Ex : 26-33435"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Date limite</label>
            <input
              type="datetime-local"
              value={dateLimite}
              onChange={e => setDateLimite(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">URL avis (BOAMP/TED)</label>
            <input
              value={urlAvis}
              onChange={e => setUrlAvis(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="https://www.boamp.fr/..."
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">URL profil acheteur (DCE)</label>
          <input
            value={urlProfilAcheteur}
            onChange={e => setUrlProfilAcheteur(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            placeholder="https://marches-publics.info/..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            placeholder="Contexte interne, point d'attention…"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Link
            href="/appels-offres"
            className="border border-border text-text-secondary rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-surface transition-colors"
          >
            Annuler
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting || !titre.trim()}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Créer le suivi
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NouvelAOPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <NouvelAOPageInner />
    </Suspense>
  )
}
