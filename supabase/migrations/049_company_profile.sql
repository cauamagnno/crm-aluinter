-- Extra registration fields shown on the company page.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS company_segment text,
  ADD COLUMN IF NOT EXISTS company_url text,
  ADD COLUMN IF NOT EXISTS company_address text;
