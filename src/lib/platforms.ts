/**
 * Détection de la plateforme de dématérialisation à partir d'une URL BOAMP ou de la plateforme.
 */

export interface Platform {
  id: string
  name: string
  fullName: string
  /** URL de base pour construire les liens */
  baseUrl: string
  /** L'utilisateur doit-il créer un compte pour télécharger le DCE ? */
  requiresAccount: boolean
  /** La plateforme autorise-t-elle l'accès anonyme (téléchargement sans compte) ? */
  allowsAnonymous: boolean
  /** URL d'inscription */
  registerUrl: string
  /** URL de connexion */
  loginUrl: string
  /** Initiale pour le badge visuel */
  initial: string
}

const PLATFORMS: Platform[] = [
  {
    id: 'place',
    name: 'PLACE',
    fullName: 'marches-publics.gouv.fr',
    baseUrl: 'https://www.marches-publics.gouv.fr',
    requiresAccount: true,
    allowsAnonymous: false,
    registerUrl: 'https://www.marches-publics.gouv.fr/index.php?page=entreprise.EntrepriseIdentification&orgAcronyme=a4m',
    loginUrl: 'https://www.marches-publics.gouv.fr/index.php?page=entreprise.EntrepriseConnexion&orgAcronyme=a4m',
    initial: 'P',
  },
  {
    id: 'achatpublic',
    name: 'Achat Public',
    fullName: 'achatpublic.com',
    baseUrl: 'https://www.achatpublic.com',
    requiresAccount: false,
    allowsAnonymous: true,
    registerUrl: 'https://www.achatpublic.com/inscription',
    loginUrl: 'https://www.achatpublic.com/connexion',
    initial: 'A',
  },
  {
    id: 'aws',
    name: 'AWS Achat',
    fullName: 'aws-achat.com',
    baseUrl: 'https://www.aws-achat.com',
    requiresAccount: true,
    allowsAnonymous: false,
    registerUrl: 'https://www.aws-achat.com/index.php?page=entreprise.EntrepriseIdentification',
    loginUrl: 'https://www.aws-achat.com/index.php?page=entreprise.EntrepriseConnexion',
    initial: 'W',
  },
  {
    id: 'megalis',
    name: 'Mégalis',
    fullName: 'megalis.bretagne.bzh',
    baseUrl: 'https://marches.megalis.bretagne.bzh',
    requiresAccount: true,
    allowsAnonymous: false,
    registerUrl: 'https://marches.megalis.bretagne.bzh/index.php?page=entreprise.EntrepriseIdentification',
    loginUrl: 'https://marches.megalis.bretagne.bzh/index.php?page=entreprise.EntrepriseConnexion',
    initial: 'M',
  },
  {
    id: 'klekoon',
    name: 'Klekoon',
    fullName: 'klekoon.com',
    baseUrl: 'https://www.klekoon.com',
    requiresAccount: false,
    allowsAnonymous: true,
    registerUrl: 'https://www.klekoon.com/inscription',
    loginUrl: 'https://www.klekoon.com/connexion',
    initial: 'K',
  },
  {
    id: 'atexo',
    name: 'Atexo / e-marchespublics',
    fullName: 'e-marchespublics.com',
    baseUrl: 'https://www.e-marchespublics.com',
    requiresAccount: true,
    allowsAnonymous: false,
    registerUrl: 'https://www.e-marchespublics.com/inscription',
    loginUrl: 'https://www.e-marchespublics.com/connexion',
    initial: 'E',
  },
  {
    id: 'boamp',
    name: 'BOAMP',
    fullName: 'boamp.fr',
    baseUrl: 'https://www.boamp.fr',
    requiresAccount: false,
    allowsAnonymous: true,
    registerUrl: '',
    loginUrl: '',
    initial: 'B',
  },
]

const URL_PATTERNS: { pattern: RegExp; platformId: string }[] = [
  { pattern: /marches-publics\.gouv\.fr/i, platformId: 'place' },
  { pattern: /place\.gouv/i, platformId: 'place' },
  { pattern: /achatpublic\.(com|gouv)/i, platformId: 'achatpublic' },
  { pattern: /aws-achat\.com/i, platformId: 'aws' },
  { pattern: /megalis\.bretagne/i, platformId: 'megalis' },
  { pattern: /marches\.megalis/i, platformId: 'megalis' },
  { pattern: /klekoon\.com/i, platformId: 'klekoon' },
  { pattern: /e-marchespublics\.com/i, platformId: 'atexo' },
  { pattern: /boamp\.fr/i, platformId: 'boamp' },
]

/**
 * Détecte la plateforme depuis une URL.
 * Retourne null si aucune plateforme connue n'est détectée.
 */
export function detectPlatform(url: string | null | undefined): Platform | null {
  if (!url) return null
  for (const { pattern, platformId } of URL_PATTERNS) {
    if (pattern.test(url)) {
      return PLATFORMS.find(p => p.id === platformId) ?? null
    }
  }
  return null
}

/**
 * Retourne la plateforme PLACE (défaut pour les AOs nationaux depuis BOAMP).
 */
export function getDefaultPlatform(): Platform {
  return PLATFORMS.find(p => p.id === 'place')!
}
