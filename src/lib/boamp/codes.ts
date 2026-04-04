// Liste des codes descripteurs BOAMP
// Source: référentiel BOAMP (codes thématiques, distincts des codes CPV)

export interface BoampCode {
  code: string
  libelle: string
  categorie: string
}

export const BOAMP_CODES: BoampCode[] = [
  // Communication & Marketing
  { code: '285', libelle: 'Publicité, communication, marketing', categorie: 'Communication' },
  { code: '286', libelle: 'Relations publiques, communication interne', categorie: 'Communication' },
  { code: '287', libelle: 'Événementiel, organisation de manifestations', categorie: 'Communication' },
  { code: '288', libelle: 'Stratégie de communication', categorie: 'Communication' },
  { code: '445', libelle: 'Audiovisuel, production, diffusion, médias', categorie: 'Communication' },
  { code: '446', libelle: 'Multimédia, internet, web', categorie: 'Communication' },
  { code: '447', libelle: 'Presse, édition', categorie: 'Communication' },
  { code: '448', libelle: 'Graphisme, design, identité visuelle', categorie: 'Communication' },
  { code: '449', libelle: 'Photographie', categorie: 'Communication' },
  { code: '75', libelle: 'Imprimerie, reprographie', categorie: 'Communication' },

  // Conseil & Management
  { code: '22', libelle: 'Conseil, organisation, management', categorie: 'Conseil' },
  { code: '221', libelle: 'Conseil en stratégie', categorie: 'Conseil' },
  { code: '222', libelle: 'Conseil en transformation numérique', categorie: 'Conseil' },
  { code: '74', libelle: 'Services juridiques, notariaux', categorie: 'Conseil' },

  // Formation & RH
  { code: '23', libelle: 'Formation professionnelle', categorie: 'Formation' },
  { code: '232', libelle: 'Conseil RH, recrutement', categorie: 'Formation' },

  // Informatique & Numérique
  { code: '45', libelle: 'Informatique, systèmes d\'information', categorie: 'Numérique' },
  { code: '451', libelle: 'Développement logiciel, applications', categorie: 'Numérique' },
  { code: '452', libelle: 'Infrastructure, réseaux, télécommunications', categorie: 'Numérique' },
  { code: '453', libelle: 'Cybersécurité', categorie: 'Numérique' },
  { code: '454', libelle: 'Intelligence artificielle, data science', categorie: 'Numérique' },

  // BTP & Travaux
  { code: '52', libelle: 'Travaux publics, génie civil', categorie: 'BTP' },
  { code: '60', libelle: 'Bâtiment, construction', categorie: 'BTP' },
  { code: '601', libelle: 'Gros œuvre, maçonnerie', categorie: 'BTP' },
  { code: '602', libelle: 'Second œuvre, finitions', categorie: 'BTP' },
  { code: '61', libelle: 'Architecture, maîtrise d\'œuvre', categorie: 'BTP' },

  // Environnement & Énergie
  { code: '62', libelle: 'Eau, assainissement', categorie: 'Environnement' },
  { code: '65', libelle: 'Énergie, électricité, gaz', categorie: 'Environnement' },
  { code: '66', libelle: 'Environnement, déchets, recyclage', categorie: 'Environnement' },

  // Services généraux
  { code: '25', libelle: 'Nettoyage, entretien, propreté', categorie: 'Services' },
  { code: '35', libelle: 'Transport, logistique', categorie: 'Services' },
  { code: '30', libelle: 'Santé, médical, paramédical', categorie: 'Services' },
  { code: '55', libelle: 'Restauration, traiteur, hôtellerie', categorie: 'Services' },
  { code: '38', libelle: 'Sécurité, gardiennage, surveillance', categorie: 'Services' },
  { code: '80', libelle: 'Documentation, archives, bibliothèques', categorie: 'Services' },
  { code: '42', libelle: 'Études et recherche', categorie: 'Services' },
]

export const BOAMP_CATEGORIES = [...new Set(BOAMP_CODES.map(c => c.categorie))]

export function getLibelleForCode(code: string): string {
  return BOAMP_CODES.find(c => c.code === code)?.libelle ?? code
}
