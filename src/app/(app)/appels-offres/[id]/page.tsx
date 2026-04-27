import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatDate, getStatutColor, getStatutLabel } from '@/lib/utils'
import { Clock, Building2, Tag, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { AppelOffre } from '@/lib/types'
import AOActions from '@/components/appels-offres/AOActions'

export default async function AODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  await supabase.auth.getUser()

  const { data: ao } = await supabase
    .from('appels_offres')
    .select('*')
    .eq('id', id)
    
    .single() as { data: AppelOffre | null }

  if (!ao) notFound()

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/appels-offres" className="text-text-secondary hover:text-primary text-sm">← Retour</Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{ao.titre}</h1>
          <div className="flex items-center gap-3 sm:gap-4 mt-2 flex-wrap">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatutColor(ao.statut)}`}>
              {getStatutLabel(ao.statut)}
            </span>
            {ao.reference_marche && (
              <span className="text-sm text-text-secondary flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> {ao.reference_marche}
              </span>
            )}
            {ao.acheteur && (
              <span className="text-sm text-text-secondary flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> {ao.acheteur}
              </span>
            )}
            {ao.date_limite_reponse && (
              <span className="text-sm text-text-secondary flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Échéance : {formatDate(ao.date_limite_reponse)}
              </span>
            )}
          </div>
        </div>
        <AOActions ao={ao} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne principale */}
        <div className="lg:col-span-2 space-y-6">
          {/* Liens vers les sources */}
          {(ao.url_avis || ao.url_profil_acheteur) && (
            <div className="bg-white rounded-xl border border-border p-6 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-text-primary mb-3">Sources</h2>
              <div className="space-y-2">
                {ao.url_avis && (
                  <a href={ao.url_avis} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" /> Voir l&apos;avis officiel
                  </a>
                )}
                {ao.url_profil_acheteur && (
                  <a href={ao.url_profil_acheteur} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" /> Profil acheteur (DCE)
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {ao.notes_utilisateur && (
            <div className="bg-white rounded-xl border border-border p-6 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-text-primary mb-3">Notes</h2>
              <p className="text-sm text-text-primary whitespace-pre-line">{ao.notes_utilisateur}</p>
            </div>
          )}
        </div>

        {/* Colonne latérale */}
        <div className="space-y-6">
          {/* Infos */}
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm overflow-hidden">
            <h2 className="font-semibold text-text-primary mb-3">Informations</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Créé le</dt>
                <dd className="text-text-primary">{formatDate(ao.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Modifié le</dt>
                <dd className="text-text-primary">{formatDate(ao.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
