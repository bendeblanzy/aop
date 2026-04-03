'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import { calculateProfileCompletion, cn } from '@/lib/utils'
import { Loader2, Save, Plus, Trash2, Building2 } from 'lucide-react'
import { toast } from 'sonner'

const FORMES_JURIDIQUES = ['SARL', 'SAS', 'SA', 'EURL', 'EI', 'SASU', 'SNC', 'Association', 'Autre']
const DOMAINES = ['BTP', 'Informatique / IT', 'Conseil', 'Formation', 'Maintenance', 'Nettoyage', 'Sécurité', 'Transport', 'Restauration', 'Santé', 'Environnement', 'Communication', 'Juridique', 'Autre']

export default function ProfilPage() {
  const [profile, setProfile] = useState<Partial<Profile>>({
    pays: 'France',
    declaration_non_interdiction: false,
    declaration_a_jour_fiscal: false,
    declaration_a_jour_social: false,
    certifications: [],
    domaines_competence: [],
    sous_traitants: [],
  })
  const [activeTab, setActiveTab] = useState('identite')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newCert, setNewCert] = useState('')
  const [newST, setNewST] = useState({ nom: '', siret: '', adresse: '', specialite: '' })
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) setProfile(data)
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Nettoyer les valeurs avant envoi à Supabase :
    // - chaînes vides → null (évite les 400 sur les colonnes date/number)
    // - NaN → null
    const cleaned = Object.fromEntries(
      Object.entries({ ...profile, id: user.id }).map(([k, v]) => {
        if (v === '') return [k, null]
        if (typeof v === 'number' && isNaN(v)) return [k, null]
        return [k, v]
      })
    )

    const { error } = await supabase.from('profiles').upsert(cleaned, { onConflict: 'id' })
    if (error) {
      console.error('[profil] upsert error:', error)
      toast.error(`Erreur : ${error.message}`)
    } else {
      toast.success('Profil sauvegardé !')
    }
    setSaving(false)
  }

  function update(field: keyof Profile, value: unknown) {
    setProfile(p => ({ ...p, [field]: value }))
  }

  const completion = calculateProfileCompletion(profile)

  const tabs = [
    { id: 'identite', label: 'Identité' },
    { id: 'representant', label: 'Représentant' },
    { id: 'financier', label: 'Financier' },
    { id: 'capacites', label: 'Capacités' },
    { id: 'assurances', label: 'Assurances' },
    { id: 'declarations', label: 'Déclarations' },
    { id: 'sous-traitants', label: 'Sous-traitants' },
  ]

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2"><Building2 className="w-6 h-6 text-primary" /> Mon profil entreprise</h1>
          <p className="text-text-secondary mt-1">Ces informations servent à remplir automatiquement vos formulaires</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Sauvegarder
        </button>
      </div>

      {/* Barre de progression */}
      <div className="bg-white rounded-xl border border-border p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-text-primary">Complétion du profil</span>
          <span className={cn('text-sm font-bold', completion >= 80 ? 'text-secondary' : completion >= 50 ? 'text-warning' : 'text-danger')}>{completion}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className={cn('h-2 rounded-full transition-all', completion >= 80 ? 'bg-secondary' : completion >= 50 ? 'bg-warning' : 'bg-danger')} style={{ width: `${completion}%` }} />
        </div>
        {completion < 100 && <p className="text-xs text-text-secondary mt-2">Complétez votre profil pour générer des documents plus précis</p>}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-border">
        <div className="flex border-b border-border overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn('px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
              )}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Onglet Identité */}
          {activeTab === 'identite' && (
            <div className="grid grid-cols-2 gap-5">
              <FormField label="Raison sociale *" value={profile.raison_sociale || ''} onChange={v => update('raison_sociale', v)} placeholder="Ma Société SAS" />
              <FormSelect label="Forme juridique" value={profile.forme_juridique || ''} onChange={v => update('forme_juridique', v)} options={FORMES_JURIDIQUES} />
              <FormField label="SIRET *" value={profile.siret || ''} onChange={v => update('siret', v)} placeholder="12345678900000" maxLength={14} />
              <FormField label="Code NAF / APE" value={profile.code_naf || ''} onChange={v => update('code_naf', v)} placeholder="6201Z" />
              <FormField label="N° TVA intracommunautaire" value={profile.numero_tva || ''} onChange={v => update('numero_tva', v)} placeholder="FR12345678900" />
              <FormField label="Date de création" type="date" value={profile.date_creation_entreprise || ''} onChange={v => update('date_creation_entreprise', v)} />
              <FormField label="Capital social (€)" type="number" value={profile.capital_social?.toString() || ''} onChange={v => update('capital_social', parseFloat(v) || undefined)} />
              <div className="col-span-2">
                <FormField label="Adresse du siège social" value={profile.adresse_siege || ''} onChange={v => update('adresse_siege', v)} placeholder="12 rue de la Paix" />
              </div>
              <FormField label="Code postal" value={profile.code_postal || ''} onChange={v => update('code_postal', v)} placeholder="75001" maxLength={5} />
              <FormField label="Ville" value={profile.ville || ''} onChange={v => update('ville', v)} placeholder="Paris" />
            </div>
          )}

          {/* Onglet Représentant */}
          {activeTab === 'representant' && (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Civilité</label>
                <div className="flex gap-4">
                  {['M.', 'Mme'].map(civ => (
                    <label key={civ} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={profile.civilite_representant === civ} onChange={() => update('civilite_representant', civ)} className="accent-primary" />
                      <span className="text-sm">{civ}</span>
                    </label>
                  ))}
                </div>
              </div>
              <FormField label="Qualité / Fonction" value={profile.qualite_representant || ''} onChange={v => update('qualite_representant', v)} placeholder="Gérant, Président, DG..." />
              <FormField label="Prénom *" value={profile.prenom_representant || ''} onChange={v => update('prenom_representant', v)} />
              <FormField label="Nom *" value={profile.nom_representant || ''} onChange={v => update('nom_representant', v)} />
              <FormField label="Email" type="email" value={profile.email_representant || ''} onChange={v => update('email_representant', v)} />
              <FormField label="Téléphone" type="tel" value={profile.telephone_representant || ''} onChange={v => update('telephone_representant', v)} placeholder="06 00 00 00 00" />
            </div>
          )}

          {/* Onglet Financier */}
          {activeTab === 'financier' && (
            <div className="grid grid-cols-2 gap-5">
              <FormField label="Chiffre d'affaires N-1 (€)" type="number" value={profile.ca_annee_n1?.toString() || ''} onChange={v => update('ca_annee_n1', parseFloat(v) || undefined)} placeholder="500000" />
              <FormField label="Chiffre d'affaires N-2 (€)" type="number" value={profile.ca_annee_n2?.toString() || ''} onChange={v => update('ca_annee_n2', parseFloat(v) || undefined)} placeholder="450000" />
              <FormField label="Chiffre d'affaires N-3 (€)" type="number" value={profile.ca_annee_n3?.toString() || ''} onChange={v => update('ca_annee_n3', parseFloat(v) || undefined)} placeholder="400000" />
              <FormField label="Effectif moyen annuel" type="number" value={profile.effectif_moyen?.toString() || ''} onChange={v => update('effectif_moyen', parseInt(v) || undefined)} placeholder="10" />
            </div>
          )}

          {/* Onglet Capacités */}
          {activeTab === 'capacites' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-3">Certifications (ISO 9001, MASE, Qualibat...)</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(profile.certifications || []).map((c, i) => (
                    <span key={i} className="flex items-center gap-1.5 bg-primary-light text-primary px-3 py-1 rounded-full text-sm font-medium">
                      {c}
                      <button onClick={() => update('certifications', (profile.certifications || []).filter((_, j) => j !== i))}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newCert} onChange={e => setNewCert(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newCert.trim()) { update('certifications', [...(profile.certifications || []), newCert.trim()]); setNewCert('') } }}
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Tapez une certification et Entrée..." />
                  <button onClick={() => { if (newCert.trim()) { update('certifications', [...(profile.certifications || []), newCert.trim()]); setNewCert('') } }}
                    className="bg-primary text-white rounded-lg px-3 py-2"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-3">Domaines de compétence</label>
                <div className="grid grid-cols-3 gap-2">
                  {DOMAINES.map(d => (
                    <label key={d} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={(profile.domaines_competence || []).includes(d)}
                        onChange={e => update('domaines_competence', e.target.checked ? [...(profile.domaines_competence || []), d] : (profile.domaines_competence || []).filter(x => x !== d))}
                        className="accent-primary" />
                      <span className="text-sm text-text-primary">{d}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Moyens techniques et matériels</label>
                <textarea value={profile.moyens_techniques || ''} onChange={e => update('moyens_techniques', e.target.value)} rows={5}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="Décrivez vos équipements, logiciels, matériels..." />
              </div>
            </div>
          )}

          {/* Onglet Assurances */}
          {activeTab === 'assurances' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-text-primary mb-4">Responsabilité Civile Professionnelle</h3>
                <div className="grid grid-cols-2 gap-5">
                  <FormField label="N° de police" value={profile.assurance_rc_numero || ''} onChange={v => update('assurance_rc_numero', v)} />
                  <FormField label="Compagnie d'assurance" value={profile.assurance_rc_compagnie || ''} onChange={v => update('assurance_rc_compagnie', v)} placeholder="AXA, Allianz, MMA..." />
                  <FormField label="Date d'expiration" type="date" value={profile.assurance_rc_expiration || ''} onChange={v => update('assurance_rc_expiration', v)} />
                </div>
              </div>
              <hr className="border-border" />
              <div>
                <h3 className="font-semibold text-text-primary mb-4">Responsabilité Décennale (si applicable)</h3>
                <div className="grid grid-cols-2 gap-5">
                  <FormField label="N° de police" value={profile.assurance_decennale_numero || ''} onChange={v => update('assurance_decennale_numero', v)} />
                  <FormField label="Compagnie d'assurance" value={profile.assurance_decennale_compagnie || ''} onChange={v => update('assurance_decennale_compagnie', v)} />
                  <FormField label="Date d'expiration" type="date" value={profile.assurance_decennale_expiration || ''} onChange={v => update('assurance_decennale_expiration', v)} />
                </div>
              </div>
            </div>
          )}

          {/* Onglet Déclarations */}
          {activeTab === 'declarations' && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary mb-6">Ces déclarations sur l&apos;honneur sont requises pour les formulaires DC1 et DC2. Cochez uniquement si la situation est avérée.</p>
              {[
                { field: 'declaration_non_interdiction' as keyof Profile, label: 'Non-interdiction de soumissionner', desc: "Le candidat n'a pas fait l'objet d'une interdiction de soumissionner aux marchés publics" },
                { field: 'declaration_a_jour_fiscal' as keyof Profile, label: 'À jour des obligations fiscales', desc: "Le candidat est à jour de ses obligations fiscales (TVA, IS, CFE...)" },
                { field: 'declaration_a_jour_social' as keyof Profile, label: 'À jour des obligations sociales', desc: "Le candidat est à jour de ses obligations sociales (URSSAF, retraite...)" },
              ].map(d => (
                <label key={d.field} className="flex items-start gap-3 p-4 rounded-xl border border-border cursor-pointer hover:bg-surface transition-colors">
                  <input type="checkbox" checked={!!profile[d.field]} onChange={e => update(d.field, e.target.checked)} className="accent-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-text-primary text-sm">{d.label}</p>
                    <p className="text-text-secondary text-xs mt-0.5">{d.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Onglet Sous-traitants */}
          {activeTab === 'sous-traitants' && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">Ces sous-traitants seront proposés automatiquement lors de la génération des DC4.</p>
              {(profile.sous_traitants || []).map((st, i) => (
                <div key={i} className="border border-border rounded-xl p-4">
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-medium text-text-primary text-sm">Sous-traitant {i + 1}</span>
                    <button onClick={() => update('sous_traitants', (profile.sous_traitants || []).filter((_, j) => j !== i))} className="text-danger hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(['nom', 'siret', 'adresse', 'specialite'] as const).map(f => (
                      <FormField key={f} label={f.charAt(0).toUpperCase() + f.slice(1)} value={st[f] || ''} onChange={v => update('sous_traitants', (profile.sous_traitants || []).map((s, j) => j === i ? { ...s, [f]: v } : s))} />
                    ))}
                  </div>
                </div>
              ))}
              <div className="border-2 border-dashed border-border rounded-xl p-4">
                <p className="text-sm font-medium text-text-primary mb-3">Ajouter un sous-traitant</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {(['nom', 'siret', 'adresse', 'specialite'] as const).map(f => (
                    <FormField key={f} label={f.charAt(0).toUpperCase() + f.slice(1)} value={newST[f]} onChange={v => setNewST(s => ({ ...s, [f]: v }))} />
                  ))}
                </div>
                <button onClick={() => { if (newST.nom && newST.siret) { update('sous_traitants', [...(profile.sous_traitants || []), { ...newST }]); setNewST({ nom: '', siret: '', adresse: '', specialite: '' }) } }}
                  className="flex items-center gap-2 text-primary text-sm font-medium hover:underline">
                  <Plus className="w-4 h-4" /> Ajouter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FormField({ label, value, onChange, type = 'text', placeholder, maxLength }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; maxLength?: number }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength}
        className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
    </div>
  )
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1.5">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white">
        <option value="">— Sélectionner —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
