/**
 * Mapping département → région administrative française (réforme 2016)
 * 18 régions : 13 métropolitaines + 5 DROM
 */

export const REGIONS_FR = [
  'Auvergne-Rhône-Alpes',
  'Bourgogne-Franche-Comté',
  'Bretagne',
  'Centre-Val de Loire',
  'Corse',
  'Grand Est',
  'Hauts-de-France',
  'Île-de-France',
  'Normandie',
  'Nouvelle-Aquitaine',
  'Occitanie',
  'Pays de la Loire',
  'Provence-Alpes-Côte d\'Azur',
  'Guadeloupe',
  'Martinique',
  'Guyane',
  'La Réunion',
  'Mayotte',
] as const

export type RegionFR = typeof REGIONS_FR[number]

/** Mapping département (code) → région */
export const DEPT_TO_REGION: Record<string, RegionFR> = {
  // Auvergne-Rhône-Alpes
  '01': 'Auvergne-Rhône-Alpes',
  '03': 'Auvergne-Rhône-Alpes',
  '07': 'Auvergne-Rhône-Alpes',
  '15': 'Auvergne-Rhône-Alpes',
  '26': 'Auvergne-Rhône-Alpes',
  '38': 'Auvergne-Rhône-Alpes',
  '42': 'Auvergne-Rhône-Alpes',
  '43': 'Auvergne-Rhône-Alpes',
  '63': 'Auvergne-Rhône-Alpes',
  '69': 'Auvergne-Rhône-Alpes',
  '73': 'Auvergne-Rhône-Alpes',
  '74': 'Auvergne-Rhône-Alpes',
  // Bourgogne-Franche-Comté
  '21': 'Bourgogne-Franche-Comté',
  '25': 'Bourgogne-Franche-Comté',
  '39': 'Bourgogne-Franche-Comté',
  '58': 'Bourgogne-Franche-Comté',
  '70': 'Bourgogne-Franche-Comté',
  '71': 'Bourgogne-Franche-Comté',
  '89': 'Bourgogne-Franche-Comté',
  '90': 'Bourgogne-Franche-Comté',
  // Bretagne
  '22': 'Bretagne',
  '29': 'Bretagne',
  '35': 'Bretagne',
  '56': 'Bretagne',
  // Centre-Val de Loire
  '18': 'Centre-Val de Loire',
  '28': 'Centre-Val de Loire',
  '36': 'Centre-Val de Loire',
  '37': 'Centre-Val de Loire',
  '41': 'Centre-Val de Loire',
  '45': 'Centre-Val de Loire',
  // Corse
  '2A': 'Corse',
  '2B': 'Corse',
  // Grand Est
  '08': 'Grand Est',
  '10': 'Grand Est',
  '51': 'Grand Est',
  '52': 'Grand Est',
  '54': 'Grand Est',
  '55': 'Grand Est',
  '57': 'Grand Est',
  '67': 'Grand Est',
  '68': 'Grand Est',
  '88': 'Grand Est',
  // Hauts-de-France
  '02': 'Hauts-de-France',
  '59': 'Hauts-de-France',
  '60': 'Hauts-de-France',
  '62': 'Hauts-de-France',
  '80': 'Hauts-de-France',
  // Île-de-France
  '75': 'Île-de-France',
  '77': 'Île-de-France',
  '78': 'Île-de-France',
  '91': 'Île-de-France',
  '92': 'Île-de-France',
  '93': 'Île-de-France',
  '94': 'Île-de-France',
  '95': 'Île-de-France',
  // Normandie
  '14': 'Normandie',
  '27': 'Normandie',
  '50': 'Normandie',
  '61': 'Normandie',
  '76': 'Normandie',
  // Nouvelle-Aquitaine
  '16': 'Nouvelle-Aquitaine',
  '17': 'Nouvelle-Aquitaine',
  '19': 'Nouvelle-Aquitaine',
  '23': 'Nouvelle-Aquitaine',
  '24': 'Nouvelle-Aquitaine',
  '33': 'Nouvelle-Aquitaine',
  '40': 'Nouvelle-Aquitaine',
  '47': 'Nouvelle-Aquitaine',
  '64': 'Nouvelle-Aquitaine',
  '79': 'Nouvelle-Aquitaine',
  '86': 'Nouvelle-Aquitaine',
  '87': 'Nouvelle-Aquitaine',
  // Occitanie
  '09': 'Occitanie',
  '11': 'Occitanie',
  '12': 'Occitanie',
  '30': 'Occitanie',
  '31': 'Occitanie',
  '32': 'Occitanie',
  '34': 'Occitanie',
  '46': 'Occitanie',
  '48': 'Occitanie',
  '65': 'Occitanie',
  '66': 'Occitanie',
  '81': 'Occitanie',
  '82': 'Occitanie',
  // Pays de la Loire
  '44': 'Pays de la Loire',
  '49': 'Pays de la Loire',
  '53': 'Pays de la Loire',
  '72': 'Pays de la Loire',
  '85': 'Pays de la Loire',
  // Provence-Alpes-Côte d'Azur
  '04': 'Provence-Alpes-Côte d\'Azur',
  '05': 'Provence-Alpes-Côte d\'Azur',
  '06': 'Provence-Alpes-Côte d\'Azur',
  '13': 'Provence-Alpes-Côte d\'Azur',
  '83': 'Provence-Alpes-Côte d\'Azur',
  '84': 'Provence-Alpes-Côte d\'Azur',
  // DROM
  '971': 'Guadeloupe',
  '972': 'Martinique',
  '973': 'Guyane',
  '974': 'La Réunion',
  '976': 'Mayotte',
}

/** Mapping région → liste des codes département */
export const REGION_TO_DEPTS: Record<RegionFR, string[]> = Object.entries(DEPT_TO_REGION).reduce(
  (acc, [dept, region]) => {
    if (!acc[region]) acc[region] = []
    acc[region].push(dept)
    return acc
  },
  {} as Record<RegionFR, string[]>,
)

/**
 * Retourne les codes département correspondant à une région.
 * Retourne null si la région est inconnue.
 */
export function getDepartementsForRegion(region: string): string[] | null {
  return REGION_TO_DEPTS[region as RegionFR] ?? null
}

/**
 * Mapping des codes/alias `zone_intervention` (issus de l'onboarding) vers
 * les noms officiels de région utilisés par REGIONS_FR / DEPT_TO_REGION.
 * Permet de filtrer correctement quand `profiles.region` est NULL mais que
 * `profiles.zone_intervention` est renseigné.
 */
const ZONE_ALIAS_TO_REGION: Record<string, RegionFR> = {
  idf: 'Île-de-France',
  'ile-de-france': 'Île-de-France',
  'île-de-france': 'Île-de-France',
  ara: 'Auvergne-Rhône-Alpes',
  'auvergne-rhone-alpes': 'Auvergne-Rhône-Alpes',
  'auvergne-rhône-alpes': 'Auvergne-Rhône-Alpes',
  'bfc': 'Bourgogne-Franche-Comté',
  bretagne: 'Bretagne',
  cvl: 'Centre-Val de Loire',
  'centre-val-de-loire': 'Centre-Val de Loire',
  corse: 'Corse',
  'grand-est': 'Grand Est',
  'hauts-de-france': 'Hauts-de-France',
  hdf: 'Hauts-de-France',
  normandie: 'Normandie',
  'nouvelle-aquitaine': 'Nouvelle-Aquitaine',
  occitanie: 'Occitanie',
  'pays-de-la-loire': 'Pays de la Loire',
  pdl: 'Pays de la Loire',
  paca: 'Provence-Alpes-Côte d\'Azur',
  'provence-alpes-cote-d-azur': 'Provence-Alpes-Côte d\'Azur',
}

/**
 * Tente de mapper une valeur `zone_intervention` libre vers une région FR.
 * Retourne null si non reconnue (ex: "France entière", "Europe").
 */
export function normalizeZoneToRegion(zone: string | null | undefined): RegionFR | null {
  if (!zone) return null
  const key = zone.trim().toLowerCase()
  if (ZONE_ALIAS_TO_REGION[key]) return ZONE_ALIAS_TO_REGION[key]
  // Si la valeur est déjà un nom de région valide, on la retourne telle quelle
  if ((REGIONS_FR as readonly string[]).includes(zone)) return zone as RegionFR
  return null
}

/**
 * Retourne la région pour un code département.
 */
export function getRegionForDept(dept: string): RegionFR | null {
  return DEPT_TO_REGION[dept] ?? null
}
