// ─────────────────────────────────────────────────────────────────────────────
// PRADO — état de session pour les plateformes Atexo Local Trust MPE.
//
// Le moteur PHP PRADO stocke ~100 KB d'état dans un input caché
// `PRADO_PAGESTATE` qu'il faut récupérer page après page et renvoyer dans
// chaque POST. Sans ça, le serveur retourne soit la page d'accueil, soit une
// erreur 500.
//
// On gère aussi le cookie de session (`PHPSESSID`) qui est attribué dès le
// premier GET et doit être conservé pendant toute la session de scraping.
//
// Référence : github.com/michelbl/scraper-place/blob/master/scraper_place/fetch.py
// ─────────────────────────────────────────────────────────────────────────────

const PAGESTATE_RE = /name="PRADO_PAGESTATE"\s+id="PRADO_PAGESTATE"\s+value="([^"]+)"/i
const PAGESTATE_RE_LOOSE = /name="PRADO_PAGESTATE"[^>]*value="([^"]+)"/i

/** Extrait `PRADO_PAGESTATE` du HTML — null si introuvable. */
export function extractPradoPageState(html: string): string | null {
  const m1 = html.match(PAGESTATE_RE)
  if (m1) return m1[1]
  const m2 = html.match(PAGESTATE_RE_LOOSE)
  return m2 ? m2[1] : null
}

/** Extrait l'éventuel cookie `PHPSESSID` d'une réponse HTTP. */
export function extractSessionCookie(setCookieHeaders: string[] | string | null): string | null {
  if (!setCookieHeaders) return null
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]
  for (const raw of arr) {
    const m = raw.match(/(PHPSESSID=[^;]+)/i)
    if (m) return m[1]
  }
  return null
}

/**
 * Construit le body application/x-www-form-urlencoded pour un POSTback PRADO.
 *
 * `targetCtl` est l'identifiant de contrôle PRADO qui déclenche l'action
 * (ex. pour la pagination "page suivante" : `ctl0$CONTENU_PAGE$resultSearch$PagerTop$ctl2`).
 */
export function buildPradoPostbackBody(
  pageState: string,
  targetCtl: string,
  extraFields: Record<string, string> = {},
): string {
  const params = new URLSearchParams()
  params.set('PRADO_PAGESTATE', pageState)
  params.set('PRADO_POSTBACK_TARGET', targetCtl)
  params.set('PRADO_POSTBACK_PARAMETER', '')
  for (const [k, v] of Object.entries(extraFields)) params.set(k, v)
  return params.toString()
}

/** Headers HTTP standards pour les requêtes Atexo (mimer un navigateur). */
export function pradoHeaders(cookie: string | null, isPost = false): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (compatible; LADNDataAtexoScraper/1.0; +https://www.ladndata.fr/) '
      + 'Apify/Node atexo-mpe-scraper',
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
  }
  if (cookie) h['Cookie'] = cookie
  if (isPost) h['Content-Type'] = 'application/x-www-form-urlencoded'
  return h
}
