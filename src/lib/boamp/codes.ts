// Référentiel des codes descripteurs BOAMP — version 2026-04-27
//
// IMPORTANT : ce référentiel a été RECONSTRUIT empiriquement par sampling de
// la base de tenders réelle (audit 2026-04-27). La version précédente était
// massivement incorrecte (ex: code 222 documenté "Conseil transfo numérique"
// désignait en réalité des travaux de bâtiment dans BOAMP).
//
// Méthode : pour chaque code, on a échantillonné 5 objets de tenders qui le
// portent et on a inféré le libellé réel. Confiance variable mais bien meilleure
// que la version précédente.
//
// Note : ces codes ne sont PAS un filtre dur (depuis l'audit du 2026-04-27, ils
// servent de BOOST côté JS dans `/api/veille/tenders`). Inutile donc d'avoir un
// référentiel exhaustif — on couvre les ~70 codes les plus fréquents en base.

export interface BoampCode {
  code: string
  libelle: string
  categorie: string
}

export const BOAMP_CODES: BoampCode[] = [
  // ── Communication / Création / Audiovisuel ──────────────────────────────────
  { code: '285', libelle: 'Publicité, communication, marketing', categorie: 'Communication' },
  { code: '160', libelle: 'Imprimerie, reprographie, supports de communication', categorie: 'Communication' },
  { code: '161', libelle: 'Impression, façonnage, documents imprimés', categorie: 'Communication' },
  { code: '362', libelle: 'Production audiovisuelle, vidéo, contenus', categorie: 'Communication' },
  { code: '22', libelle: 'Audiovisuel : équipements, tournage, post-production', categorie: 'Communication' },
  { code: '324', libelle: 'Sonorisation, événementiel, animations culturelles', categorie: 'Communication' },
  { code: '171', libelle: 'Web, sites internet, plateformes, extranet', categorie: 'Communication' },
  { code: '471', libelle: 'Enquêtes, sondages, études sociologiques', categorie: 'Communication' },

  // ── Formation / Études / Conseil ────────────────────────────────────────────
  { code: '410', libelle: 'Formation professionnelle', categorie: 'Formation' },
  { code: '21', libelle: 'Audits, études, évaluation qualité', categorie: 'Conseil' },
  { code: '274', libelle: 'Prestations intellectuelles, services divers', categorie: 'Conseil' },

  // ── Numérique / IT ──────────────────────────────────────────────────────────
  { code: '163', libelle: 'Informatique, systèmes d\'information, prestations intellectuelles SI', categorie: 'Numérique' },
  { code: '162', libelle: 'Matériel informatique, ordinateurs, périphériques', categorie: 'Numérique' },
  { code: '186', libelle: 'Logiciel, SaaS, plateforme applicative', categorie: 'Numérique' },
  { code: '454', libelle: 'Maintenance logicielle, infogérance, téléphonie', categorie: 'Numérique' },
  { code: '453', libelle: 'Helpdesk, support informatique, infrastructure', categorie: 'Numérique' },

  // ── Travaux / Bâtiment ──────────────────────────────────────────────────────
  { code: '105', libelle: 'Travaux de rénovation et de réhabilitation de bâtiment', categorie: 'BTP' },
  { code: '33', libelle: 'Travaux gros œuvre, structure, étanchéité', categorie: 'BTP' },
  { code: '63', libelle: 'Travaux de bâtiment (général)', categorie: 'BTP' },
  { code: '61', libelle: 'Travaux de bâtiment, réaménagement de locaux', categorie: 'BTP' },
  { code: '144', libelle: 'Travaux structure, façades, équipements scolaires', categorie: 'BTP' },
  { code: '264', libelle: 'Travaux d\'aménagement, extension, réfection', categorie: 'BTP' },
  { code: '270', libelle: 'Travaux de bâtiment, réfection, réhabilitation', categorie: 'BTP' },
  { code: '345', libelle: 'Travaux de bâtiment, mise aux normes', categorie: 'BTP' },
  { code: '308', libelle: 'Aménagement de bâtiment, locaux', categorie: 'BTP' },
  { code: '360', libelle: 'Aménagement et réhabilitation de bâtiment', categorie: 'BTP' },
  { code: '222', libelle: 'Travaux de rénovation, réhabilitation, menuiseries', categorie: 'BTP' },
  { code: '479', libelle: 'Désamiantage, démolition', categorie: 'BTP' },
  { code: '74', libelle: 'Travaux de couverture, charpente, toiture', categorie: 'BTP' },
  { code: '57', libelle: 'Travaux de couverture, charpente', categorie: 'BTP' },
  { code: '117', libelle: 'Étanchéité, isolation thermique', categorie: 'BTP' },
  { code: '169', libelle: 'Travaux d\'amélioration énergétique', categorie: 'BTP' },
  { code: '87', libelle: 'Travaux de bâtiment divers', categorie: 'BTP' },
  { code: '195', libelle: 'Travaux de rénovation, restauration', categorie: 'BTP' },
  { code: '24', libelle: 'Désamiantage, traitement déchets amiante', categorie: 'BTP' },
  { code: '27', libelle: 'Bâtiments modulaires, constructions temporaires', categorie: 'BTP' },
  { code: '232', libelle: 'Travaux acoustiques, écrans phoniques', categorie: 'BTP' },
  { code: '197', libelle: 'Maîtrise d\'œuvre (travaux)', categorie: 'BTP' },
  { code: '433', libelle: 'Assistance à maîtrise d\'ouvrage, MOE travaux', categorie: 'BTP' },
  { code: '455', libelle: 'Maîtrise d\'œuvre, AMO travaux', categorie: 'BTP' },
  { code: '19', libelle: 'AMO, assistance technique', categorie: 'BTP' },
  { code: '72', libelle: 'Contrôle technique, CSPS', categorie: 'BTP' },

  // ── Voirie / VRD / Ouvrages d'art ───────────────────────────────────────────
  { code: '118', libelle: 'Études techniques, ingénierie, bureaux d\'études', categorie: 'BTP' },
  { code: '366', libelle: 'Travaux VRD, voirie réseaux divers', categorie: 'BTP' },
  { code: '341', libelle: 'Travaux de voirie, chaussées, ouvrages d\'art', categorie: 'BTP' },
  { code: '365', libelle: 'Travaux d\'aménagement urbain, voirie cyclable', categorie: 'BTP' },
  { code: '253', libelle: 'Aménagement urbain, voirie', categorie: 'BTP' },
  { code: '252', libelle: 'Ouvrages d\'art, ponts, viaducs', categorie: 'BTP' },
  { code: '102', libelle: 'Éclairage public et sportif', categorie: 'BTP' },
  { code: '49', libelle: 'Matériel d\'éclairage public', categorie: 'BTP' },
  { code: '31', libelle: 'Barrages, ouvrages hydrauliques', categorie: 'BTP' },

  // ── Eau / Assainissement ────────────────────────────────────────────────────
  { code: '6', libelle: 'Eau potable, AEP', categorie: 'Environnement' },
  { code: '18', libelle: 'Assainissement, eaux usées', categorie: 'Environnement' },
  { code: '48', libelle: 'Canalisations eau, AEP, EU', categorie: 'Environnement' },
  { code: '306', libelle: 'Réseaux d\'assainissement, curage', categorie: 'Environnement' },
  { code: '28', libelle: 'Bassins, étanchéité, ouvrages hydrauliques', categorie: 'Environnement' },

  // ── Environnement / Espaces verts ───────────────────────────────────────────
  { code: '116', libelle: 'Espaces verts, environnement, agriculture', categorie: 'Environnement' },
  { code: '404', libelle: 'Gestion des déchets, collecte, traitement', categorie: 'Environnement' },
  { code: '34', libelle: 'Bennes, conteneurs, déchets', categorie: 'Environnement' },
  { code: '35', libelle: 'Berges, cours d\'eau, débroussaillage', categorie: 'Environnement' },
  { code: '38', libelle: 'Bois, forestier, mobilier extérieur', categorie: 'Environnement' },

  // ── CVC / Énergie ───────────────────────────────────────────────────────────
  { code: '59', libelle: 'Chauffage, génie climatique, ventilation', categorie: 'Énergie' },
  { code: '62', libelle: 'Climatisation, traitement air', categorie: 'Énergie' },
  { code: '452', libelle: 'Réseaux de chaleur, géothermie', categorie: 'Énergie' },

  // ── Maintenance / Sécurité ──────────────────────────────────────────────────
  { code: '196', libelle: 'Maintenance multitechnique, exploitation', categorie: 'Maintenance' },
  { code: '17', libelle: 'Ascenseurs, élévateurs', categorie: 'Maintenance' },
  { code: '332', libelle: 'Sécurité incendie, SSI, désenfumage', categorie: 'Sécurité' },
  { code: '5', libelle: 'Alarmes, vidéoprotection, contrôle accès', categorie: 'Sécurité' },
  { code: '138', libelle: 'Sécurité, gardiennage, surveillance', categorie: 'Sécurité' },
  { code: '331', libelle: 'Surveillance, accueil périscolaire, sécurité événementielle', categorie: 'Sécurité' },

  // ── Transport / Mobilité ────────────────────────────────────────────────────
  { code: '347', libelle: 'Transport (collectif, sanitaire, élèves, fonds)', categorie: 'Transport' },
  { code: '359', libelle: 'Véhicules, automobile, location, maintenance', categorie: 'Transport' },
  { code: '475', libelle: 'Véhicules utilitaires, BOM, matériel roulant', categorie: 'Transport' },

  // ── Restauration / Alimentation ─────────────────────────────────────────────
  { code: '66', libelle: 'Restauration scolaire, denrées', categorie: 'Restauration' },
  { code: '88', libelle: 'Denrées alimentaires (viandes, pains, fournitures)', categorie: 'Restauration' },
  { code: '304', libelle: 'Repas en liaison froide, traiteur', categorie: 'Restauration' },
  { code: '32', libelle: 'Emballages alimentaires, barquettes', categorie: 'Restauration' },
  { code: '39', libelle: 'Boissons, fontaines à eau', categorie: 'Restauration' },

  // ── Fournitures diverses ────────────────────────────────────────────────────
  { code: '115', libelle: 'EPI, vêtements de travail', categorie: 'Fournitures' },
  { code: '230', libelle: 'Mobilier, équipement intérieur', categorie: 'Fournitures' },
  { code: '203', libelle: 'Fournitures, matériels, électricité', categorie: 'Fournitures' },
  { code: '36', libelle: 'Blanchisserie, lavage textile', categorie: 'Fournitures' },
  { code: '185', libelle: 'Locations diverses (mobilier, photocopieurs)', categorie: 'Fournitures' },
  { code: '46', libelle: 'Peinture, carrosserie, cabines', categorie: 'Fournitures' },

  // ── Services généraux ───────────────────────────────────────────────────────
  { code: '239', libelle: 'Nettoyage, propreté, entretien locaux', categorie: 'Services' },
  { code: '20', libelle: 'Assurances, conseil assurance', categorie: 'Services' },
  { code: '41', libelle: 'Courrier, distribution, gestion administrative', categorie: 'Services' },
]

export const BOAMP_CATEGORIES = [...new Set(BOAMP_CODES.map(c => c.categorie))]

export function getLibelleForCode(code: string): string {
  return BOAMP_CODES.find(c => c.code === code)?.libelle ?? code
}

export function getCategorieForCode(code: string): string | null {
  return BOAMP_CODES.find(c => c.code === code)?.categorie ?? null
}
