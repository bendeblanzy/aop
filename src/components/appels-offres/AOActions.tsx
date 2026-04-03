'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Loader2, X, PlayCircle } from 'lucide-react'
import Link from 'next/link'
import type { AppelOffre } from '@/lib/types'

interface Props {
  ao: AppelOffre
}

export default function AOActions({ ao }: Props) {
  const router = useRouter()
  const [showEdit, setShowEdit] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  const [titre, setTitre] = useState(ao.titre)
  const [acheteur, setAcheteur] = useState(ao.acheteur || '')
  const [referenceMarche, setReferenceMarche] = useState(ao.reference_marche || '')
  const [dateLimite, setDateLimite] = useState(
    ao.date_limite_reponse ? ao.date_limite_reponse.slice(0, 16) : ''
  )
  const [statut, setStatut] = useState(ao.statut)
  const [notes, setNotes] = useState(ao.notes_utilisateur || '')

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/appels-offres', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: ao.id,
        titre,
        acheteur: acheteur || null,
        reference_marche: referenceMarche || null,
        date_limite_reponse: dateLimite || null,
        statut,
        notes_utilisateur: notes || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setShowEdit(false)
      router.refresh()
    } else {
      alert('Erreur lors de la sauvegarde')
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch('/api/appels-offres', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ao.id }),
    })
    if (res.ok) {
      router.push('/appels-offres')
    } else {
      alert('Erreur lors de la suppression')
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Link
          href={`/appels-offres/${ao.id}/repondre`}
          className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          <PlayCircle className="w-4 h-4" />
          Modifier la réponse
        </Link>
        <button
          onClick={() => setShowEdit(true)}
          className="flex items-center gap-2 border border-border text-text-secondary hover:text-primary hover:border-primary rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          title="Modifier uniquement le titre, acheteur, date..."
        >
          <Pencil className="w-4 h-4" />
          Infos
        </button>
        <button
          onClick={() => setShowConfirmDelete(true)}
          className="flex items-center gap-2 border border-border text-text-secondary hover:text-danger hover:border-danger rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Supprimer
        </button>
      </div>

      {/* Modal édition */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-border w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-text-primary">Modifier l&apos;appel d&apos;offres</h2>
              <button onClick={() => setShowEdit(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Titre *</label>
                <input
                  value={titre}
                  onChange={e => setTitre(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Acheteur public</label>
                  <input
                    value={acheteur}
                    onChange={e => setAcheteur(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Référence marché</label>
                  <input
                    value={referenceMarche}
                    onChange={e => setReferenceMarche(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Date limite</label>
                  <input
                    type="datetime-local"
                    value={dateLimite}
                    onChange={e => setDateLimite(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Statut</label>
                  <select
                    value={statut}
                    onChange={e => setStatut(e.target.value as AppelOffre['statut'])}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    <option value="brouillon">Brouillon</option>
                    <option value="en_cours">En cours</option>
                    <option value="analyse">En analyse</option>
                    <option value="genere">Documents générés</option>
                    <option value="soumis">Soumis</option>
                    <option value="archive">Archivé</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => setShowEdit(false)}
                className="border border-border text-text-secondary rounded-lg px-4 py-2 text-sm font-medium hover:bg-surface transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !titre.trim()}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation suppression */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-border w-full max-w-sm shadow-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">Supprimer cet AO ?</h2>
                <p className="text-sm text-text-secondary">Cette action est irréversible.</p>
              </div>
            </div>
            <p className="text-sm text-text-primary bg-surface rounded-lg px-3 py-2 mb-5 font-medium">
              {ao.titre}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 border border-border text-text-secondary rounded-lg py-2 text-sm font-medium hover:bg-surface transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 bg-danger hover:opacity-90 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
