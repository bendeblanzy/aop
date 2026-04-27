'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function handleInvite() {
      const code = searchParams.get('code')

      if (code) {
        try {
          const supabase = createClient()
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            setErrorMessage(error.message)
            setStatus('error')
            return
          }

          // Pour les collaborateurs invités, l'onboarding de l'org est déjà fait
          // On marque directement le flag pour ne pas leur afficher l'onboarding
          await fetch('/api/onboarding/skip', { method: 'POST' })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Erreur inconnue'
          setErrorMessage(message)
          setStatus('error')
          return
        }
      }

      setStatus('success')

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard')
      }, 1500)
    }

    handleInvite()
  }, [searchParams, router])

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-4">
            <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Erreur lors de l&apos;invitation
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {errorMessage ?? 'Le lien d\'invitation est invalide ou a expiré.'}
          </p>
          <button
            onClick={() => router.push('/auth/login')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Aller à la connexion
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-4">
          {status === 'success' ? (
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-7 h-7 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {status === 'success' ? 'Invitation acceptée !' : 'Traitement en cours…'}
        </h1>
        <p className="text-sm text-gray-500">
          {status === 'success'
            ? 'Redirection vers le tableau de bord…'
            : 'Veuillez patienter quelques instants.'}
        </p>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-sm text-gray-500">Chargement…</div>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  )
}
