'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/context/OrganizationContext'
import { Collaborateur } from '@/lib/types'
import { Loader2, Plus, Trash2, Edit, Users, UserPlus, Mail, Shield, User } from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = {
  id: string
  user_id: string
  email: string
  role: 'admin' | 'member'
  created_at: string
}

// ─── Collaborateur helpers ────────────────────────────────────────────────────

const emptyCollab = (): Partial<Collaborateur> => ({
  nom: '', prenom: '', poste: '', experience_annees: undefined,
  email: '', role_metier: '', competences_cles: []
})

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EquipePage() {
  const { orgId, role } = useOrganization()
  const [tab, setTab] = useState<'membres' | 'collaborateurs'>('membres')
  const supabase = createClient()

  // ── Membres state ──────────────────────────────────────────────────────────
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  // ── Collaborateurs state ───────────────────────────────────────────────────
  const [collabs, setCollabs] = useState<Collaborateur[]>([])
  const [collabsLoading, setCollabsLoading] = useState(true)
  const [showCollabModal, setShowCollabModal] = useState(false)
  const [editing, setEditing] = useState<Partial<Collaborateur>>(emptyCollab())
  const [saving, setSaving] = useState(false)
  const [newTag, setNewTag] = useState('')

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
    loadMembers()
  }, [])

  useEffect(() => {
    if (orgId) loadCollabs()
  }, [orgId])

  // ── Members ────────────────────────────────────────────────────────────────

  async function loadMembers() {
    setMembersLoading(true)
    try {
      const res = await fetch('/api/organizations/members')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMembers(data)
    } catch {
      toast.error('Impossible de charger les membres')
    } finally {
      setMembersLoading(false)
    }
  }

  async function invite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch('/api/organizations/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Erreur lors de l\'invitation')
      }
      toast.success(`Invitation envoyée à ${inviteEmail.trim()}`)
      setInviteEmail('')
      setShowInviteModal(false)
      loadMembers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'invitation')
    } finally {
      setInviting(false)
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm('Retirer ce membre de l\'organisation ?')) return
    try {
      const res = await fetch('/api/organizations/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId }),
      })
      if (!res.ok) throw new Error()
      setMembers(m => m.filter(x => x.id !== memberId))
      toast.success('Membre retiré')
    } catch {
      toast.error('Impossible de retirer ce membre')
    }
  }

  // ── Collaborateurs ─────────────────────────────────────────────────────────

  async function loadCollabs() {
    const { data } = await supabase.from('collaborateurs').select('*').order('created_at', { ascending: false })
    setCollabs(data || [])
    setCollabsLoading(false)
  }

  async function saveCollab() {
    setSaving(true)
    const payload = { ...editing, organization_id: orgId }
    const { error } = editing.id
      ? await supabase.from('collaborateurs').update(payload).eq('id', editing.id)
      : await supabase.from('collaborateurs').insert(payload)
    if (error) toast.error('Erreur lors de la sauvegarde')
    else {
      toast.success(editing.id ? 'Collaborateur modifié' : 'Collaborateur ajouté')
      setShowCollabModal(false)
      loadCollabs()
    }
    setSaving(false)
  }

  async function removeCollab(id: string) {
    if (!confirm('Supprimer ce collaborateur ?')) return
    await supabase.from('collaborateurs').delete().eq('id', id)
    setCollabs(c => c.filter(x => x.id !== id))
    toast.success('Collaborateur supprimé')
  }

  function addTag(val: string) {
    const trimmed = val.trim()
    if (!trimmed) return
    setEditing(p => ({ ...p, competences_cles: [...((p.competences_cles as string[]) || []), trimmed] }))
    setNewTag('')
  }

  function removeTag(i: number) {
    setEditing(p => ({ ...p, competences_cles: ((p.competences_cles as string[]) || []).filter((_, j) => j !== i) }))
  }

  const isAdmin = role === 'admin'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Équipe
          </h1>
          <p className="text-text-secondary mt-1">Gérez les membres de votre organisation et vos collaborateurs</p>
        </div>
        {tab === 'membres' && isAdmin && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Inviter un membre
          </button>
        )}
        {tab === 'collaborateurs' && (
          <button
            onClick={() => { setEditing(emptyCollab()); setShowCollabModal(true) }}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Ajouter un collaborateur
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-border mb-6">
        <button
          onClick={() => setTab('membres')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'membres' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Membres
        </button>
        <button
          onClick={() => setTab('collaborateurs')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'collaborateurs' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Collaborateurs
        </button>
      </div>

      {/* ── Tab: Membres ── */}
      {tab === 'membres' && (
        membersLoading
          ? <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          : members.length === 0
            ? (
              <div className="text-center py-16 bg-white rounded-xl border border-border">
                <Users className="w-12 h-12 text-border mx-auto mb-3" />
                <p className="text-text-secondary font-medium">Aucun membre trouvé</p>
                {isAdmin && (
                  <button onClick={() => setShowInviteModal(true)} className="text-primary hover:underline text-sm mt-1">
                    Inviter le premier membre
                  </button>
                )}
              </div>
            )
            : (
              <div className="bg-white rounded-xl border border-border divide-y divide-border">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-text-primary">{m.email}</p>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            m.role === 'admin' ? 'bg-primary-light text-primary' : 'bg-gray-100 text-text-secondary'
                          }`}>
                            {m.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                            {m.role === 'admin' ? 'Admin' : 'Membre'}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          Membre depuis le {new Date(m.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    {isAdmin && m.user_id !== currentUserId && (
                      <button
                        onClick={() => removeMember(m.id)}
                        className="p-2 text-text-secondary hover:text-danger hover:bg-red-50 rounded-lg transition-colors"
                        title="Retirer ce membre"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
      )}

      {/* ── Tab: Collaborateurs ── */}
      {tab === 'collaborateurs' && (
        collabsLoading
          ? <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          : collabs.length === 0
            ? (
              <div className="text-center py-16 bg-white rounded-xl border border-border">
                <Users className="w-12 h-12 text-border mx-auto mb-3" />
                <p className="text-text-secondary font-medium">Aucun collaborateur pour l&apos;instant</p>
                <button onClick={() => { setEditing(emptyCollab()); setShowCollabModal(true) }} className="text-primary hover:underline text-sm mt-1">
                  Ajouter votre premier collaborateur
                </button>
              </div>
            )
            : (
              <div className="grid grid-cols-2 gap-4">
                {collabs.map(c => (
                  <div key={c.id} className="bg-white rounded-xl border border-border p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-text-primary">{c.prenom} {c.nom}</h3>
                        <p className="text-text-secondary text-sm">
                          {c.poste}{c.experience_annees ? ` — ${c.experience_annees} ans` : ''}
                        </p>
                        {c.role_metier && <p className="text-xs text-text-secondary mt-0.5">{c.role_metier}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(c); setShowCollabModal(true) }} className="p-1.5 text-text-secondary hover:text-primary hover:bg-primary-light rounded-lg"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => removeCollab(c.id)} className="p-1.5 text-text-secondary hover:text-danger hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {(c.competences_cles?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {c.competences_cles!.slice(0, 4).map((k, i) => (
                          <span key={i} className="bg-primary-light text-primary text-xs px-2 py-0.5 rounded-full font-medium">{k}</span>
                        ))}
                        {(c.competences_cles?.length ?? 0) > 4 && (
                          <span className="text-xs text-text-secondary">+{c.competences_cles!.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
      )}

      {/* ── Modal: Inviter un membre ── */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg text-text-primary flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" /> Inviter un membre
              </h2>
              <button onClick={() => setShowInviteModal(false)} className="text-text-secondary hover:text-text-primary text-xl">✕</button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-text-primary mb-1.5">Adresse e-mail</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') invite() }}
                placeholder="collaborateur@exemple.fr"
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                autoFocus
              />
              <p className="text-xs text-text-secondary mt-2">Un e-mail d&apos;invitation sera envoyé à cette adresse.</p>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setShowInviteModal(false)} className="px-5 py-2.5 border border-border rounded-lg text-sm font-medium text-text-secondary hover:bg-surface transition-colors">Annuler</button>
              <button onClick={invite} disabled={inviting || !inviteEmail.trim()} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
                {inviting && <Loader2 className="w-4 h-4 animate-spin" />} Envoyer l&apos;invitation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Collaborateur ── */}
      {showCollabModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg text-text-primary">{editing.id ? 'Modifier' : 'Nouveau collaborateur'}</h2>
              <button onClick={() => setShowCollabModal(false)} className="text-text-secondary hover:text-text-primary text-xl">✕</button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                {([['prenom', 'Prénom *'], ['nom', 'Nom *'], ['poste', 'Poste / Fonction'], ['role_metier', 'Rôle métier']] as [string, string][]).map(([f, l]) => (
                  <div key={f}>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">{l}</label>
                    <input
                      value={(editing as Record<string, string>)[f] || ''}
                      onChange={e => setEditing(p => ({ ...p, [f]: e.target.value }))}
                      className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Email</label>
                  <input
                    type="email"
                    value={editing.email || ''}
                    onChange={e => setEditing(p => ({ ...p, email: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Années d&apos;expérience</label>
                  <input
                    type="number"
                    value={editing.experience_annees || ''}
                    onChange={e => setEditing(p => ({ ...p, experience_annees: parseInt(e.target.value) || undefined }))}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              {/* Compétences clés */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Compétences clés</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {((editing.competences_cles as string[]) || []).map((v, i) => (
                    <span key={i} className="flex items-center gap-1 bg-primary-light text-primary px-2 py-0.5 rounded-full text-xs font-medium">
                      {v}<button onClick={() => removeTag(i)}>✕</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(newTag) } }}
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Ajouter et Entrée..."
                  />
                  <button onClick={() => addTag(newTag)} className="bg-primary text-white rounded-lg px-3 py-2 text-sm"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setShowCollabModal(false)} className="px-5 py-2.5 border border-border rounded-lg text-sm font-medium text-text-secondary hover:bg-surface">Annuler</button>
              <button onClick={saveCollab} disabled={saving || !editing.nom || !editing.prenom} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
