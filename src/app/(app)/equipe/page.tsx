'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/context/OrganizationContext'
import { Collaborateur } from '@/lib/types'
import { Loader2, Plus, Trash2, Edit, Users, UserPlus, Mail, Shield, User, Copy, Check, Building2, FlaskConical, ExternalLink, Sparkles } from 'lucide-react'
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
  email: '', role_metier: '', competences_cles: [], linkedin_url: '', bio: ''
})

// ─── Credential copy helper ──────────────────────────────────────────────────

function CredentialField({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div>
      {label && <p className="text-xs text-text-secondary mb-1">{label}</p>}
      <div className={`flex items-center gap-2 ${compact ? '' : 'bg-gray-50 border border-border rounded-lg px-3 py-2'}`}>
        <code className={`flex-1 ${compact ? 'text-xs text-primary' : 'text-sm text-text-primary'} font-mono select-all`}>{value}</code>
        <button onClick={copy} className="p-1 text-text-secondary hover:text-primary transition-colors" title="Copier">
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

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
  const [inviteType, setInviteType] = useState<'team' | 'beta'>('team')
  const [inviting, setInviting] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; type: string; message: string } | null>(null)

  // ── Collaborateurs state ───────────────────────────────────────────────────
  const [collabs, setCollabs] = useState<Collaborateur[]>([])
  const [collabsLoading, setCollabsLoading] = useState(true)
  const [showCollabModal, setShowCollabModal] = useState(false)
  const [editing, setEditing] = useState<Partial<Collaborateur>>(emptyCollab())
  const [saving, setSaving] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [linkedinLoading, setLinkedinLoading] = useState(false)

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
        body: JSON.stringify({ email: inviteEmail.trim(), type: inviteType }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création du compte')
      }
      setCreatedCredentials({ email: data.email, password: data.password, type: data.type, message: data.message })
      if (inviteType === 'team') loadMembers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la création du compte')
    } finally {
      setInviting(false)
    }
  }

  function closeInviteModal() {
    setShowInviteModal(false)
    setInviteEmail('')
    setInviteType('team')
    setCreatedCredentials(null)
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
      // Vectoriser les collaborateurs en arrière-plan
      fetch('/api/collaborateurs/embed', { method: 'POST' }).catch(() => {})
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

  async function autoCompleteLinkedin() {
    const url = editing.linkedin_url?.trim()
    if (!url || !url.includes('linkedin.com/in/')) {
      toast.error('Veuillez entrer une URL LinkedIn valide (ex: https://www.linkedin.com/in/nom-prenom)')
      return
    }
    setLinkedinLoading(true)
    try {
      const res = await fetch('/api/collaborateurs/linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedin_url: url }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur LinkedIn')
      }
      const data = await res.json()
      // Pré-remplir les champs — l'utilisateur peut modifier ensuite
      setEditing(p => ({
        ...p,
        prenom: data.prenom || p.prenom,
        nom: data.nom || p.nom,
        poste: data.poste || p.poste,
        role_metier: data.role_metier || p.role_metier,
        email: data.email || p.email,
        experience_annees: data.experience_annees || p.experience_annees,
        competences_cles: data.competences_cles?.length > 0 ? data.competences_cles : p.competences_cles,
        bio: data.bio || p.bio,
        linkedin_url: url,
      }))
      toast.success('Profil LinkedIn importé ! Vérifiez et ajustez les informations.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'import LinkedIn')
    } finally {
      setLinkedinLoading(false)
    }
  }

  const isAdmin = role === 'admin'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-[#0000FF]" /> Mon équipe
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Gérez les accès à la plateforme et les profils pour vos réponses</p>
        </div>
      </div>

      {/* Tabs with descriptions */}
      <div className="flex gap-3 mb-4">
        <button
          onClick={() => setTab('membres')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'membres' ? 'bg-[#0000FF] text-white' : 'bg-white border border-[#E0E0F0] text-gray-500 hover:border-[#0000FF]/50'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Membres ({members.length})
        </button>
        <button
          onClick={() => setTab('collaborateurs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'collaborateurs' ? 'bg-[#0000FF] text-white' : 'bg-white border border-[#E0E0F0] text-gray-500 hover:border-[#0000FF]/50'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          Collaborateurs ({collabs.length})
        </button>
      </div>

      {/* Tab explanation + action */}
      <div className="bg-[#F5F5FF] rounded-xl border border-[#0000FF]/10 p-4 mb-6 flex items-start justify-between gap-4">
        {tab === 'membres' ? (
          <>
            <div>
              <h3 className="text-sm font-semibold text-[#0000FF] mb-1">Membres de l&apos;organisation</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Les membres ont un compte sur la plateforme et peuvent se connecter pour rechercher des AO,
                gérer les favoris et contribuer aux réponses. Chaque membre a un rôle (Admin ou Membre).
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors shrink-0"
              >
                <UserPlus className="w-4 h-4" /> Inviter
              </button>
            )}
          </>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold text-[#0000FF] mb-1">Collaborateurs (profils AO)</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Les collaborateurs sont les profils de votre équipe qui peuvent être référencés dans vos réponses aux appels d&apos;offres.
                Renseignez leurs compétences, diplômes et expériences pour enrichir automatiquement vos candidatures.
                Ils n&apos;ont pas besoin d&apos;un compte sur la plateforme.
              </p>
            </div>
            <button
              onClick={() => { setEditing(emptyCollab()); setShowCollabModal(true) }}
              className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" /> Ajouter
            </button>
          </>
        )}
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
              <div className="space-y-3">
                {members.map(m => (
                  <div key={m.id} className="bg-white rounded-xl border border-[#E0E0F0] shadow-sm p-5 flex items-center justify-between cursor-pointer hover:bg-[#F5F5FF] hover:shadow-lg hover:border-[#0000FF]/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#E6E6FF] flex items-center justify-center">
                        {m.role === 'admin' ? <Shield className="w-4 h-4 text-[#0000FF]" /> : <User className="w-4 h-4 text-[#0000FF]" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{m.email}</p>
                          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium ${
                            m.role === 'admin' ? 'bg-[#E6E6FF] text-[#0000FF]' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {m.role === 'admin' ? 'Admin' : 'Membre'}
                          </span>
                          {m.user_id === currentUserId && (
                            <span className="text-xs text-gray-400 italic">c&apos;est vous</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          Depuis le {new Date(m.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    {isAdmin && m.user_id !== currentUserId && (
                      <button
                        onClick={() => removeMember(m.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {collabs.map(c => (
                  <div key={c.id} className="bg-white rounded-xl border border-[#E0E0F0] p-5 shadow-sm hover:bg-[#F5F5FF] hover:shadow-lg hover:border-[#0000FF]/30 cursor-pointer transition-all" onClick={() => { setEditing(c); setShowCollabModal(true) }}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#E6E6FF] flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-[#0000FF]">
                            {(c.prenom?.[0] ?? '').toUpperCase()}{(c.nom?.[0] ?? '').toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{c.prenom} {c.nom}</h3>
                          <p className="text-gray-500 text-sm">
                            {c.poste}{c.experience_annees ? ` — ${c.experience_annees} ans d'exp.` : ''}
                          </p>
                          {c.role_metier && (
                            <span className="inline-block mt-1 text-xs bg-[#E6E6FF] text-[#0000FF] px-2 py-0.5 rounded-full font-medium">{c.role_metier}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); setEditing(c); setShowCollabModal(true) }} className="p-1.5 text-gray-400 hover:text-[#0000FF] hover:bg-[#E6E6FF] rounded-lg transition-colors"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => { e.stopPropagation(); removeCollab(c.id) }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      {c.email && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {c.email}
                        </p>
                      )}
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-[#0077B5] flex items-center gap-1 hover:underline">
                          <ExternalLink className="w-3 h-3" /> LinkedIn
                        </a>
                      )}
                    </div>
                    {(c.competences_cles?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {c.competences_cles!.slice(0, 5).map((k, i) => (
                          <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{k}</span>
                        ))}
                        {(c.competences_cles?.length ?? 0) > 5 && (
                          <span className="text-xs text-gray-400">+{c.competences_cles!.length - 5}</span>
                        )}
                      </div>
                    )}
                    {c.bio && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">{c.bio}</p>
                    )}
                  </div>
                ))}
              </div>
            )
      )}

      {/* ── Modal: Créer un compte ── */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg text-text-primary flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" /> {createdCredentials ? 'Compte créé !' : 'Créer un accès'}
              </h2>
              <button onClick={closeInviteModal} className="text-text-secondary hover:text-text-primary text-xl">✕</button>
            </div>

            {createdCredentials ? (
              /* ── Résultat : identifiants à copier ── */
              <div className="p-6">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                  <p className="text-sm text-green-800 font-medium mb-1">{createdCredentials.message}</p>
                  <p className="text-xs text-green-600">
                    {createdCredentials.type === 'team' ? 'Le membre peut se connecter immédiatement.' : 'Le testeur créera sa propre organisation à la première connexion.'}
                  </p>
                </div>
                <div className="space-y-3">
                  <CredentialField label="Identifiant (email)" value={createdCredentials.email} />
                  <CredentialField label="Mot de passe" value={createdCredentials.password} />
                  <div className="bg-gray-50 border border-border rounded-lg p-3">
                    <p className="text-xs text-text-secondary">URL de connexion :</p>
                    <CredentialField label="" value="https://aop-woad.vercel.app/auth/login" compact />
                  </div>
                </div>
                <div className="flex justify-end mt-5">
                  <button onClick={closeInviteModal} className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors">
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              /* ── Formulaire : email + type ── */
              <div className="p-6">
                <label className="block text-sm font-medium text-text-primary mb-1.5">Adresse e-mail</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && inviteEmail.trim()) invite() }}
                  placeholder="collaborateur@exemple.fr"
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  autoFocus
                />

                <p className="block text-sm font-medium text-text-primary mt-4 mb-2">Type d&apos;accès</p>
                <div className="space-y-2">
                  <label
                    className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                      inviteType === 'team' ? 'border-primary bg-primary-light' : 'border-border hover:bg-surface'
                    }`}
                  >
                    <input type="radio" name="inviteType" checked={inviteType === 'team'} onChange={() => setInviteType('team')} className="mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                        <Building2 className="w-4 h-4 text-primary" /> Membre de mon équipe
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5">Rejoint votre organisation et accède à vos appels d&apos;offres</p>
                    </div>
                  </label>
                  <label
                    className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                      inviteType === 'beta' ? 'border-primary bg-primary-light' : 'border-border hover:bg-surface'
                    }`}
                  >
                    <input type="radio" name="inviteType" checked={inviteType === 'beta'} onChange={() => setInviteType('beta')} className="mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                        <FlaskConical className="w-4 h-4 text-orange-500" /> Prospect / Bêta-testeur
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5">Créera sa propre organisation à la première connexion</p>
                    </div>
                  </label>
                </div>

                <div className="flex justify-end gap-3 mt-5">
                  <button onClick={closeInviteModal} className="px-5 py-2.5 border border-border rounded-lg text-sm font-medium text-text-secondary hover:bg-surface transition-colors">Annuler</button>
                  <button onClick={invite} disabled={inviting || !inviteEmail.trim()} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
                    {inviting && <Loader2 className="w-4 h-4 animate-spin" />} Créer le compte
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Collaborateur ── */}
      {showCollabModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg text-text-primary">{editing.id ? 'Modifier' : 'Nouveau collaborateur'}</h2>
              <button onClick={() => setShowCollabModal(false)} className="text-text-secondary hover:text-text-primary text-xl">✕</button>
            </div>
            <div className="p-6 space-y-5">
              {/* LinkedIn auto-complétion */}
              <div className="bg-[#F5F5FF] rounded-xl border border-[#0000FF]/10 p-4">
                <label className="block text-sm font-medium text-[#0000FF] mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> Profil LinkedIn <span className="text-xs font-normal text-gray-400">(optionnel)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    value={editing.linkedin_url || ''}
                    onChange={e => setEditing(p => ({ ...p, linkedin_url: e.target.value }))}
                    placeholder="https://www.linkedin.com/in/prenom-nom"
                    className="flex-1 border border-[#0000FF]/20 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0000FF]/20 focus:border-[#0000FF] bg-white"
                  />
                  <button
                    onClick={autoCompleteLinkedin}
                    disabled={linkedinLoading || !editing.linkedin_url?.includes('linkedin.com/in/')}
                    className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 shrink-0"
                  >
                    {linkedinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Auto-compléter
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">Remplissez l&apos;URL LinkedIn puis cliquez pour pré-remplir automatiquement les champs ci-dessous. Tout reste modifiable.</p>
              </div>

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

              {/* Bio — description de la personne */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Présentation</label>
                <textarea
                  value={editing.bio || ''}
                  onChange={e => setEditing(p => ({ ...p, bio: e.target.value }))}
                  rows={4}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="Quelques phrases décrivant le parcours et l'expertise de cette personne. Ce texte sera utilisé dans les réponses aux appels d'offres."
                />
                <p className="text-xs text-text-secondary mt-1">
                  {(editing.bio || '').length} caractères — auto-généré depuis LinkedIn si disponible, modifiable librement
                </p>
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
