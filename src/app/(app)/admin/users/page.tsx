'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users, UserPlus, Building2, Search, Loader2,
  Shield, User, Copy, Check, FlaskConical, Trash2,
  ArrowRight, Mail, Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  email: string
  created_at: string
  org_id: string | null
  org_name: string | null
  role: 'admin' | 'member' | null
}

interface Org {
  id: string
  name: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(email: string) {
  return email.slice(0, 2).toUpperCase()
}

function CredentialField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <code className="flex-1 text-sm text-gray-900 font-mono select-all">{value}</code>
        <button onClick={copy} className="p-1 text-gray-400 hover:text-[#0000FF] transition-colors">
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal création
  const [showModal, setShowModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newType, setNewType] = useState<'team' | 'beta'>('beta')
  const [newOrgId, setNewOrgId] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ email: string; password: string; message: string } | null>(null)

  // Chargement initial
  // Bug #18 : sur 403, on affichait silencieusement /dashboard. Désormais on
  // garde l'utilisateur sur la page avec un message explicite, plutôt que de
  // l'éjecter sans explication.
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch('/api/admin/users')
      if (res.status === 403) {
        setForbidden(true)
        setLoading(false)
        return
      }
      if (!res.ok) {
        toast.error('Impossible de charger les utilisateurs')
        setLoading(false)
        return
      }
      const data = await res.json()
      setUsers(data.users ?? [])
      setOrgs(data.orgs ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  async function createUser() {
    if (!newEmail.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          type: newType,
          org_id: newType === 'team' && newOrgId ? newOrgId : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setCreated({ email: data.email, password: data.password, message: data.message })
      // Recharger la liste
      const listRes = await fetch('/api/admin/users')
      if (listRes.ok) {
        const listData = await listRes.json()
        setUsers(listData.users ?? [])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm(`Supprimer définitivement le compte de ${email} ?`)) return
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error)
      }
      setUsers(u => u.filter(x => x.id !== userId))
      toast.success(`Compte ${email} supprimé`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
  }

  function closeModal() {
    setShowModal(false)
    setNewEmail('')
    setNewType('beta')
    setNewOrgId('')
    setCreated(null)
  }

  // Filtrage
  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q
      || u.email.toLowerCase().includes(q)
      || (u.org_name ?? '').toLowerCase().includes(q)
  })

  // Stats
  const totalOrgs = new Set(users.map(u => u.org_id).filter(Boolean)).size
  const totalBeta = users.filter(u => !u.org_id).length

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Shield className="w-16 h-16 text-border mb-6" />
        <h1 className="text-2xl font-bold text-text-primary mb-2">Accès réservé</h1>
        <p className="text-text-secondary text-sm mb-8 text-center max-w-md">
          Cette page est réservée au super-administrateur de la plateforme. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez l&apos;équipe.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          Retour au tableau de bord
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-[#0000FF]" />
            Gestion des utilisateurs
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Tous les comptes enregistrés sur la plateforme</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Créer un compte
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Utilisateurs total', value: users.length, icon: Users, color: 'text-[#0000FF]', bg: 'bg-[#E6E6FF]' },
          { label: 'Organisations', value: totalOrgs, icon: Building2, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Bêta sans org', value: totalBeta, icon: FlaskConical, color: 'text-orange-500', bg: 'bg-orange-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E0E0F0] p-4 flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', s.bg)}>
              <s.icon className={cn('w-5 h-5', s.color)} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recherche */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par email ou organisation…"
          className="w-full pl-9 pr-4 py-2.5 border border-[#E0E0F0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0000FF]/20 focus:border-[#0000FF] bg-white"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#0000FF]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#E0E0F0]">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">Aucun utilisateur trouvé</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E0E0F0] overflow-hidden">
          {/* En-têtes */}
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-[#E0E0F0] text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Utilisateur</span>
            <span>Organisation</span>
            <span>Inscription</span>
            <span>Rôle</span>
            <span></span>
          </div>

          {/* Lignes */}
          <div className="divide-y divide-[#E0E0F0]">
            {filtered.map(u => (
              <div key={u.id} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 px-5 py-3.5 items-center hover:bg-[#F5F5FF] transition-colors">
                {/* Email */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#E6E6FF] flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-[#0000FF]">{initials(u.email)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                      <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                      {u.email}
                    </p>
                  </div>
                </div>

                {/* Organisation */}
                <div className="min-w-0">
                  {u.org_name ? (
                    <span className="flex items-center gap-1.5 text-sm text-gray-700 truncate">
                      <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      {u.org_name}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 italic flex items-center gap-1">
                      <FlaskConical className="w-3 h-3 text-orange-400" />
                      Sans organisation
                    </span>
                  )}
                </div>

                {/* Date */}
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="w-3 h-3 shrink-0" />
                  {new Date(u.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                </div>

                {/* Rôle */}
                <div>
                  {u.role ? (
                    <span className={cn(
                      'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
                      u.role === 'admin'
                        ? 'bg-[#E6E6FF] text-[#0000FF]'
                        : 'bg-gray-100 text-gray-500',
                    )}>
                      {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {u.role === 'admin' ? 'Admin' : 'Membre'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-500">
                      <FlaskConical className="w-3 h-3" /> Bêta
                    </span>
                  )}
                </div>

                {/* Actions */}
                <button
                  onClick={() => deleteUser(u.id, u.email)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Supprimer ce compte"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compteur */}
      {!loading && (
        <p className="text-xs text-gray-400 mt-3 text-right">
          {filtered.length} utilisateur{filtered.length > 1 ? 's' : ''}{search ? ` sur ${users.length}` : ''}
        </p>
      )}

      {/* ── Modal création ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-[#E0E0F0]">
              <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#0000FF]" />
                {created ? 'Compte créé !' : 'Créer un compte'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {created ? (
              /* Résultat */
              <div className="p-6">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
                  <p className="text-sm text-green-800 font-medium">{created.message}</p>
                </div>
                <div className="space-y-3">
                  <CredentialField label="Email" value={created.email} />
                  <CredentialField label="Mot de passe" value={created.password} />
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400 mb-1">URL de connexion</p>
                    <code className="text-xs text-gray-600 select-all">https://aop-woad.vercel.app/auth/login</code>
                  </div>
                </div>
                <div className="flex justify-end mt-5">
                  <button onClick={closeModal} className="px-5 py-2.5 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg text-sm font-medium transition-colors">
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              /* Formulaire */
              <div className="p-6 space-y-5">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">Adresse email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newEmail.trim()) createUser() }}
                    placeholder="client@entreprise.fr"
                    className="w-full border border-[#E0E0F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0000FF]/20 focus:border-[#0000FF]"
                    autoFocus
                  />
                </div>

                {/* Type */}
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-2">Type d&apos;accès</p>
                  <div className="space-y-2">
                    {([
                      { value: 'beta', icon: FlaskConical, color: 'text-orange-500', label: 'Prospect / Bêta-testeur', desc: "Créera sa propre organisation à la première connexion" },
                      { value: 'team', icon: Building2, color: 'text-[#0000FF]', label: 'Membre d\'une organisation', desc: "Rattaché directement à une organisation existante" },
                    ] as const).map(opt => (
                      <label
                        key={opt.value}
                        className={cn(
                          'flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors',
                          newType === opt.value
                            ? 'border-[#0000FF] bg-[#F5F5FF]'
                            : 'border-[#E0E0F0] hover:bg-gray-50',
                        )}
                      >
                        <input type="radio" name="type" checked={newType === opt.value} onChange={() => setNewType(opt.value)} className="mt-0.5" />
                        <div>
                          <div className={cn('flex items-center gap-2 text-sm font-medium text-gray-900')}>
                            <opt.icon className={cn('w-4 h-4', opt.color)} />
                            {opt.label}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Org select (seulement si type = team) */}
                {newType === 'team' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1.5">
                      Organisation <span className="text-gray-400 font-normal">(optionnel)</span>
                    </label>
                    <select
                      value={newOrgId}
                      onChange={e => setNewOrgId(e.target.value)}
                      className="w-full border border-[#E0E0F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0000FF]/20 focus:border-[#0000FF] bg-white"
                    >
                      <option value="">— Sélectionner une organisation —</option>
                      {orgs.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={closeModal} className="px-5 py-2.5 border border-[#E0E0F0] rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                    Annuler
                  </button>
                  <button
                    onClick={createUser}
                    disabled={creating || !newEmail.trim()}
                    className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Créer le compte
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
