-- Enable pgcrypto for encrypting Africa's Talking API keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to encrypt a secret value
CREATE OR REPLACE FUNCTION encrypt_secret(secret text, key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
AS $$
    SELECT encode(pgp_sym_encrypt(secret, key), 'base64');
$$;

-- Function to decrypt a secret value
CREATE OR REPLACE FUNCTION decrypt_secret(encrypted text, key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
AS $$
    SELECT pgp_sym_decrypt(decode(encrypted, 'base64'), key);
$$;

-- Add encrypted columns to schools
ALTER TABLE schools ADD COLUMN IF NOT EXISTS africas_talking_api_key_enc text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS africas_talking_username_enc text;

COMMENT ON COLUMN schools.africas_talking_api_key_enc IS 'pgp_sym_encrypt encrypted AT API key';
COMMENT ON COLUMN schools.africas_talking_username_enc IS 'pgp_sym_encrypt encrypted AT username';
