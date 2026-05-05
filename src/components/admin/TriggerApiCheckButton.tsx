'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function TriggerApiCheckButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [triggering, setTriggering] = useState(false)

  async function trigger() {
    setTriggering(true)
    try {
      const res = await fetch('/api/admin/monitoring/trigger-api-check', {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success('Check API lancé — données rafraîchies dans quelques secondes.')
      setTimeout(() => startTransition(() => router.refresh()), 3000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setTriggering(false)
    }
  }

  return (
    <button
      onClick={trigger}
      disabled={triggering || isPending}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-[#0000FF] text-gray-700 hover:text-[#0000FF] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
    >
      {triggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      Lancer le check
    </button>
  )
}
