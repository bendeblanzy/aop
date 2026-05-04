'use client'

import { useState, useEffect } from 'react'
import { Bug, X, Send, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

/**
 * Bouton flottant bas-droite "Signaler un bug".
 * Visible uniquement pour les utilisateurs authentifiés.
 * Ouvre une modal avec description, sévérité, et envoie au backend.
 */
export function BugReportButton() {
  const [open, setOpen] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [email, setEmail] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(!!data.user)
      setEmail(data.user?.email ?? '')
    })
  }, [])

  if (!authed) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Signaler un bug"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-[#0000FF] shadow-lg rounded-full px-4 py-3 text-sm font-medium text-gray-700 hover:text-[#0000FF] transition-all"
      >
        <Bug className="w-4 h-4" />
        Signaler un bug
      </button>

      {open && (
        <BugReportModal
          email={email}
          onClose={() => setOpen(false)}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
      )}
    </>
  )
}

interface ModalProps {
  email: string
  onClose: () => void
  submitting: boolean
  setSubmitting: (v: boolean) => void
}

function BugReportModal({ email, onClose, submitting, setSubmitting }: ModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')

  async function submit() {
    if (!description.trim()) {
      toast.error('Décris brièvement ce qui ne fonctionne pas.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          description: description.trim(),
          severity,
          url: typeof window !== 'undefined' ? window.location.href : null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          metadata: typeof window !== 'undefined' ? {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            timestamp_client: new Date().toISOString(),
          } : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success('Bug signalé — merci ! On regarde ça vite.')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Bug className="w-4 h-4 text-[#0000FF]" />
            Signaler un bug
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Titre (optionnel)</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: La recherche SIRET ne renvoie rien"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0000FF]/20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Décris ce que tu faisais, ce que tu attendais, et ce qui s'est passé. Plus c'est détaillé, plus on peut corriger vite."
              rows={5}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0000FF]/20 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Sévérité</label>
            <div className="flex gap-2">
              {([
                { v: 'low' as const, label: 'Mineur', color: 'gray' },
                { v: 'medium' as const, label: 'Moyen', color: 'blue' },
                { v: 'high' as const, label: 'Important', color: 'amber' },
                { v: 'critical' as const, label: 'Bloquant', color: 'red' },
              ]).map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setSeverity(opt.v)}
                  className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                    severity === opt.v
                      ? 'border-[#0000FF] bg-[#E6E6FF] text-[#0000FF]'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            On joindra automatiquement : ton email (<code className="font-mono">{email}</code>),
            l'URL courante et la version de ton navigateur.
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={submitting || !description.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#0000FF] text-white hover:bg-[#0000CC] disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Envoi…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Envoyer
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}
