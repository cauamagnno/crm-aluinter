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

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_company BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS company_normalized TEXT
  GENERATED ALWAYS AS (public.normalize_company_name(company)) STORED;

-- The oldest row of each name becomes the company. Later rows with the
-- same name stay as people at that company.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY account_id, public.normalize_company_name(company)
           ORDER BY created_at, id
         ) AS n
  FROM contacts
  WHERE public.normalize_company_name(company) IS NOT NULL
)
UPDATE contacts AS c
SET is_company = true
FROM ranked AS r
WHERE c.id = r.id
  AND r.n = 1
  AND NOT c.is_company;

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
