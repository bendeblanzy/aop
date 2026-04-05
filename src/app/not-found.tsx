import Link from 'next/link'

export default function GlobalNotFound() {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-6xl font-bold text-indigo-600 mb-4">404</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Page introuvable</h1>
          <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
            Cette page n&apos;existe pas. Vérifiez l&apos;adresse ou retournez à l&apos;accueil.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </body>
    </html>
  )
}
