import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Retourne "dans X jours", "aujourd'hui", "dépassée de X jours", etc. */
export function formatDeadline(dateStr: string): { label: string; urgent: boolean; passed: boolean } {
  const now = new Date()
  const deadline = new Date(dateStr)
  const diffMs = deadline.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { label: `Dépassée de ${Math.abs(diffDays)}j`, urgent: true, passed: true }
  }
  if (diffDays === 0) {
    return { label: "Aujourd'hui", urgent: true, passed: false }
  }
  if (diffDays <= 3) {
    return { label: `Dans ${diffDays}j`, urgent: true, passed: false }
  }
  if (diffDays <= 7) {
    return { label: `Dans ${diffDays}j`, urgent: false, passed: false }
  }
  return { label: formatDate(dateStr), urgent: false, passed: false }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
}

export function getStatutLabel(statut: string): string {
  const labels: Record<string, string> = {
    brouillon: 'Brouillon',
    en_cours: 'En cours',
    analyse: 'Analysé',
    genere: 'Généré',
    soumis: 'Soumis',
    archive: 'Archivé',
  }
  return labels[statut] || statut
}

export function getStatutColor(statut: string): string {
  const colors: Record<string, string> = {
    brouillon: 'bg-gray-100 text-gray-700',
    en_cours: 'bg-blue-100 text-blue-700',
    analyse: 'bg-purple-100 text-purple-700',
    genere: 'bg-green-100 text-green-700',
    soumis: 'bg-emerald-100 text-emerald-700',
    archive: 'bg-gray-100 text-gray-500',
  }
  return colors[statut] || 'bg-gray-100 text-gray-700'
}

export function calculateProfileCompletion(profile: Partial<import('./types').Profile>): number {
  const fields = [
    'raison_sociale', 'siret', 'forme_juridique', 'code_naf',
    'adresse_siege', 'code_postal', 'ville',
    'nom_representant', 'prenom_representant', 'qualite_representant',
    'email_representant', 'telephone_representant',
    'ca_annee_n1', 'effectif_moyen',
    'assurance_rc_numero', 'assurance_rc_compagnie',
    'declaration_non_interdiction', 'declaration_a_jour_fiscal', 'declaration_a_jour_social',
  ]
  const filled = fields.filter(f => {
    const val = (profile as Record<string, unknown>)[f]
    return val !== null && val !== undefined && val !== '' && val !== false
  })
  return Math.round((filled.length / fields.length) * 100)
}
