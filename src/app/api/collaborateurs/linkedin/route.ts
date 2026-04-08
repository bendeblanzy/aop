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
    // Appel synchrone Apify — run + attente résultat
    const actorId = 'curious_coder~linkedin-profile-scraper'
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`

    const res = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [linkedinUrl],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[linkedin] Apify error:', res.status, errText)
      return NextResponse.json({ error: 'Erreur Apify' }, { status: 502 })
    }

    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'Profil non trouvé ou privé' }, { status: 404 })
    }

    const p = data[0]

    // Extraire les champs utiles
    const firstName = p.firstName || p.first_name || ''
    const lastName = p.lastName || p.last_name || ''
    const headline = p.headline || p.title || ''
    const summary = p.summary || p.about || ''

    // Expériences → poste actuel + années d'expérience
    const experiences = p.experiences || p.experience || p.positions || []
    const currentPosition = experiences.find((e: any) => e.current || !e.end || !e.endDate) || experiences[0]
    const poste = currentPosition?.title || headline || ''
    const company = currentPosition?.company || currentPosition?.companyName || ''

    // Calculer années d'expérience totales
    let totalYears = 0
    for (const exp of experiences) {
      const start = exp.startYear || exp.start?.year
      const end = exp.endYear || exp.end?.year || new Date().getFullYear()
      if (start) totalYears += (end - start)
    }

    // Compétences
    const skills = p.skills || []
    const competences = skills.map((s: any) => typeof s === 'string' ? s : s.name || s.skill || '').filter(Boolean).slice(0, 15)

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
      summary,
      company,
      linkedin_url: linkedinUrl,
    })
  } catch (e) {
    console.error('[linkedin] error:', e)
    return NextResponse.json({ error: 'Erreur lors du scraping LinkedIn' }, { status: 500 })
  }
}
