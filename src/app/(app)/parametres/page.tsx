'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Settings, Loader2, Save, Lock, User, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

export default function ParametresPage() {
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const forceMode = searchParams.get('force') === '1'

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''))
  }, [])

  async function updatePassword() {
    if (newPassword !== confirmPassword) { toast.error('Les mots de passe ne correspondent pas'); return }
    if (newPassword.length < 8) { toast.error('Le mot de passe doit faire au moins 8 caractères'); return }
    setSavingPwd(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      toast.error(error.message)
      setSavingPwd(false)
      return
    }
    if (forceMode) {
      // Clear le flag d'enforcement en metadata
      const { error: metaError } = await supabase.auth.updateUser({
        data: { force_password_change: false },
      })
      if (metaError) {
        // Le mdp est déjà changé, mais le flag persiste : on le signale clairement
        toast.error(`Mot de passe modifié, mais erreur metadata : ${metaError.message}`)
        setSavingPwd(false)
        return
      }
      toast.success('Mot de passe modifié — bienvenue !')
      setNewPassword('')
      setConfirmPassword('')
      // Refresh côté serveur (cookies/session) puis redirection
      router.refresh()
      router.push('/')
      return
    }
    toast.success('Mot de passe modifié')
    setNewPassword('')
    setConfirmPassword('')
    setSavingPwd(false)
  }

  return (
    <div>
      <div className="mb-6 pb-2 border-b border-border">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2"><Settings className="w-6 h-6 text-primary" /> Paramètres</h1>
        <p className="text-text-secondary mt-1">Gérez votre compte et vos préférences</p>
      </div>

      {forceMode && (
        <div className="max-w-2xl mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-900">Choisissez un nouveau mot de passe pour continuer</p>
            <p className="text-sm text-orange-800 mt-1">
              Votre compte vient d&apos;être créé. Pour des raisons de sécurité, vous devez choisir un mot de passe personnel avant d&apos;accéder à la plateforme.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        {!forceMode && (
          <div className="bg-white rounded-xl border border-border p-6 shadow-sm">
            <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4"><User className="w-4 h-4 text-primary" /> Mon compte</h2>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Adresse email</label>
              <input type="email" value={email} disabled className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-surface text-text-secondary cursor-not-allowed" />
              <p className="text-xs text-text-secondary mt-1">Pour changer votre email, contactez le support</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-border p-6 shadow-sm">
          <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4"><Lock className="w-4 h-4 text-primary" /> Changer le mot de passe</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Nouveau mot de passe</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="8 caractères minimum"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(v => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-text-secondary hover:text-text-primary transition-colors"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Confirmer le mot de passe</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-text-secondary hover:text-text-primary transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button onClick={updatePassword} disabled={savingPwd || !newPassword || !confirmPassword} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
              {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {forceMode ? 'Définir mon mot de passe' : 'Mettre à jour'}
            </button>
          </div>
        </div>

        {!forceMode && (
          <div className="bg-white rounded-xl border border-border p-6 shadow-sm">
            <h2 className="font-semibold text-text-primary mb-2">Plan actuel</h2>
            <div className="flex items-center justify-between">
              <div>
                <span className="inline-block bg-primary-light text-primary px-3 py-1 rounded-full text-sm font-medium">Bêta</span>
                <p className="text-text-secondary text-sm mt-1">Veille complète + scoring IA + favoris — toutes les fonctionnalités sont incluses pendant la bêta.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
