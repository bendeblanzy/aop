'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/context/OrganizationContext'
import { Profile, Reference } from '@/lib/types'
import { calculateProfileCompletion, cn } from '@/lib/utils'
import { Loader2, Save, Plus, Trash2, Building2, Radar, Award, Upload, FileText, X, ExternalLink, Search, Sparkles, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { BOAMP_CODES, BOAMP_CATEGORIES } from '@/lib/boamp/codes'
import { REGIONS_FR } from '@/lib/boamp/regions'

const FORMES_JURIDIQUES = ['SARL', 'SAS', 'SA', 'EURL', 'EI', 'SASU', 'SNC', 'Association', 'Autre']
const DOMAINES = ['BTP', 'Informatique / IT', 'Conseil', 'Formation', 'Maintenance', 'Nettoyage', 'Sécurité', 'Transport', 'Restauration', 'Santé', 'Environnement', 'Communication', 'Juridique', 'Autre']

export default function ProfilPage() {
  const { orgId, loading: orgLoading, refresh: refreshOrg } = useOrganization()
  const [profile, setProfile] = useState<Partial<Profile>>({
    pays: 'France',
    declaration_non_interdiction: false,
    declaration_a_jour_fiscal: false,
    declaration_a_jour_social: false,
    certifications: [],
    domaines_competence: [],
    sous_traitants: [],
    boamp_codes: [],
    activite_metier: '',
  })
  const [activeTab, setActiveTab] = useState('entreprise')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved'>('idle')
  const isInitialLoad = useRef(true)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [newCert, setNewCert] = useState('')
  const [newST, setNewST] = useState({ nom: '', siret: '', adresse: '', specialite: '' })
  // Références
  const [references, setReferences] = useState<Reference[]>([])
  const [refsLoading, setRefsLoading] = useState(false)
  const [editingRef, setEditingRef] = useState<Partial<Reference> | null>(null)
  const [savingRef, setSavingRef] = useState(false)
  // PDF uploads
  const [uploading, setUploading] = useState<string | null>(null)
  // Deep Research
  const [deepResearchLoading, setDeepResearchLoading] = useState(false)
  // SIRET auto-fill
  const [sirenLoading, setSirenLoading] = useState(false)
  const supabase = createClient()

  // ── Auto-remplissage depuis l'API Annuaire des Entreprises (data.gouv.fr) ──
  async function autoFillFromSiret() {
    const siret = (profile.siret || '').replace(/\s/g, '')
    if (siret.length < 9) {
      toast.error('Entrez au moins les 9 premiers chiffres du SIREN/SIRET')
      return
    }
    setSirenLoading(true)
    try {
      // Appel server-side pour éviter les problèmes CORS/réseau en production
      const res = await fetch(`/api/profil/siret?q=${encodeURIComponent(siret)}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Entreprise introuvable')
        return
      }

      setProfile(p => ({
        ...p,
        raison_sociale: data.nom_complet ?? p.raison_sociale,
        forme_juridique: data.forme_juridique ?? p.forme_juridique,
        code_naf: data.code_naf ?? p.code_naf,
        adresse_siege: data.adresse_siege ?? p.adresse_siege,
        code_postal: data.code_postal ?? p.code_postal,
        ville: data.ville ?? p.ville,
        numero_tva: p.numero_tva || data.numero_tva,
        date_creation_entreprise: data.date_creation ?? p.date_creation_entreprise,
      }))

      toast.success(`✅ ${data.nom_complet} — données pré-remplies ! Vérifiez et sauvegardez.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la recherche')
    } finally {
      setSirenLoading(false)
    }
  }

  async function load() {
    if (!orgId) {
      setLoading(false)
      isInitialLoad.current = false
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('organization_id', orgId).maybeSingle()
    if (error) console.error('[profil] load error:', error.message)
    if (data) setProfile(data)
    setLoading(false)
    // Marquer la fin du chargement initial pour activer l'auto-save
    setTimeout(() => { isInitialLoad.current = false }, 300)
  }

  const loadReferences = useCallback(async () => {
    setRefsLoading(true)
    try {
      const res = await fetch('/api/references')
      if (res.ok) {
        const json = await res.json()
        setReferences(json.data?.items || [])
      }
    } catch (e) {
      console.error('[profil] refs load error:', e)
    }
    setRefsLoading(false)
  }, [])

  async function saveReference() {
    if (!editingRef?.titre || !editingRef?.client) {
      toast.error('Le titre et le client sont requis')
      return
    }
    setSavingRef(true)
    const method = editingRef.id ? 'PUT' : 'POST'
    const body = editingRef.id
      ? editingRef
      : { titre: editingRef.titre, client: editingRef.client, annee: editingRef.annee, montant: editingRef.montant, description: editingRef.description, domaine: editingRef.domaine, lot: editingRef.lot, attestation_bonne_execution: editingRef.attestation_bonne_execution || false, contact_reference: editingRef.contact_reference, telephone_reference: editingRef.telephone_reference }
    try {
      const res = await fetch('/api/references', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) {
        toast.success(editingRef.id ? 'Référence mise à jour' : 'Référence ajoutée')
        setEditingRef(null)
        loadReferences()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erreur lors de la sauvegarde')
      }
    } catch (e) {
      toast.error('Erreur réseau')
    }
    setSavingRef(false)
  }

  async function deleteReference(id: string) {
    if (!confirm('Supprimer cette référence ?')) return
    try {
      const res = await fetch('/api/references', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (res.ok) {
        toast.success('Référence supprimée')
        loadReferences()
      }
    } catch (e) {
      toast.error('Erreur réseau')
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>, field: 'cv_plaquette_url' | 'dossier_capacites_url') {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.error('Seuls les fichiers PDF sont acceptés')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Le fichier ne doit pas dépasser 10 Mo')
      return
    }
    setUploading(field)
    const ext = file.name.split('.').pop()
    const path = `${orgId}/${field}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
    if (error) {
      toast.error(`Erreur upload : ${error.message}`)
      setUploading(null)
      return
    }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    update(field as keyof Profile, urlData.publicUrl)
    toast.success('Fichier uploadé !')
    setUploading(null)
  }

  useEffect(() => {
    if (orgId) {
      load()
      loadReferences()
    } else if (!orgLoading) {
      setLoading(false)
    }
  }, [orgId, orgLoading, loadReferences])

  async function save() {
    if (!orgId) {
      toast.error('Organisation non chargée. Veuillez recharger la page.')
      return
    }
    setSaving(true)

    const DATE_FIELDS = ['date_creation_entreprise', 'assurance_rc_expiration', 'assurance_decennale_expiration']
    // Exclure les champs non-éditables par le client : colonnes système + vecteurs pgvector
    // (l'embedding est recalculé par l'API /api/veille/embed-profile après la sauvegarde)
    const {
      created_at, updated_at, siren, id,
      embedding, embedding_updated_at,
      ...editableFields
    } = profile as any
    const payload: Record<string, unknown> = { ...editableFields, organization_id: orgId }
    for (const f of DATE_FIELDS) {
      if (payload[f] === '') payload[f] = null
    }

    const { error } = await supabase.from('profiles').upsert(
      { ...payload, organization_id: orgId },
      { onConflict: 'organization_id' }
    )
    if (error) {
      console.error('[profil] upsert error:', error.message, error.details, error.hint)
      toast.error(`Erreur : ${error.message}`)
    } else {
      toast.success('Profil sauvegardé !')
      refreshOrg()
      // Recalculer l'embedding du profil en arrière-plan (pour le scoring vectoriel)
      fetch('/api/veille/embed-profile', { method: 'POST' }).catch(() => {})
    }
    setSaving(false)
  }

  function update(field: keyof Profile, value: unknown) {
    setProfile(p => ({ ...p, [field]: value }))
  }

  // ── Auto-save avec debounce 2s ─────────────────────────────────────────────
  useEffect(() => {
    // Ne pas déclencher l'auto-save lors du chargement initial
    if (isInitialLoad.current) return
    if (!orgId) return

    setAutoSaveStatus('pending')
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus('saving')
      const DATE_FIELDS = ['date_creation_entreprise', 'assurance_rc_expiration', 'assurance_decennale_expiration']
      const {
        created_at, updated_at, siren, id,
        embedding, embedding_updated_at,
        ...editableFields
      } = profile as any
      const payload: Record<string, unknown> = { ...editableFields, organization_id: orgId }
      for (const f of DATE_FIELDS) {
        if (payload[f] === '') payload[f] = null
      }
      const { error } = await supabase.from('profiles').upsert(
        { ...payload, organization_id: orgId },
        { onConflict: 'organization_id' }
      )
      if (!error) {
        setAutoSaveStatus('saved')
        // Recalculer l'embedding en arrière-plan
        fetch('/api/veille/embed-profile', { method: 'POST' }).catch(() => {})
        setTimeout(() => setAutoSaveStatus('idle'), 2500)
      } else {
        setAutoSaveStatus('idle')
        console.error('[auto-save] error:', error.message)
      }
    }, 2000)
  }, [profile]) // eslint-disable-line react-hooks/exhaustive-deps

  const completion = calculateProfileCompletion(profile)

  const tabs = [
    { id: 'entreprise', label: '🏢 Entreprise' },
    // ── Contenu stratégique ──
    { id: 'positionnement', label: '✨ Positionnement' },
    { id: 'references', label: 'Références & Docs' },
    { id: 'veille-boamp', label: '📡 Veille BOAMP' },
    // ── Infos techniques ──
    { id: 'capacites', label: 'Capacités' },
    { id: 'assurances', label: 'Assurances' },
    { id: 'declarations', label: 'Déclarations' },
    { id: 'sous-traitants', label: 'Sous-traitants' },
  ]

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>

  return (
    <div>
      <div className="mb-6 pb-2 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="min-w-0 mr-4">
            <h1 className="text-lg sm:text-2xl font-bold text-text-primary flex items-center gap-2 truncate"><Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" /> Mon profil entreprise</h1>
            <p className="text-text-secondary mt-1 text-xs sm:text-sm hidden sm:block">Ces informations servent à remplir automatiquement vos formulaires</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Indicateur auto-save */}
            {autoSaveStatus === 'pending' && (
              <span className="text-xs text-gray-400 hidden sm:flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                Modifications non sauvegardées
              </span>
            )}
            {autoSaveStatus === 'saving' && (
              <span className="text-xs text-gray-400 hidden sm:flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Enregistrement…
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="text-xs text-green-600 hidden sm:flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Enregistré
              </span>
            )}
            <button onClick={save} disabled={saving || autoSaveStatus === 'saving'} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white rounded-lg px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span className="hidden sm:inline">Sauvegarder</span>
              <span className="sm:hidden">Sauver</span>
            </button>
          </div>
        </div>
      </div>


      {/* Barre de progression */}
      <div className="bg-white rounded-xl border border-border p-4 mb-6 shadow-sm overflow-hidden">
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
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex border-b border-border overflow-x-auto scrollbar-hide">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn('px-3 sm:px-5 py-3 sm:py-3.5 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors shrink-0',
                activeTab === tab.id ? 'bg-primary text-white font-semibold' : 'text-text-secondary hover:bg-surface'
              )}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Onglet Identité */}
          {/* ── Onglet Entreprise (fusion Identité + Représentant + Financier) ── */}
          {activeTab === 'entreprise' && (
            <div className="space-y-8">

              {/* ── Section 1 : Identité ── */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 pb-2 border-b border-border flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" /> Identité
                </h3>
                {/* Bandeau auto-remplissage SIRET */}
                <div className="bg-[#F5F5FF] rounded-xl border border-[#0000FF]/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#0000FF] mb-0.5 flex items-center gap-1.5">
                      <Search className="w-4 h-4" /> Auto-remplissage depuis le SIRET
                    </p>
                    <p className="text-xs text-gray-500">
                      Renseignez votre SIRET ci-dessous et cliquez sur le bouton pour pré-remplir automatiquement les champs (source : Annuaire des Entreprises, data.gouv.fr).
                    </p>
                  </div>
                  <button
                    onClick={autoFillFromSiret}
                    disabled={sirenLoading || (profile.siret || '').replace(/\s/g, '').length < 9}
                    className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 shrink-0"
                  >
                    {sirenLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Auto-remplir
                  </button>
                </div>
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
                  <div className="col-span-2">
                    <FormSelect
                      label="Région (pour le filtrage des AO)"
                      value={profile.region || ''}
                      onChange={v => update('region', v)}
                      options={[...REGIONS_FR]}
                    />
                  </div>
                </div>
              </div>

              {/* ── Section 2 : Représentant légal ── */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 pb-2 border-b border-border flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" /> Représentant légal
                </h3>
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
              </div>

              {/* ── Section 3 : Données financières ── */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 pb-2 border-b border-border flex items-center gap-2">
                  <Radar className="w-4 h-4 text-primary" /> Données financières
                </h3>
                <div className="grid grid-cols-2 gap-5">
                  <FormField label="Chiffre d'affaires N-1 (€)" type="number" value={profile.ca_annee_n1?.toString() || ''} onChange={v => update('ca_annee_n1', parseFloat(v) || undefined)} placeholder="500000" />
                  <FormField label="Chiffre d'affaires N-2 (€)" type="number" value={profile.ca_annee_n2?.toString() || ''} onChange={v => update('ca_annee_n2', parseFloat(v) || undefined)} placeholder="450000" />
                  <FormField label="Chiffre d'affaires N-3 (€)" type="number" value={profile.ca_annee_n3?.toString() || ''} onChange={v => update('ca_annee_n3', parseFloat(v) || undefined)} placeholder="400000" />
                  <FormField label="Marge brute N-1 (€)" type="number" value={profile.marge_brute?.toString() || ''} onChange={v => update('marge_brute', parseFloat(v) || undefined)} placeholder="250000" />
                  <FormField label="Effectif moyen annuel" type="number" value={profile.effectif_moyen?.toString() || ''} onChange={v => update('effectif_moyen', parseInt(v) || undefined)} placeholder="10" />
                </div>
              </div>

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
              <label className="flex items-center gap-3 p-4 rounded-xl border border-border cursor-pointer hover:bg-surface transition-colors mb-2">
                <input
                  type="checkbox"
                  checked={!(profile.sous_traitants || []).length && (profile as any).pas_de_sous_traitants !== false}
                  onChange={e => {
                    if (e.target.checked) {
                      update('sous_traitants', [])
                      update('pas_de_sous_traitants' as keyof Profile, true)
                    } else {
                      update('pas_de_sous_traitants' as keyof Profile, false)
                    }
                  }}
                  className="accent-primary"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">Pas de sous-traitants</p>
                  <p className="text-xs text-text-secondary">Nous réalisons toutes les prestations en interne</p>
                </div>
              </label>
              {(profile as any).pas_de_sous_traitants ? (
                <div className="text-center py-8 text-text-secondary opacity-50">
                  <p className="text-sm">Section désactivée — aucun sous-traitant déclaré</p>
                </div>
              ) : (
              <>
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
              </>
              )}
            </div>
          )}

          {/* Onglet Références */}
          {activeTab === 'references' && (
            <div className="space-y-6">
              <div className="bg-[#F5F5FF] border border-[#0000FF]/10 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Award className="w-5 h-5 text-[#0000FF] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[#0000FF]">Références & expériences similaires</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Listez vos marchés publics ou privés déjà réalisés. Ces références seront automatiquement proposées
                      dans vos réponses aux AO pour démontrer votre expérience.
                    </p>
                  </div>
                </div>
              </div>

              {refsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#0000FF]" /></div>
              ) : (
                <>
                  {/* Liste des références existantes */}
                  {references.map(ref => (
                    <div key={ref.id} className="border border-border rounded-xl p-4 hover:border-[#0000FF]/20 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-text-primary text-sm truncate">{ref.titre}</h4>
                          <p className="text-xs text-text-secondary mt-0.5">{ref.client}{ref.annee ? ` — ${ref.annee}` : ''}{ref.montant ? ` — ${ref.montant.toLocaleString('fr-FR')} €` : ''}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <button onClick={() => setEditingRef({ ...ref })} className="text-[#0000FF] hover:text-[#0000CC] text-xs font-medium">Modifier</button>
                          <button onClick={() => deleteReference(ref.id)} className="text-danger hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                      {ref.description && <p className="text-xs text-text-secondary line-clamp-2">{ref.description}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {ref.domaine && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{ref.domaine}</span>}
                        {ref.attestation_bonne_execution && <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full">✓ Attestation</span>}
                        {ref.contact_reference && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Contact : {ref.contact_reference}</span>}
                      </div>
                    </div>
                  ))}

                  {references.length === 0 && !editingRef && (
                    <div className="text-center py-8 text-text-secondary">
                      <Award className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">Aucune référence ajoutée</p>
                      <p className="text-xs mt-1">Ajoutez vos réalisations pour enrichir vos réponses aux AO</p>
                    </div>
                  )}

                  {/* Formulaire d'ajout/modification */}
                  {editingRef ? (
                    <div className="border-2 border-[#0000FF]/20 rounded-xl p-5 bg-[#F5F5FF]/30">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-semibold text-text-primary text-sm">{editingRef.id ? 'Modifier la référence' : 'Nouvelle référence'}</h4>
                        <button onClick={() => setEditingRef(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <FormField label="Titre du marché / mission *" value={editingRef.titre || ''} onChange={v => setEditingRef(r => r ? { ...r, titre: v } : r)} placeholder="Ex: Campagne de communication santé publique" />
                        </div>
                        <FormField label="Client / Donneur d'ordre *" value={editingRef.client || ''} onChange={v => setEditingRef(r => r ? { ...r, client: v } : r)} placeholder="Ex: ARS Île-de-France" />
                        <FormField label="Domaine" value={editingRef.domaine || ''} onChange={v => setEditingRef(r => r ? { ...r, domaine: v } : r)} placeholder="Ex: Communication, IT, BTP..." />
                        <FormField label="Année" type="number" value={editingRef.annee?.toString() || ''} onChange={v => setEditingRef(r => r ? { ...r, annee: parseInt(v) || undefined } : r)} placeholder="2024" />
                        <FormField label="Montant (€ HT)" type="number" value={editingRef.montant?.toString() || ''} onChange={v => setEditingRef(r => r ? { ...r, montant: parseFloat(v) || undefined } : r)} placeholder="50000" />
                        <FormField label="Lot (si applicable)" value={editingRef.lot || ''} onChange={v => setEditingRef(r => r ? { ...r, lot: v } : r)} placeholder="Lot 2 - Vidéo" />
                        <FormField label="Contact de référence" value={editingRef.contact_reference || ''} onChange={v => setEditingRef(r => r ? { ...r, contact_reference: v } : r)} placeholder="Nom du contact" />
                        <FormField label="Téléphone du contact" value={editingRef.telephone_reference || ''} onChange={v => setEditingRef(r => r ? { ...r, telephone_reference: v } : r)} placeholder="01 23 45 67 89" />
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-text-primary mb-1.5">Description de la mission</label>
                          <textarea value={editingRef.description || ''} onChange={e => setEditingRef(r => r ? { ...r, description: e.target.value } : r)} rows={3}
                            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                            placeholder="Décrivez les prestations réalisées, le contexte, les résultats..." />
                        </div>
                        <div className="col-span-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editingRef.attestation_bonne_execution || false} onChange={e => setEditingRef(r => r ? { ...r, attestation_bonne_execution: e.target.checked } : r)} className="accent-primary" />
                            <span className="text-sm text-text-primary">Attestation de bonne exécution disponible</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 mt-4">
                        <button onClick={() => setEditingRef(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
                        <button onClick={saveReference} disabled={savingRef} className="flex items-center gap-2 bg-[#0000FF] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#0000CC] disabled:opacity-60">
                          {savingRef ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          {editingRef.id ? 'Mettre à jour' : 'Ajouter'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setEditingRef({ attestation_bonne_execution: false })}
                      className="flex items-center gap-2 text-[#0000FF] text-sm font-medium hover:text-[#0000CC] border-2 border-dashed border-[#0000FF]/20 rounded-xl px-4 py-3 w-full justify-center hover:border-[#0000FF]/40 transition-colors">
                      <Plus className="w-4 h-4" /> Ajouter une référence
                    </button>
                  )}
                </>
              )}

              {/* Documents entreprise (fusionné ici) */}
              <hr className="border-border" />
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FileText className="w-4 h-4 text-[#0000FF]" /> Documents entreprise</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-border rounded-xl p-4">
                  <h4 className="font-medium text-text-primary text-xs mb-1">Plaquette / CV entreprise</h4>
                  <p className="text-[10px] text-text-secondary mb-3">Brochure de présentation</p>
                  {(profile as any).cv_plaquette_url ? (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <FileText className="w-4 h-4 text-green-600 shrink-0" />
                      <a href={(profile as any).cv_plaquette_url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline flex-1 truncate">Voir</a>
                      <button onClick={() => update('cv_plaquette_url' as keyof Profile, null)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-1 border-2 border-dashed border-gray-300 rounded-lg px-3 py-4 cursor-pointer hover:border-[#0000FF]/40 hover:bg-[#F5F5FF]/30 transition-colors">
                      {uploading === 'cv_plaquette_url' ? <Loader2 className="w-6 h-6 animate-spin text-[#0000FF]" /> : <Upload className="w-6 h-6 text-gray-400" />}
                      <span className="text-xs text-gray-500">PDF — 10 Mo max</span>
                      <input type="file" accept=".pdf" className="hidden" onChange={e => handlePdfUpload(e, 'cv_plaquette_url')} disabled={uploading !== null} />
                    </label>
                  )}
                </div>
                <div className="border border-border rounded-xl p-4">
                  <h4 className="font-medium text-text-primary text-xs mb-1">Dossier de capacités</h4>
                  <p className="text-[10px] text-text-secondary mb-3">Moyens techniques et humains (DC2)</p>
                  {(profile as any).dossier_capacites_url ? (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <FileText className="w-4 h-4 text-green-600 shrink-0" />
                      <a href={(profile as any).dossier_capacites_url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline flex-1 truncate">Voir</a>
                      <button onClick={() => update('dossier_capacites_url' as keyof Profile, null)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-1 border-2 border-dashed border-gray-300 rounded-lg px-3 py-4 cursor-pointer hover:border-[#0000FF]/40 hover:bg-[#F5F5FF]/30 transition-colors">
                      {uploading === 'dossier_capacites_url' ? <Loader2 className="w-6 h-6 animate-spin text-[#0000FF]" /> : <Upload className="w-6 h-6 text-gray-400" />}
                      <span className="text-xs text-gray-500">PDF — 10 Mo max</span>
                      <input type="file" accept=".pdf" className="hidden" onChange={e => handlePdfUpload(e, 'dossier_capacites_url')} disabled={uploading !== null} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Onglet Positionnement */}
          {activeTab === 'positionnement' && (
            <div className="space-y-6">
              <div className="bg-[#F5F5FF] border border-[#0000FF]/10 rounded-xl p-4 mb-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-[#0000FF] font-medium flex items-center gap-2"><Sparkles className="w-4 h-4" /> Votre ADN, en quelques mots</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Ces textes alimentent le matching IA avec les appels d'offres et sont intégrés dans vos mémoires techniques.
                      Plus ils sont précis, meilleurs sont les résultats.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      setDeepResearchLoading(true)
                      try {
                        const res = await fetch('/api/profil/deep-research', { method: 'POST' })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
                        // Pré-remplir les champs — l'utilisateur vérifie et ajuste
                        if (data.activite_metier) update('activite_metier', data.activite_metier)
                        if (data.positionnement) update('positionnement', data.positionnement)
                        if (data.atouts_differenciants) update('atouts_differenciants' as keyof Profile, data.atouts_differenciants)
                        if (data.methodologie_type) update('methodologie_type' as keyof Profile, data.methodologie_type)
                        toast.success('Positionnement généré ! Vérifiez et ajustez les textes avant de sauvegarder.')
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'analyse. Réessayez.')
                      }
                      setDeepResearchLoading(false)
                    }}
                    disabled={deepResearchLoading}
                    className="flex items-center gap-2 bg-[#0000FF] hover:bg-[#0000CC] text-white rounded-lg px-4 py-2 text-xs font-medium transition-colors disabled:opacity-60 shrink-0"
                  >
                    {deepResearchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {deepResearchLoading ? 'Analyse en cours...' : 'Deep Research IA'}
                  </button>
                </div>
              </div>

              {/* Activité métier (déplacé ici depuis Veille BOAMP) */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Cœur de métier
                </label>
                <p className="text-xs text-text-secondary mb-2">
                  Description précise de votre activité. Ne mentionnez QUE ce que vous faites réellement — c'est le texte principal pour le matching IA.
                </p>
                <textarea
                  value={profile.activite_metier || ''}
                  onChange={e => update('activite_metier', e.target.value)}
                  rows={5}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="Ex: Agence de communication éditoriale spécialisée dans la production de contenus (articles, livres blancs, vidéos) pour le secteur public. Expertise en stratégie de communication, création multimédia et production audiovisuelle."
                />
                <p className="text-xs text-text-secondary mt-1">
                  {(profile.activite_metier || '').length} caractères — recommandé : 200 à 400 caractères
                </p>
              </div>

              {/* Philosophie & valeurs */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Philosophie & valeurs
                </label>
                <p className="text-xs text-text-secondary mb-2">
                  Quelles sont les valeurs qui guident votre travail ? Votre vision, votre engagement qualité ?
                </p>
                <textarea
                  value={profile.positionnement || ''}
                  onChange={e => update('positionnement', e.target.value)}
                  rows={5}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="Ex: Nous défendons une approche centrée sur la qualité et la proximité. Notre engagement : comprendre les besoins réels du terrain pour apporter des solutions durables et mesurables..."
                />
              </div>

              {/* Atouts différenciants */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Atouts différenciants
                </label>
                <p className="text-xs text-text-secondary mb-2">
                  Qu'est-ce qui vous distingue de vos concurrents ? Expertise rare, méthodologie propre, implantation géographique ?
                </p>
                <textarea
                  value={(profile as any).atouts_differenciants || ''}
                  onChange={e => update('atouts_differenciants' as keyof Profile, e.target.value)}
                  rows={4}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="Ex: 15 ans d'expérience exclusive dans le secteur public, une équipe 100% senior..."
                />
              </div>

              {/* Méthodologie type */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Méthodologie type
                </label>
                <p className="text-xs text-text-secondary mb-2">
                  Les grandes étapes de votre approche projet. Cette trame sera proposée pour vos mémoires techniques.
                </p>
                <textarea
                  value={(profile as any).methodologie_type || ''}
                  onChange={e => update('methodologie_type' as keyof Profile, e.target.value)}
                  rows={5}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="Ex: 1) Phase de cadrage et audit — 2) Proposition stratégique — 3) Production et itérations — 4) Livraison et suivi..."
                />
              </div>
            </div>
          )}

          {/* Onglet Veille BOAMP */}
          {activeTab === 'veille-boamp' && (
            <div className="space-y-8">
              {/* Type de marché */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-text-primary">
                    Types de marchés recherchés
                  </label>
                </div>
                <p className="text-xs text-text-secondary mb-3">
                  Sélectionnez les types de marchés qui correspondent à votre activité.
                  Les annonces des autres types seront masquées de votre veille.
                </p>
                <div className="flex gap-3">
                  {['SERVICES', 'FOURNITURES', 'TRAVAUX'].map(type => {
                    const checked = (profile.types_marche_filtres || []).includes(type)
                    const labels: Record<string, string> = { SERVICES: '🎯 Services', FOURNITURES: '📦 Fournitures', TRAVAUX: '🏗️ Travaux' }
                    const descriptions: Record<string, string> = {
                      SERVICES: 'Prestations intellectuelles, conseil, communication, IT...',
                      FOURNITURES: 'Achat de matériels, équipements, consommables...',
                      TRAVAUX: 'Construction, rénovation, aménagement...',
                    }
                    return (
                      <label
                        key={type}
                        className={cn(
                          'flex-1 flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border cursor-pointer transition-colors text-center',
                          checked ? 'border-primary bg-primary-light text-primary' : 'border-border hover:bg-surface text-text-primary'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const current = profile.types_marche_filtres || []
                            update('types_marche_filtres', e.target.checked
                              ? [...current, type]
                              : current.filter(t => t !== type)
                            )
                          }}
                          className="accent-primary"
                        />
                        <span className="text-sm font-medium">{labels[type]}</span>
                        <span className="text-[10px] text-text-secondary leading-tight">{descriptions[type]}</span>
                      </label>
                    )
                  })}
                </div>
                {(profile.types_marche_filtres || []).length === 0 && (
                  <p className="text-xs text-amber-600 mt-2">⚠️ Aucun type sélectionné — tous les types seront affichés (y compris travaux et fournitures)</p>
                )}
              </div>

              {/* Codes BOAMP */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-text-primary">
                    Codes thématiques BOAMP
                  </label>
                  {(profile.boamp_codes || []).length > 0 && (
                    <span className="text-xs bg-primary-light text-primary px-2 py-0.5 rounded-full font-medium">
                      {(profile.boamp_codes || []).length} sélectionné{(profile.boamp_codes || []).length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary mb-4">
                  Sélectionnez les codes thématiques correspondant à vos domaines d'activité.
                  Seules les annonces portant au moins un de ces codes seront affichées dans la Veille BOAMP.
                </p>
                <div className="space-y-5">
                  {BOAMP_CATEGORIES.map(categorie => {
                    const codesInCat = BOAMP_CODES.filter(c => c.categorie === categorie)
                    return (
                      <div key={categorie}>
                        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">{categorie}</p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {codesInCat.map(bc => {
                            const checked = (profile.boamp_codes || []).includes(bc.code)
                            return (
                              <label
                                key={bc.code}
                                className={cn(
                                  'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors text-sm',
                                  checked ? 'border-primary bg-primary-light text-primary' : 'border-border hover:bg-surface text-text-primary'
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={e => {
                                    const codes = profile.boamp_codes || []
                                    update('boamp_codes', e.target.checked
                                      ? [...codes, bc.code]
                                      : codes.filter(c => c !== bc.code)
                                    )
                                  }}
                                  className="accent-primary shrink-0"
                                />
                                <span className="font-mono text-xs text-text-secondary w-8 shrink-0">{bc.code}</span>
                                <span>{bc.libelle}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
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
