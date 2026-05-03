/**
 * Website Fetcher — récupère le HTML de la home + page about d'un site web,
 * extrait le texte propre (sans nav/footer/script) et les meta.
 *
 * Volontairement minimaliste pour la v1 :
 *   - 1 fetch home + 1 fetch /about (ou équivalent FR)
 *   - Pas de Playwright (sites JS-only ne marcheront pas — fallback sur web search)
 *   - Cap à ~5000 caractères concaténés (pour ne pas exploser le prompt Claude)
 *   - Timeout 8s par page
 *
 * Si le site est inaccessible ou JS-only, retourne null. Le synthesizer
 * compose alors avec LinkedIn + recherche web seulement.
 */

import type { RawWebsiteData } from './types'

const FETCH_TIMEOUT_MS = 8_000
const MAX_CONTENT_CHARS = 5_000
const USER_AGENT = 'Mozilla/5.0 (compatible; LADN-AOP-Bot/1.0; +https://aop-staging.vercel.app)'

/** Pages "about" candidates à tester (FR + EN, prioritaires en premier). */
const ABOUT_PATHS = ['/a-propos', '/about', '/qui-sommes-nous', '/notre-equipe', '/equipe', '/about-us']

/** Extrait du <head> et du <body> : title, description, texte sans tags. */
function extractFromHtml(html: string): { title?: string; description?: string; textContent: string } {
  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ')

  // Meta description
  const descMatch = html.match(/<meta\s+(?:[^>]*?\s+)?name=["']description["']\s+content=["']([^"']+)["']/i)
    ?? html.match(/<meta\s+(?:[^>]*?\s+)?content=["']([^"']+)["']\s+name=["']description["']/i)
  const description = descMatch?.[1]?.trim()

  // Strip script/style/noscript/svg
  let body = html.replace(/<(?:script|style|noscript|svg|iframe)[\s\S]*?<\/(?:script|style|noscript|svg|iframe)>/gi, ' ')
  // Strip nav/header/footer (souvent peu informatif)
  body = body.replace(/<(?:nav|header|footer)[\s\S]*?<\/(?:nav|header|footer)>/gi, ' ')
  // Strip all remaining tags
  body = body.replace(/<[^>]+>/g, ' ')
  // Decode common entities
  body = body
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
  // Normalize whitespace
  body = body.replace(/\s+/g, ' ').trim()

  return { title, description, textContent: body }
}

async function fetchPage(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
      signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null
    const html = await res.text()
    return html
  } catch {
    return null
  }
}

/**
 * Normalise une URL : ajoute https:// si manquant, supprime trailing slash.
 * Retourne null si l'URL est syntaxiquement invalide.
 */
function normalizeUrl(input: string): string | null {
  let url = input.trim()
  if (!url) return null
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  try {
    const u = new URL(url)
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/**
 * Fetch le site web : home + tentative /about. Concatène le texte utile.
 */
export async function fetchWebsite(
  websiteUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<RawWebsiteData | null> {
  const baseUrl = normalizeUrl(websiteUrl)
  if (!baseUrl) {
    console.warn('[website-fetcher] URL invalide :', websiteUrl)
    return null
  }

  const homeHtml = await fetchPage(baseUrl, options.signal)
  if (!homeHtml) {
    console.warn('[website-fetcher] home inaccessible :', baseUrl)
    return null
  }

  const home = extractFromHtml(homeHtml)
  let combinedText = home.textContent
  const pagesExplored = [baseUrl]

  // Tentative page about (sans bloquer si échec)
  for (const path of ABOUT_PATHS) {
    if (combinedText.length >= MAX_CONTENT_CHARS) break
    const aboutUrl = baseUrl + path
    const aboutHtml = await fetchPage(aboutUrl, options.signal)
    if (aboutHtml) {
      const aboutText = extractFromHtml(aboutHtml).textContent
      if (aboutText && aboutText.length > 200) {
        combinedText += '\n\n[Page ' + path + '] ' + aboutText
        pagesExplored.push(aboutUrl)
        break // Une page about suffit
      }
    }
  }

  // Tronque proprement à MAX_CONTENT_CHARS
  if (combinedText.length > MAX_CONTENT_CHARS) {
    combinedText = combinedText.slice(0, MAX_CONTENT_CHARS) + '…'
  }

  return {
    url: baseUrl,
    title: home.title,
    description: home.description,
    text_content: combinedText,
    pages_explored: pagesExplored,
  }
}
