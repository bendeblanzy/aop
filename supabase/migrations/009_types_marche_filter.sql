-- Filtre type de marché sur le profil (SERVICES, FOURNITURES, TRAVAUX)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS types_marche_filtres text[] DEFAULT '{}';
