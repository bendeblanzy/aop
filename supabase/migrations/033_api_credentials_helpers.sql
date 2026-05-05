-- Migration 033 — fonctions SQL encrypt/decrypt pour api_credentials
--
-- Rollback :
--   DROP FUNCTION IF EXISTS public.encrypt_api_key(text, text, text, uuid);
--   DROP FUNCTION IF EXISTS public.decrypt_api_key(text, text);

CREATE OR REPLACE FUNCTION public.encrypt_api_key(
  p_provider text,
  p_value text,
  p_secret text,
  p_updated_by uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.api_credentials (provider, encrypted_value, updated_by, last_validated_at, last_validation_ok, last_validation_error)
  VALUES (p_provider, pgp_sym_encrypt(p_value, p_secret), p_updated_by, NULL, NULL, NULL)
  ON CONFLICT (provider) DO UPDATE SET
    encrypted_value = pgp_sym_encrypt(p_value, p_secret),
    updated_by = p_updated_by,
    last_validated_at = NULL,
    last_validation_ok = NULL,
    last_validation_error = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_api_key(
  p_provider text,
  p_secret text
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_encrypted bytea;
  v_decrypted text;
BEGIN
  SELECT encrypted_value INTO v_encrypted FROM public.api_credentials WHERE provider = p_provider;
  IF v_encrypted IS NULL THEN RETURN NULL; END IF;
  BEGIN
    v_decrypted := pgp_sym_decrypt(v_encrypted, p_secret);
    RETURN v_decrypted;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.encrypt_api_key(text, text, text, uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.decrypt_api_key(text, text) FROM PUBLIC, authenticated, anon;
