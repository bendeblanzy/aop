'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { FileText, Loader2, CheckCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aop-woad.vercel.app'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/callback?next=/parametres`,
    })
    if (resetError) {
      console.error('[reset-password]', resetError.message)
      setError(resetError.message === 'For security purposes, you can only request this once every 60 seconds'
        ? 'Veuillez patienter 60 secondes avant de réessayer.'
        : `Erreur : ${resetError.message}`)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-secondary mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-text-primary mb-2">Email envoyé !</h2>
          <p className="text-text-secondary">Vérifiez votre boîte mail pour réinitialiser votre mot de passe.</p>
          <Link href="/auth/login" className="text-primary hover:underline mt-4 block">Retour à la connexion</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-2xl text-primary">AOP</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Mot de passe oublié</h1>
          <p className="text-text-secondary mt-1">Entrez votre email pour recevoir un lien de réinitialisation</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary-hover text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Envoyer le lien
            </button>
          </form>
          <p className="text-center text-sm text-text-secondary mt-6">
            <Link href="/auth/login" className="text-primary hover:underline">Retour à la connexion</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
