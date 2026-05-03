'use client'
import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react'

function UpdatePasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const supabase = createClient()
    const code = searchParams.get('code')

    if (code) {
      // PKCE flow : le lien recovery contient ?code=XXX
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (!error) setSessionReady(true)
        else setError('Lien expiré ou invalide. Demandez un nouveau lien.')
      })
    } else {
      // Token hash flow : #access_token=...&type=recovery dans l'URL
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setSessionReady(true)
      })
      // Vérifier si une session recovery est déjà active
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setSessionReady(true)
      })
      return () => subscription.unsubscribe()
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }

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

  if (error && !sessionReady && !done) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <p className="text-danger text-sm mb-4">{error}</p>
          <a href="/auth/reset-password" className="text-primary hover:underline text-sm">Demander un nouveau lien</a>
        </div>
      </div>
    )
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
          {!sessionReady ? (
            <div className="flex items-center justify-center py-8 text-text-secondary text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Vérification du lien…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="8 caractères minimum"
                    required minLength={8}
                  />
                  <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Confirmer le mot de passe</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Répétez le mot de passe"
                    required
                  />
                  <button type="button" onClick={() => setShowConfirm(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary-hover text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer le nouveau mot de passe
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    }>
      <UpdatePasswordForm />
    </Suspense>
  )
}
