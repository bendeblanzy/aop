'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Collaborateur } from '@/lib/types'
import { Plus, Trash2, Edit, Users, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const empty = (): Partial<Collaborateur> => ({
  nom: '', prenom: '', poste: '', experience_annees: undefined,
  diplomes: [], certifications: [], competences_cles: []
})

export default function EquipePage() {
  const [collabs, setCollabs] = useState<Collaborateur[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Partial<Collaborateur>>(empty())
  const [saving, setSaving] = useState(false)
  const [newTag, setNewTag] = useState<Record<string, string>>({ diplomes: '', certifications: '', competences_cles: '' })
  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('collaborateurs').select('*').eq('profile_id', user.id).order('created_at', { ascending: false })
    setCollabs(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = { ...editing, profile_id: user.id }
    const { error } = editing.id
      ? await supabase.from('collaborateurs').update(payload).eq('id', editing.id)
      : await supabase.from('collaborateurs').insert(payload)
    if (error) toast.error('Erreur lors de la sauvegarde')
    else { toast.success(editing.id ? 'Collaborateur modifié' : 'Collaborateur ajouté'); setShowModal(false); load() }
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce collaborateur ?')) return
    await supabase.from('collaborateurs').delete().eq('id', id)
    setCollabs(c => c.filter(x => x.id !== id))
    toast.success('Collaborateur supprimé')
  }

  function addTag(field: 'diplomes' | 'certifications' | 'competences_cles') {
    const val = newTag[field].trim()
    if (!val) return
    setEditing(p => ({ ...p, [field]: [...((p[field] as string[]) || []), val] }))
    setNewTag(t => ({ ...t, [field]: '' }))
  }
  function removeTag(field: 'diplomes' | 'certifications' | 'competences_cles', i: number) {
    setEditing(p => ({ ...p, [field]: ((p[field] as string[]) || []).filter((_, j) => j !== i) }))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Équipe</h1>
          <p className="text-text-secondary mt-1">Vos collaborateurs — utilisés dans les mémoires techniques</p>
        </div>
        <button onClick={() => { setEditing(empty()); setShowModal(true) }} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Ajouter un collaborateur
        </button>
      </div>

      {loading ? <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> :
        collabs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-border">
            <Users className="w-12 h-12 text-border mx-auto mb-3" />
            <p className="text-text-secondary font-medium">Aucun collaborateur pour l&apos;instant</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {collabs.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-border p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-text-primary">{c.prenom} {c.nom}</h3>
                    <p className="text-text-secondary text-sm">{c.poste}{c.experience_annees ? ` — ${c.experience_annees} ans` : ''}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(c); setShowModal(true) }} className="p-1.5 text-text-secondary hover:text-primary hover:bg-primary-light rounded-lg"><Edit className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(c.id)} className="p-1.5 text-text-secondary hover:text-danger hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {(c.competences_cles?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {c.competences_cles!.slice(0, 4).map((k, i) => (
                      <span key={i} className="bg-primary-light text-primary text-xs px-2 py-0.5 rounded-full font-medium">{k}</span>
                    ))}
                    {(c.competences_cles?.length ?? 0) > 4 && <span className="text-xs text-text-secondary">+{c.competences_cles!.length - 4}</span>}
                  </div>
                )}
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
              <h2 className="font-bold text-lg text-text-primary">{editing.id ? 'Modifier' : 'Nouveau collaborateur'}</h2>
              <button onClick={() => setShowModal(false)} className="text-text-secondary hover:text-text-primary text-xl">✕</button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                {[['prenom', 'Prénom *'], ['nom', 'Nom *'], ['poste', 'Poste / Fonction']].map(([f, l]) => (
                  <div key={f}>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">{l}</label>
                    <input value={(editing as Record<string, string>)[f] || ''} onChange={e => setEditing(p => ({ ...p, [f]: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Années d&apos;expérience</label>
                  <input type="number" value={editing.experience_annees || ''} onChange={e => setEditing(p => ({ ...p, experience_annees: parseInt(e.target.value) || undefined }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
              </div>
              {(['diplomes', 'certifications', 'competences_cles'] as const).map(field => (
                <div key={field}>
                  <label className="block text-sm font-medium text-text-primary mb-2">{field === 'diplomes' ? 'Diplômes' : field === 'certifications' ? 'Certifications' : 'Compétences clés'}</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(((editing[field] as string[]) || [])).map((v, i) => (
                      <span key={i} className="flex items-center gap-1 bg-primary-light text-primary px-2 py-0.5 rounded-full text-xs font-medium">
                        {v}<button onClick={() => removeTag(field, i)}>✕</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={newTag[field]} onChange={e => setNewTag(t => ({ ...t, [field]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(field) } }}
                      className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="Ajouter et Entrée..." />
                    <button onClick={() => addTag(field)} className="bg-primary text-white rounded-lg px-3 py-2 text-sm"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-border rounded-lg text-sm font-medium text-text-secondary hover:bg-surface">Annuler</button>
              <button onClick={save} disabled={saving || !editing.nom || !editing.prenom} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
