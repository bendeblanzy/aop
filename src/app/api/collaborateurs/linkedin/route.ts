import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgIdForUser } from '@/lib/supabase/admin'

const APIFY_TOKEN = process.env.APIFY_API_TOKEN

/**
 * POST /api/collaborateurs/linkedin
 * Scrape un profil LinkedIn via Apify et retourne les infos structurées.
 * Body: { linkedin_url: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  if (!APIFY_TOKEN) {
    return NextResponse.json({ error: 'Apify API token not configured' }, { status: 500 })
  }

  let linkedinUrl: string
  try {
    const body = await request.json()
    linkedinUrl = body.linkedin_url?.trim()
    if (!linkedinUrl || !linkedinUrl.includes('linkedin.com/in/')) {
      return NextResponse.json({ error: 'URL LinkedIn invalide. Format attendu : https://www.linkedin.com/in/nom-prenom' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    // Appel synchrone Apify — dev_fusion (No Cookies required)
    const actorId = 'dev_fusion~Linkedin-Profile-Scraper'
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=60`

    const res = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileUrls: [linkedinUrl],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[linkedin] Apify error:', res.status, errText)
      return NextResponse.json({ error: 'Erreur Apify : ' + (res.status === 402 ? 'crédit Apify insuffisant' : 'profil inaccessible') }, { status: 502 })
    }

    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'Profil non trouvé ou privé' }, { status: 404 })
    }

    const p = data[0]

    // Extraire les champs (format dev_fusion)
    const firstName = p.firstName || ''
    const lastName = p.lastName || ''
    const headline = p.headline || ''
    const summary = p.about || ''

    // Expériences → poste actuel + années d'expérience
    const experiences = p.experiences || []
    const currentPosition = experiences.find((e: any) => e.jobStillWorking) || experiences[0]
    const poste = currentPosition?.title || p.jobTitle || ''
    const company = currentPosition?.companyName || p.companyName || ''

    // Calculer années d'expérience totales
    const currentYear = new Date().getFullYear()
    let totalYears = 0
    for (const exp of experiences) {
      const startYear = parseInt(exp.jobStartedOn)
      const endYear = exp.jobEndedOn ? parseInt(exp.jobEndedOn) : currentYear
      if (startYear) totalYears += (endYear - startYear)
    }

    // Compétences (topSkillsByEndorsements ou skills)
    const skills = p.topSkillsByEndorsements || p.skills || []
    const competences = (Array.isArray(skills) ? skills : [])
      .map((s: any) => typeof s === 'string' ? s : s.name || '')
      .filter(Boolean)
      .slice(0, 15)

    // Formation / diplômes
    const education = p.education || p.educations || []
    const diplomes = education.map((e: any) => {
      const parts = []
      if (e.degree || e.degreeName) parts.push(e.degree || e.degreeName)
      if (e.school || e.schoolName || e.institution) parts.push(e.school || e.schoolName || e.institution)
      return parts.join(' — ')
    }).filter(Boolean)

    // Certifications
    const certs = p.certifications || []
    const certNames = certs.map((c: any) => c.name || c.title || '').filter(Boolean)

    // Construire une bio descriptive à partir des données LinkedIn
    const bioParts: string[] = []
    if (firstName && lastName) {
      const intro = poste && company
        ? `${firstName} ${lastName} est ${poste} chez ${company}.`
        : poste
          ? `${firstName} ${lastName} occupe le poste de ${poste}.`
          : `${firstName} ${lastName}.`
      bioParts.push(intro)
    }
    if (totalYears > 0) {
      bioParts.push(`Fort${lastName ? '' : 'e'} de ${totalYears} années d'expérience professionnelle.`)
    }
    if (headline && headline !== poste) {
      bioParts.push(headline + '.')
    }
    // Parcours : dernières expériences significatives
    const pastExps = experiences.filter((e: any) => !e.jobStillWorking).slice(0, 3)
    if (pastExps.length > 0) {
      const parcours = pastExps.map((e: any) => `${e.title || 'Poste'}${e.companyName ? ' chez ' + e.companyName : ''}`).join(', ')
      bioParts.push(`Parcours : ${parcours}.`)
    }
    if (diplomes.length > 0) {
      bioParts.push(`Formation : ${diplomes.slice(0, 2).join(', ')}.`)
    }
    if (certNames.length > 0) {
      bioParts.push(`Certifications : ${certNames.slice(0, 3).join(', ')}.`)
    }
    if (competences.length > 0) {
      bioParts.push(`Compétences clés : ${competences.slice(0, 6).join(', ')}.`)
    }
    if (summary) {
      // Prendre les 200 premiers caractères du "about" LinkedIn
      const shortSummary = summary.length > 200 ? summary.substring(0, 200).trim() + '…' : summary
      bioParts.push(shortSummary)
    }
    const bio = bioParts.join(' ')

    return NextResponse.json({
      prenom: firstName,
      nom: lastName,
      poste,
      role_metier: headline,
      email: p.email || '',
      experience_annees: totalYears || undefined,
      competences_cles: competences,
      diplomes,
      certifications: certNames,
      bio,
      company,
      linkedin_url: linkedinUrl,
    })
  } catch (e) {
    console.error('[linkedin] error:', e)
    return NextResponse.json({ error: 'Erreur lors du scraping LinkedIn' }, { status: 500 })
  }
}
