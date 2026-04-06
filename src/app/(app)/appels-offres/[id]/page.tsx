import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatDate, getStatutColor, getStatutLabel } from '@/lib/utils'
import { FileText, Download, Clock, Building2, Tag } from 'lucide-react'
import Link from 'next/link'
import type { AppelOffre } from '@/lib/types'
import AOActions from '@/components/appels-offres/AOActions'

const docLabels: Record<string, string> = {
  dc1: 'DC1 — Lettre de candidature',
  dc2: 'DC2 — Déclaration du candidat',
  dc4: 'DC4 — Déclaration de sous-traitance',
  dume: 'DUME — Document Unique Européen',
  memoire_technique: 'Mémoire technique',
}

export default async function AODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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

          {/* Analyse RC */}
          {ao.analyse_rc && (
            <div className="bg-white rounded-xl border border-border p-6 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-text-primary mb-4">Analyse du Règlement de Consultation</h2>
              {ao.analyse_rc.objet && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-text-secondary uppercase mb-1">Objet du marché</p>
                  <p className="text-sm text-text-primary">{ao.analyse_rc.objet}</p>
                </div>
              )}
              {Array.isArray(ao.analyse_rc.criteres_notation) && ao.analyse_rc.criteres_notation.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-text-secondary uppercase mb-2">Critères de notation</p>
                  <div className="space-y-2">
                    {ao.analyse_rc.criteres_notation.map((c, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1 bg-surface rounded-full h-2">
                          <div className="bg-primary h-2 rounded-full" style={{ width: `${c.ponderation_pourcentage}%` }} />
                        </div>
                        <span className="text-sm text-text-primary w-48 shrink-0">{c.critere}</span>
                        <span className="text-sm font-medium text-primary w-12 text-right">{c.ponderation_pourcentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(ao.analyse_rc.pieces_exigees) && ao.analyse_rc.pieces_exigees.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase mb-2">Pièces exigées</p>
                  <ul className="space-y-1">
                    {ao.analyse_rc.pieces_exigees.map((p: string | { piece: string; detail?: string }, i: number) => (
                      <li key={i} className="text-sm text-text-primary flex items-start gap-2">
                        <span className="text-primary">•</span>
                        {typeof p === 'string' ? p : `${p.piece}${p.detail ? ` — ${p.detail}` : ''}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Analyse CCTP */}
          {ao.analyse_cctp && (
            <div className="bg-white rounded-xl border border-border p-6 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-text-primary mb-4">Analyse du CCTP</h2>
              {ao.analyse_cctp.prestations_attendues && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-text-secondary uppercase mb-1">Prestations attendues</p>
                  <p className="text-sm text-text-primary">{ao.analyse_cctp.prestations_attendues}</p>
                </div>
              )}
              {Array.isArray(ao.analyse_cctp.livrables) && ao.analyse_cctp.livrables.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase mb-2">Livrables</p>
                  <ul className="space-y-1">
                    {ao.analyse_cctp.livrables.map((l, i) => <li key={i} className="text-sm text-text-primary flex items-start gap-2"><span className="text-primary">•</span>{l}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {ao.notes_utilisateur && (
            <div className="bg-white rounded-xl border border-border p-6 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-text-primary mb-3">Notes</h2>
              <p className="text-sm text-text-primary">{ao.notes_utilisateur}</p>
            </div>
          )}
        </div>

        {/* Colonne latérale */}
        <div className="space-y-6">

          {/* Documents générés */}
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm overflow-hidden">
            <h2 className="font-semibold text-text-primary mb-4">Documents générés</h2>
            {!ao.documents_generes || ao.documents_generes.length === 0 ? (
              <div className="text-center py-4">
                <FileText className="w-8 h-8 text-border mx-auto mb-2" />
                <p className="text-sm text-text-secondary">Aucun document</p>
                {ao.statut !== 'soumis' && (
                  <Link href={`/appels-offres/nouveau`} className="text-primary hover:underline text-xs mt-1 block">
                    Générer des documents
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {ao.documents_generes.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                    <div>
                      <p className="text-xs font-medium text-text-primary">{docLabels[doc.type] || doc.type}</p>
                      <p className="text-xs text-text-secondary">v{doc.version} — {formatDate(doc.genere_le)}</p>
                    </div>
                    <a href={doc.url} download className="text-primary hover:text-primary-hover">
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fichiers sources */}
          {ao.fichiers_source && ao.fichiers_source.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-5 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-text-primary mb-4">Fichiers sources</h2>
              <div className="space-y-2">
                {ao.fichiers_source.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 bg-surface rounded-lg">
                    <FileText className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                    <span className="text-xs text-text-primary truncate flex-1">{f.nom}</span>
                    <span className="text-xs bg-primary-light text-primary px-1.5 py-0.5 rounded">{f.type.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
