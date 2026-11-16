-- A registered sale (won or lost) keeps its value and dates for everyone
-- below admin. Only owner and admin can change value, expected_close_date
-- or closed_at while the deal stays closed. Reopening a deal (status open)
-- is still done by the seller through the normal update rules.
-- The guard applies only to user sessions (auth.uid() is set), so server
-- jobs running with the service role are not affected.

CREATE OR REPLACE FUNCTION public.guard_registered_sale() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('won', 'lost')
     AND NEW.status IN ('won', 'lost')
     AND (
       NEW.value IS DISTINCT FROM OLD.value
       OR NEW.expected_close_date IS DISTINCT FROM OLD.expected_close_date
       OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
     )
     AND NOT public.is_account_member(OLD.account_id, 'admin') THEN
    RAISE EXCEPTION 'only admin can change a registered sale'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deals_guard_registered_sale ON deals;
CREATE TRIGGER deals_guard_registered_sale
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION public.guard_registered_sale();
