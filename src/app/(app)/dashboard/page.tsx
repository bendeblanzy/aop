import { createClient } from '@/lib/supabase/server'
import { formatDate, getStatutColor, getStatutLabel } from '@/lib/utils'
import { FileText, TrendingUp, CheckCircle, Clock, Plus, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: aos }] = await Promise.all([
    supabase.from('profiles').select('raison_sociale, siret').eq('id', user!.id).single(),
    supabase.from('appels_offres').select('*').eq('profile_id', user!.id).order('created_at', { ascending: false }).limit(10),
  ])

  const stats = {
    total: aos?.length ?? 0,
    enCours: aos?.filter(a => ['en_cours', 'analyse'].includes(a.statut)).length ?? 0,
    generes: aos?.filter(a => a.statut === 'genere').length ?? 0,
    soumis: aos?.filter(a => a.statut === 'soumis').length ?? 0,
  }

  const proches = aos?.filter(a => {
    if (!a.date_limite_reponse) return false
    const diff = new Date(a.date_limite_reponse).getTime() - Date.now()
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000
  }) ?? []

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Bonjour, {profile?.raison_sociale ?? 'bienvenue'} 👋</h1>
        <p className="text-text-secondary mt-1">Voici un résumé de votre activité</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
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

      {/* Alertes dates limites */}
      {proches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-text-primary text-sm">Dates limites proches</p>
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

      {/* Liste AO récents */}
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-text-primary">Derniers appels d&apos;offres</h2>
          <Link href="/appels-offres/nouveau" className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            Nouvel AO
          </Link>
        </div>
        {!aos || aos.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-border mx-auto mb-3" />
            <p className="text-text-secondary font-medium">Aucun appel d&apos;offres pour l&apos;instant</p>
            <Link href="/appels-offres/nouveau" className="text-primary hover:underline text-sm mt-1 block">
              Créer votre premier AO
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {aos.map((ao) => (
              <Link key={ao.id} href={`/appels-offres/${ao.id}`} className="flex items-center justify-between px-6 py-4 hover:bg-surface transition-colors">
                <div>
                  <p className="font-medium text-text-primary text-sm">{ao.titre}</p>
                  <p className="text-text-secondary text-xs mt-0.5">
                    {ao.acheteur && `${ao.acheteur} — `}
                    {formatDate(ao.created_at)}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatutColor(ao.statut)}`}>
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
