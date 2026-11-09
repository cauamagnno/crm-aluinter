-- Repair databases that already applied the first version of 057.
--
-- That version added `company_normalized` as a STORED generated column
-- (a full rewrite of `contacts`) and then ranked every row in one
-- window. On the production database that took all of the host memory
-- and held the table lock the CRM screens read through, so nothing
-- loaded.
--
-- DROP COLUMN of a generated column is metadata-only. The replacement
-- is a plain column filled 500 rows at a time, with the sort memory
-- capped so this session cannot grow to the size of the table.

SET work_mem = '4MB';
SET maintenance_work_mem = '32MB';
SET max_parallel_workers_per_gather = 0;
SET lock_timeout = '5s';

DO $$
DECLARE
  generated "char";
BEGIN
  SELECT a.attgenerated INTO generated
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'contacts'
    AND a.attname = 'company_normalized'
    AND NOT a.attisdropped;

  IF generated IS NOT NULL AND generated <> '' THEN
    ALTER TABLE public.contacts DROP COLUMN company_normalized;
  END IF;
END $$;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS company_normalized TEXT;

DO $$
DECLARE
  last_id uuid := '00000000-0000-0000-0000-000000000000';
  page_max uuid;
  moved int;
BEGIN
  LOOP
    SELECT id INTO page_max
    FROM (
      SELECT id
      FROM contacts
      WHERE id > last_id
      ORDER BY id
      LIMIT 500
    ) page
    ORDER BY id DESC
    LIMIT 1;
    EXIT WHEN page_max IS NULL;

    UPDATE contacts
    SET company_normalized = public.normalize_company_name(company)
    WHERE id > last_id
      AND id <= page_max
      AND company_normalized IS DISTINCT FROM public.normalize_company_name(company);

    last_id := page_max;
  END LOOP;

  LOOP
    WITH picked AS (
      SELECT account_id, company_normalized
      FROM contacts
      WHERE company_normalized IS NOT NULL
      GROUP BY account_id, company_normalized
      HAVING bool_or(is_company) = false
      LIMIT 100
    ),
    winners AS (
      SELECT DISTINCT ON (c.account_id, c.company_normalized) c.id
      FROM contacts c
      JOIN picked p
        ON p.account_id = c.account_id
       AND p.company_normalized = c.company_normalized
      ORDER BY c.account_id, c.company_normalized, c.created_at, c.id
    )
    UPDATE contacts
    SET is_company = true
    WHERE id IN (SELECT id FROM winners);
    GET DIAGNOSTICS moved = ROW_COUNT;
    EXIT WHEN moved = 0;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_company
  ON contacts (account_id, company_normalized)
  WHERE is_company AND company_normalized IS NOT NULL;
