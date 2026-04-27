/**
 * @deprecated Page de "réponse aux AO" retirée. Redirige vers la fiche AO.
 * À supprimer manuellement (rm -rf src/app/(app)/appels-offres/[id]/repondre).
 */
import { redirect } from 'next/navigation'

export default async function DeprecatedRepondrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/appels-offres/${id}`)
}
