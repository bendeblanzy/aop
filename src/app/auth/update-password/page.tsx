'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2, CheckCircle } from 'lucide-react'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(`Erreur : ${updateError.message}`)
    } else {
      setDone(true)
      setTimeout(() => router.push('/dashboard'), 2500)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-secondary mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-text-primary mb-2">Mot de passe mis à jour !</h2>
          <p className="text-text-secondary">Vous allez être redirigé vers votre tableau de bord…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <Image src="/logo-ladn.svg" alt="L'ADN DATA" width={180} height={64} priority />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Nouveau mot de passe</h1>
          <p className="text-text-secondary mt-1">Choisissez un nouveau mot de passe sécurisé</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="8 caractères minimum"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="Répétez le mot de passe"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-hover text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer le nouveau mot de passe
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
