-- ════════════════════════════════════════════════════════════════════════════
-- Seed staging — données minimales pour valider l'app
--
-- Contenu :
--   1. 1 organisation de test "L'ADN DATA Test" (UUID fixe pour reproductibilité)
--   2. 8 AO factices (mix BOAMP/TED/Atexo, services/travaux/fournitures)
--
-- À exécuter UNIQUEMENT sur le projet staging (bzcammbwqkfqfkzhvzie).
-- À NE JAMAIS exécuter en prod.
--
-- Création utilisateur :
--   Les users sont créés via l'UI signup (https://staging.ladndata.com/signup)
--   ou via le dashboard Supabase (Auth → Users → Add user).
--   Une fois le user créé, exécuter le bloc « LIER UN USER À L'ORG » en bas de
--   ce fichier (en remplaçant l'email).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Organisation de test ──────────────────────────────────────────────
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'L''ADN DATA Test')
ON CONFLICT (id) DO NOTHING;

-- ─── 2. AO factices ───────────────────────────────────────────────────────
INSERT INTO tenders (idweb, source, objet, nomacheteur, famille, nature, dateparution, datelimitereponse, descripteur_codes, descripteur_libelles, type_marche, url_avis, code_departement, type_procedure, procedure_libelle, nature_libelle, cpv_codes, code_nuts, nb_lots, lots_titres, budget_estime, valeur_estimee, duree_mois, short_summary, donnees, url_profil_acheteur)
VALUES
  ('seed-boamp-001', 'boamp', 'Création d''une plateforme web de gestion de subventions',
   'Région Île-de-France', '01', 'SERVICES', '2026-04-15', '2026-05-30 17:00:00+00',
   ARRAY['72200000','72500000'], ARRAY['Programmation et conseil en logiciel','Services informatiques'],
   'SERVICES', 'https://www.boamp.fr/seed-001', ARRAY['75'], 'AO_OUVERT', 'Procédure formalisée',
   'Services', ARRAY['72200000','72500000'], 'FR101', 1, ARRAY['Plateforme web'], 250000, 250000, 12,
   'Conception et développement d''une plateforme web pour gérer les demandes de subventions régionales.',
   '{}'::jsonb, 'https://marches.maximilien.fr/index.php?page=Entreprise.EntrepriseDetailsConsultation&refConsultation=SEED-001'),

  ('seed-boamp-002', 'boamp', 'Refonte du système d''information de la médiathèque',
   'Ville de Lyon', '01', 'SERVICES', '2026-04-20', '2026-06-15 17:00:00+00',
   ARRAY['72500000','48000000'], ARRAY['Services informatiques','Logiciels'],
   'SERVICES', 'https://www.boamp.fr/seed-002', ARRAY['69'], 'AO_OUVERT', 'Procédure formalisée',
   'Services', ARRAY['48000000'], 'FRK24', 2, ARRAY['Lot 1 SI','Lot 2 Maintenance'], 180000, 180000, 36,
   'Refonte complète du SI de la médiathèque municipale, gestion des prêts, catalogue, espace lecteur.',
   '{}'::jsonb, NULL),

  ('seed-boamp-003', 'boamp', 'Production d''une série de vidéos pédagogiques sur le développement durable',
   'ADEME', '02', 'SERVICES', '2026-04-22', '2026-05-25 17:00:00+00',
   ARRAY['92110000','79341000'], ARRAY['Production cinéma vidéo','Services de publicité'],
   'SERVICES', 'https://www.boamp.fr/seed-003', ARRAY['75'], 'MAPA', 'Procédure adaptée',
   'Services', ARRAY['92110000'], 'FR101', 1, NULL, 80000, 80000, 6,
   'Production de 12 vidéos courtes (3-5 min) sur les enjeux de la transition écologique pour le grand public.',
   '{}'::jsonb, NULL),

  ('seed-boamp-004', 'boamp', 'Travaux de rénovation énergétique d''un groupe scolaire',
   'Ville de Bordeaux', '03', 'TRAVAUX', '2026-04-10', '2026-06-30 17:00:00+00',
   ARRAY['45000000','45330000'], ARRAY['Travaux de construction','Travaux de plomberie'],
   'TRAVAUX', 'https://www.boamp.fr/seed-004', ARRAY['33'], 'AO_OUVERT', 'Procédure formalisée',
   'Travaux', ARRAY['45000000'], 'FRI12', 4, ARRAY['Gros œuvre','Plomberie','Électricité','Peinture'], 1200000, 1200000, 18,
   'Rénovation thermique complète d''un groupe scolaire de 600 m² (isolation, menuiseries, chauffage).',
   '{}'::jsonb, NULL),

  ('seed-ted-005', 'ted', 'Étude prospective sur les usages de l''IA dans les services publics',
   'Commission européenne', '01', 'SERVICES', '2026-04-18', '2026-06-20 17:00:00+00',
   ARRAY['73210000'], ARRAY['Services de conseil en recherche'],
   'SERVICES', 'https://ted.europa.eu/seed-005', ARRAY['BE'], 'AO_OUVERT', 'Procédure ouverte',
   'Services', ARRAY['73210000'], 'BE100', 1, NULL, 150000, 150000, 9,
   'Cartographie des usages opérationnels de l''IA générative dans 27 administrations européennes.',
   '{}'::jsonb, NULL),

  ('seed-atx-place-006', 'atexo', 'Accompagnement à la stratégie de communication digitale',
   'Préfecture de la Région Bretagne', '01', 'SERVICES', '2026-04-25', '2026-05-28 17:00:00+00',
   ARRAY['79341000','72413000'], ARRAY['Services de publicité','Services de conception de sites web'],
   'SERVICES', 'https://www.marches-publics.gouv.fr/seed-006', ARRAY['35'], 'MAPA', 'Procédure adaptée',
   'Services', ARRAY['79341000'], 'FRH03', 1, NULL, 60000, 60000, 12,
   'Conseil et production de contenus pour la nouvelle stratégie digitale de la Préfecture (réseaux sociaux, newsletter, web).',
   '{}'::jsonb, 'https://www.marches-publics.gouv.fr/?page=Entreprise.EntrepriseDetailsConsultation&refConsultation=2026-0154-00-00-MPF'),

  ('seed-atx-mxm-007', 'atexo', 'Formation des agents à la transformation numérique',
   'Région Île-de-France', '01', 'SERVICES', '2026-04-12', '2026-05-22 17:00:00+00',
   ARRAY['80500000','80530000'], ARRAY['Services de formation','Services de formation professionnelle'],
   'SERVICES', 'https://marches.maximilien.fr/seed-007', ARRAY['75'], 'MAPA', 'Procédure adaptée',
   'Services', ARRAY['80500000'], 'FR101', 3, ARRAY['Numérique','Data','IA générative'], 95000, 95000, 8,
   'Formation de 200 agents régionaux à l''usage des outils numériques modernes (cloud, data, IA générative).',
   '{}'::jsonb, 'https://marches.maximilien.fr/?refConsultation=MXM-2026-007'),

  ('seed-boamp-008', 'boamp', 'Fourniture et maintenance de matériel informatique',
   'Conseil départemental du Rhône', '04', 'FOURNITURES', '2026-04-08', '2026-05-15 17:00:00+00',
   ARRAY['30200000','48820000'], ARRAY['Matériel informatique','Serveurs'],
   'FOURNITURES', 'https://www.boamp.fr/seed-008', ARRAY['69'], 'AO_OUVERT', 'Procédure formalisée',
   'Fournitures', ARRAY['30200000'], 'FRK24', 2, ARRAY['Postes de travail','Serveurs'], 800000, 800000, 48,
   'Fourniture de 1500 postes de travail et 20 serveurs sur 4 ans, plus maintenance préventive.',
   '{}'::jsonb, NULL)
ON CONFLICT (idweb) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 🔧 LIER UN USER À L'ORG (à exécuter après signup via l'UI)
--
-- 1. Va sur https://staging.ladndata.com/signup et crée le compte admin
--    (par exemple benjamindeblanzy+staging@gmail.com).
-- 2. Reviens ici, remplace l'email ci-dessous, et exécute ce bloc dans le
--    SQL Editor du dashboard Supabase staging.
-- ════════════════════════════════════════════════════════════════════════════
/*
DO $$
DECLARE
  v_user_id UUID;
  v_org_id  UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- ⚠️ Remplacer par l'email du user créé via signup
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'benjamindeblanzy+staging@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User non trouvé. Crée d''abord le compte via /signup.';
  END IF;

  -- Lier le user à l'org en tant qu'admin
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'admin')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin';

  -- Créer le profil de base lié à l'org (à compléter via l'onboarding)
  INSERT INTO profiles (id, organization_id, raison_sociale, siret, nom_representant, prenom_representant)
  VALUES (v_user_id, v_org_id, 'L''ADN DATA Test', '00000000000000', 'Test', 'Admin')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'OK : user % lié à l''org % en admin', v_user_id, v_org_id;
END $$;
*/
