'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function DeleteAOButton({ id, titre }: { id: string; titre: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm) { setConfirm(true); return }
    setLoading(true)
    const res = await fetch('/api/appels-offres', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) router.refresh()
    else { toast.error('Erreur lors de la suppression'); setLoading(false); setConfirm(false) }
  }

  return (
    <button
      onClick={handleDelete}
      onBlur={() => setTimeout(() => setConfirm(false), 300)}
      title={confirm ? 'Cliquer pour confirmer' : 'Supprimer'}
      className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        confirm
          ? 'bg-danger text-white hover:opacity-90'
          : 'text-text-secondary hover:text-danger hover:bg-red-50'
      }`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      {confirm ? 'Confirmer' : ''}
    </button>
  )
}
