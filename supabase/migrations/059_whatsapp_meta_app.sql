-- Meta App ID and App Secret live with the WhatsApp number so the
-- webhook can verify Meta's signature without a process env var.
-- The secret is encrypted with the same key as the access token.

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS meta_app_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_app_secret TEXT;

COMMENT ON COLUMN whatsapp_config.meta_app_secret IS
  'AES-256-GCM ciphertext of the Meta App Secret. Never return it to the browser.';
