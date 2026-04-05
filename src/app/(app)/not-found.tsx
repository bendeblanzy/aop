import Link from 'next/link'
import { FileQuestion, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <FileQuestion className="w-16 h-16 text-border mb-6" />
      <h1 className="text-2xl font-bold text-text-primary mb-2">Page introuvable</h1>
      <p className="text-text-secondary text-sm mb-8 text-center max-w-md">
        La ressource que vous recherchez n&apos;existe pas ou a été supprimée.
      </p>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Tableau de bord
        </Link>
        <Link
          href="/appels-offres"
          className="flex items-center gap-2 border border-border hover:bg-surface text-text-primary rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Appels d&apos;offres
        </Link>
      </div>
    </div>
  )
}
