'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settings, Loader2, Save, Lock, User } from 'lucide-react'
import { toast } from 'sonner'

export default function ParametresPage() {
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''))
  }, [])

  async function updatePassword() {
    if (newPassword !== confirmPassword) { toast.error('Les mots de passe ne correspondent pas'); return }
    setSavingPwd(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) toast.error(error.message)
    else { toast.success('Mot de passe modifié'); setNewPassword(''); setConfirmPassword('') }
    setSavingPwd(false)
  }

  return (
    <div>
      <div className="mb-6 pb-2 border-b border-border">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2"><Settings className="w-6 h-6 text-primary" /> Paramètres</h1>
        <p className="text-text-secondary mt-1">Gérez votre compte et vos préférences</p>
      </div>
      <div className="max-w-2xl space-y-6">
        <div className="bg-white rounded-xl border border-border p-6 shadow-sm">
          <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4"><User className="w-4 h-4 text-primary" /> Mon compte</h2>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Adresse email</label>
            <input type="email" value={email} disabled className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-surface text-text-secondary cursor-not-allowed" />
            <p className="text-xs text-text-secondary mt-1">Pour changer votre email, contactez le support</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-border p-6 shadow-sm">
          <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4"><Lock className="w-4 h-4 text-primary" /> Changer le mot de passe</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Nouveau mot de passe</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="8 caractères minimum" minLength={8} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Confirmer le mot de passe</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
            <button onClick={updatePassword} disabled={savingPwd || !newPassword || !confirmPassword} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
              {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Mettre à jour
            </button>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-border p-6 shadow-sm">
          <h2 className="font-semibold text-text-primary mb-2">Plan actuel</h2>
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-block bg-primary-light text-primary px-3 py-1 rounded-full text-sm font-medium">Gratuit</span>
              <p className="text-text-secondary text-sm mt-1">5 appels d&apos;offres / mois — Accès à tous les formulaires</p>
            </div>
            <button className="border border-primary text-primary hover:bg-primary-light rounded-lg px-4 py-2 text-sm font-medium transition-colors">Passer Pro</button>
          </div>
        </div>
      </div>
    </div>
  )
}
