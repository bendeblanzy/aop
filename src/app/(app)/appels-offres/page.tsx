import { createClient } from '@/lib/supabase/server'
import { formatDate, getStatutColor, getStatutLabel } from '@/lib/utils'
import { Plus, FileText } from 'lucide-react'
import Link from 'next/link'
import DeleteAOButton from '@/components/appels-offres/DeleteAOButton'

export default async function AppelsOffresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: aos } = await supabase
    .from('appels_offres')
    .select('*')
    
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Appels d&apos;offres</h1>
          <p className="text-text-secondary mt-1 text-sm">{aos?.length ?? 0} appel{(aos?.length ?? 0) > 1 ? 's' : ''} d&apos;offres</p>
        </div>
        <Link
          href="/appels-offres/nouveau"
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvel appel d&apos;offres
        </Link>
      </div>

      {!aos || aos.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-16 text-center">
          <FileText className="w-12 h-12 text-border mx-auto mb-4" />
          <h3 className="font-semibold text-text-primary mb-1">Aucun appel d&apos;offres</h3>
          <p className="text-text-secondary text-sm mb-6">Commencez par créer votre premier AO</p>
          <Link href="/appels-offres/nouveau" className="bg-primary hover:bg-primary-hover text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Créer un AO
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border divide-y divide-border">
          {aos.map((ao) => (
            <div key={ao.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-4 sm:py-5 hover:bg-surface transition-colors group gap-3">
              <Link href={`/appels-offres/${ao.id}`} className="flex-1 min-w-0">
                <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-wrap">
                  <p className="font-medium text-text-primary group-hover:text-primary transition-colors line-clamp-2 sm:truncate" title={ao.titre}>{ao.titre}</p>
                  <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatutColor(ao.statut)}`}>
                    {getStatutLabel(ao.statut)}
                  </span>
                </div>
                <div className="flex items-center gap-3 sm:gap-4 mt-1 flex-wrap">
                  {ao.acheteur && <span className="text-xs sm:text-sm text-text-secondary">{ao.acheteur}</span>}
                  {ao.reference_marche && <span className="text-xs sm:text-sm text-text-secondary">Réf. {ao.reference_marche}</span>}
                  {ao.date_limite_reponse && (
                    <span className="text-xs sm:text-sm text-text-secondary">
                      Échéance : {formatDate(ao.date_limite_reponse)}
                    </span>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-text-secondary hidden sm:inline">{formatDate(ao.created_at)}</span>
                <DeleteAOButton id={ao.id} titre={ao.titre} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
