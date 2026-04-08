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

    // Vérifier que le profil a été trouvé
    if (p.error) {
      return NextResponse.json({ error: 'Profil LinkedIn introuvable ou privé. Vérifiez l\'URL.' }, { status: 404 })
    }

    // ── Extraction des champs (format dev_fusion) ──────────────────────────
    const firstName = p.firstName || ''
    const lastName = p.lastName || ''
    const headline = p.headline || ''
    const about = p.about || ''
    const location = p.addressWithCountry || p.addressWithoutCountry || ''

    // ── Expériences ────────────────────────────────────────────────────────
    const experiences: any[] = p.experiences || []
    const currentPositions = experiences.filter((e: any) => e.jobStillWorking)
    const mainPosition = currentPositions[0] || experiences[0]
    const poste = mainPosition?.title || p.jobTitle || ''
    const company = mainPosition?.companyName || p.companyName || ''
    const companyIndustry = mainPosition?.companyIndustry || p.companyIndustry || ''

    // Années d'expérience : préférer le champ calculé par Apify
    const totalYears = p.totalExperienceYears
      ? Math.round(p.totalExperienceYears)
      : (() => {
          const currentYear = new Date().getFullYear()
          let years = 0
          for (const exp of experiences) {
            const start = parseInt(exp.jobStartedOn)
            const end = exp.jobEndedOn ? parseInt(exp.jobEndedOn) : currentYear
            if (start) years += (end - start)
          }
          return years
        })()

    // ── Compétences (skills) ───────────────────────────────────────────────
    const rawSkills: any[] = p.skills || []
    const allSkills = rawSkills
      .map((s: any) => typeof s === 'string' ? s : s.title || s.name || '')
      .filter(Boolean)

    // Déduire des compétences métier à partir des postes et industries
    const derivedSkills: string[] = []
    // Extraire des mots-clés des titres de poste
    const allTitles = experiences.map((e: any) => e.title || '').filter(Boolean)
    for (const title of allTitles) {
      // Prendre les titres de postes courants comme compétences
      const keywords = title.split(/[\s,/—–-]+/).filter((w: string) => w.length > 3)
      derivedSkills.push(...keywords.slice(0, 2))
    }
    // Extraire des industries
    const industries = [...new Set(experiences.map((e: any) => e.companyIndustry).filter(Boolean))]

    // Combiner : skills LinkedIn en priorité, puis dérivés, dédupliqués
    const seenSkills = new Set<string>()
    const competences: string[] = []
    for (const s of [...allSkills, ...derivedSkills]) {
      const lower = s.toLowerCase()
      if (!seenSkills.has(lower) && lower.length > 2) {
        seenSkills.add(lower)
        competences.push(s)
      }
      if (competences.length >= 15) break
    }

    // ── Formation / diplômes ───────────────────────────────────────────────
    const educations: any[] = p.educations || p.education || []
    const diplomes = educations.map((e: any) => {
      const parts = []
      if (e.degree || e.degreeName || e.fieldOfStudy) {
        parts.push([e.degree || e.degreeName, e.fieldOfStudy].filter(Boolean).join(' en '))
      }
      if (e.schoolName || e.school || e.institution) {
        parts.push(e.schoolName || e.school || e.institution)
      }
      if (e.startYear && e.endYear) parts.push(`(${e.startYear}-${e.endYear})`)
      return parts.join(' — ')
    }).filter(Boolean)

    // ── Certifications ─────────────────────────────────────────────────────
    const certs: any[] = p.certifications || []
    const certNames = certs.map((c: any) => c.name || c.title || '').filter(Boolean)

    // ── Langues ────────────────────────────────────────────────────────────
    const languages: any[] = p.languages || []
    const langNames = languages.map((l: any) => {
      const name = l.name || l.language || ''
      const prof = l.proficiency ? ` (${l.proficiency})` : ''
      return name + prof
    }).filter(Boolean)

    // ── Construction de la BIO détaillée ───────────────────────────────────
    const bioParts: string[] = []

    // 1. Introduction avec poste actuel
    if (firstName && lastName) {
      if (poste && company) {
        bioParts.push(`${firstName} ${lastName} est actuellement ${poste} chez ${company}${companyIndustry ? ` (secteur : ${companyIndustry})` : ''}.`)
      } else if (poste) {
        bioParts.push(`${firstName} ${lastName} occupe le poste de ${poste}.`)
      } else {
        bioParts.push(`${firstName} ${lastName}.`)
      }
    }

    // 2. Si plusieurs postes actuels
    if (currentPositions.length > 1) {
      const others = currentPositions.slice(1).map((e: any) =>
        `${e.title}${e.companyName ? ' chez ' + e.companyName : ''}`
      ).join(', ')
      bioParts.push(`Également ${others}.`)
    }

    // 3. Headline si différent du poste
    if (headline && headline !== poste && headline !== `${poste} chez ${company}`) {
      bioParts.push(`Profil : ${headline}.`)
    }

    // 4. Expérience totale
    if (totalYears > 0) {
      bioParts.push(`Professionnel fort de ${totalYears} années d'expérience.`)
    }

    // 5. Localisation
    if (location) {
      bioParts.push(`Basé(e) à ${location}.`)
    }

    // 6. Parcours professionnel (postes précédents, jusqu'à 5)
    const pastExps = experiences.filter((e: any) => !e.jobStillWorking).slice(0, 5)
    if (pastExps.length > 0) {
      const parcoursList = pastExps.map((e: any) => {
        const years = e.jobStartedOn && e.jobEndedOn ? ` (${e.jobStartedOn}-${e.jobEndedOn})` : ''
        return `${e.title || 'Poste'}${e.companyName ? ' chez ' + e.companyName : ''}${years}`
      })
      bioParts.push(`Parcours professionnel : ${parcoursList.join(' ; ')}.`)
    }

    // 7. Formation
    if (diplomes.length > 0) {
      bioParts.push(`Formation : ${diplomes.slice(0, 3).join(' ; ')}.`)
    }

    // 8. Certifications
    if (certNames.length > 0) {
      bioParts.push(`Certifications : ${certNames.slice(0, 5).join(', ')}.`)
    }

    // 9. Compétences
    if (competences.length > 0) {
      bioParts.push(`Compétences clés : ${competences.slice(0, 8).join(', ')}.`)
    }

    // 10. Langues
    if (langNames.length > 0) {
      bioParts.push(`Langues : ${langNames.join(', ')}.`)
    }

    // 11. Secteurs d'activité traversés
    if (industries.length > 1) {
      bioParts.push(`Secteurs d'activité : ${industries.slice(0, 5).join(', ')}.`)
    }

    // 12. About LinkedIn (résumé personnel) — intégralement si < 500 chars
    if (about) {
      const cleanAbout = about.replace(/\n+/g, ' ').trim()
      if (cleanAbout.length <= 500) {
        bioParts.push(`En résumé : ${cleanAbout}`)
      } else {
        bioParts.push(`En résumé : ${cleanAbout.substring(0, 500).trim()}…`)
      }
    }

    const bio = bioParts.join('\n')

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
