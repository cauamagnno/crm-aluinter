-- One company name per account. People who work at that company can
-- still store the same name on their own contact; only the company
-- record (is_company) is unique. Contacts stay unique by phone
-- (migration 022).

CREATE OR REPLACE FUNCTION public.normalize_company_name(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(
    lower(
      regexp_replace(
        translate(
          btrim(coalesce(value, '')),
          'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

ALTER FUNCTION public.normalize_company_name(text) OWNER TO postgres;

-- A STORED generated column rewrites every contact row and keeps the
-- regex on the write path. The window UPDATE below used to sort the
-- whole table while calling that regex per row, which exhausted the
-- database memory and blocked the reads the CRM screens need. The
-- column is plain text, filled in small id-ordered pages instead.
--
-- Cap the sort memory for this session so a later index build cannot
-- grab the whole host either.
SET work_mem = '4MB';
SET maintenance_work_mem = '32MB';
SET max_parallel_workers_per_gather = 0;
SET lock_timeout = '5s';

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_company BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS company_normalized TEXT;

-- Pages of 500 by primary key. Each statement hashes a few hundred
-- rows and releases that memory before the next page.
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

-- Tag filter can ask for company records only, so the empresas list
-- does not page in every person who mentions that company.
DROP FUNCTION IF EXISTS public.filter_contacts_by_tags(UUID[], TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, BOOLEAN);

CREATE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids UUID[],
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0,
  p_companies BOOLEAN DEFAULT false
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT DISTINCT c.id, c.created_at
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND (NOT COALESCE(p_companies, false) OR c.is_company)
      AND (
        p_search IS NULL
        OR c.name ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
        OR c.email ILIKE '%' || p_search || '%'
        OR (
          COALESCE(p_companies, false)
          AND c.company ILIKE '%' || p_search || '%'
        )
      )
  ),
  page AS (
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY created_at DESC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
$$;

ALTER FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, BOOLEAN) TO authenticated;
