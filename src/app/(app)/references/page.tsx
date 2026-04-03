'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Reference } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { Plus, Search, Trash2, Edit, BookMarked, CheckCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const DOMAINES = ['BTP', 'Informatique / IT', 'Conseil', 'Formation', 'Maintenance', 'Nettoyage', 'Sécurité', 'Transport', 'Santé', 'Environnement', 'Autre']

const emptyRef = (): Partial<Reference> => ({
  intitule_marche: '', acheteur_public: '', annee_execution: new Date().getFullYear(),
  montant: undefined, description_prestations: '', domaine: '', lot: '',
  attestation_bonne_execution: false, contact_reference: '', telephone_reference: ''
})

export default function ReferencesPage() {
  const [refs, setRefs] = useState<Reference[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDomaine, setFilterDomaine] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Partial<Reference>>(emptyRef())
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('references').select('*').eq('profile_id', user.id).order('annee_execution', { ascending: false })
    setRefs(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = refs.filter(r =>
    (!search || r.intitule_marche.toLowerCase().includes(search.toLowerCase()) || r.acheteur_public.toLowerCase().includes(search.toLowerCase())) &&
    (!filterDomaine || r.domaine === filterDomaine)
  )

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = { ...editing, profile_id: user.id }
    const { error } = editing.id
      ? await supabase.from('references').update(payload).eq('id', editing.id)
      : await supabase.from('references').insert(payload)
    if (error) toast.error('Erreur lors de la sauvegarde')
    else { toast.success(editing.id ? 'Référence modifiée' : 'Référence ajoutée'); setShowModal(false); load() }
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette référence ?')) return
    await supabase.from('references').delete().eq('id', id)
    setRefs(r => r.filter(x => x.id !== id))
    toast.success('Référence supprimée')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2"><BookMarked className="w-6 h-6 text-primary" /> Références</h1>
          <p className="text-text-secondary mt-1">Vos marchés passés — utilisés pour valoriser vos candidatures</p>
        </div>
        <button onClick={() => { setEditing(emptyRef()); setShowModal(true) }} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Ajouter une référence
        </button>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par intitulé ou acheteur..."
            className="w-full pl-9 pr-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
        </div>
        <select value={filterDomaine} onChange={e => setFilterDomaine(e.target.value)} className="border border-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="">Tous les domaines</option>
          {DOMAINES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {loading ? <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> :
        filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-border">
            <BookMarked className="w-12 h-12 text-border mx-auto mb-3" />
            <p className="text-text-secondary font-medium">Aucune référence trouvée</p>
            <button onClick={() => { setEditing(emptyRef()); setShowModal(true) }} className="text-primary hover:underline text-sm mt-1">Ajouter votre première référence</button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map(ref => (
              <div key={ref.id} className="bg-white rounded-xl border border-border p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-text-primary">{ref.intitule_marche}</h3>
                      {ref.attestation_bonne_execution && <CheckCircle className="w-4 h-4 text-secondary" aria-label="Attestation disponible" />}
                    </div>
                    <p className="text-text-secondary text-sm">{ref.acheteur_public}</p>
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-text-secondary">
                      {ref.annee_execution && <span>{ref.annee_execution}</span>}
                      {ref.montant && <span className="font-medium text-text-primary">{formatCurrency(ref.montant)}</span>}
                      {ref.domaine && <span className="bg-primary-light text-primary px-2 py-0.5 rounded-full font-medium">{ref.domaine}</span>}
                    </div>
                    {ref.description_prestations && <p className="text-sm text-text-secondary mt-2 line-clamp-2">{ref.description_prestations}</p>}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button onClick={() => { setEditing(ref); setShowModal(true) }} className="p-2 text-text-secondary hover:text-primary hover:bg-primary-light rounded-lg transition-colors"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => remove(ref.id)} className="p-2 text-text-secondary hover:text-danger hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      }

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg text-text-primary">{editing.id ? 'Modifier la référence' : 'Nouvelle référence'}</h2>
              <button onClick={() => setShowModal(false)} className="text-text-secondary hover:text-text-primary text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Intitulé du marché *</label>
                  <input value={editing.intitule_marche || ''} onChange={e => setEditing(p => ({ ...p, intitule_marche: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Acheteur public *</label>
                  <input value={editing.acheteur_public || ''} onChange={e => setEditing(p => ({ ...p, acheteur_public: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Année d&apos;exécution</label>
                  <input type="number" value={editing.annee_execution || ''} onChange={e => setEditing(p => ({ ...p, annee_execution: parseInt(e.target.value) }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Montant (€)</label>
                  <input type="number" value={editing.montant || ''} onChange={e => setEditing(p => ({ ...p, montant: parseFloat(e.target.value) }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Domaine</label>
                  <select value={editing.domaine || ''} onChange={e => setEditing(p => ({ ...p, domaine: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="">— Sélectionner —</option>
                    {DOMAINES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Lot</label>
                  <input value={editing.lot || ''} onChange={e => setEditing(p => ({ ...p, lot: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Description des prestations</label>
                  <textarea value={editing.description_prestations || ''} onChange={e => setEditing(p => ({ ...p, description_prestations: e.target.value }))} rows={3} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Contact référence</label>
                  <input value={editing.contact_reference || ''} onChange={e => setEditing(p => ({ ...p, contact_reference: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Téléphone référence</label>
                  <input value={editing.telephone_reference || ''} onChange={e => setEditing(p => ({ ...p, telephone_reference: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!editing.attestation_bonne_execution} onChange={e => setEditing(p => ({ ...p, attestation_bonne_execution: e.target.checked }))} className="accent-primary" />
                <span className="text-sm text-text-primary">Attestation de bonne exécution disponible</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-border rounded-lg text-sm font-medium text-text-secondary hover:bg-surface transition-colors">Annuler</button>
              <button onClick={save} disabled={saving || !editing.intitule_marche || !editing.acheteur_public} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
