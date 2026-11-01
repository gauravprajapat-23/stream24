-- Lease renewal for PostgreSQL-backed workers.
-- Apply after 001_postgres_foundation.sql.
CREATE OR REPLACE FUNCTION stream24_renew_stream(
  p_owner_id text,
  p_stream_id text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_entitlement_id text;
BEGIN
  IF p_owner_id IS NULL OR p_owner_id = '' OR p_stream_id IS NULL OR p_stream_id = '' THEN
    RAISE EXCEPTION 'OWNER_AND_STREAM_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_lease_seconds < 15 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'INVALID_LEASE_DURATION' USING ERRCODE = '22023';
  END IF;

  SELECT r.entitlement_id
    INTO v_entitlement_id
    FROM stream24_stream_reservations r
    JOIN stream24_entitlements e ON e.entitlement_id = r.entitlement_id
   WHERE r.owner_id = p_owner_id
     AND r.stream_id = p_stream_id
     AND r.released_at IS NULL
     AND e.owner_id = p_owner_id
     AND e.status = 'ACTIVE'
     AND e.starts_at <= now()
     AND e.expires_at > now()
   FOR UPDATE OF r;

  IF v_entitlement_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE stream24_stream_reservations
     SET lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   WHERE owner_id = p_owner_id
     AND stream_id = p_stream_id
     AND released_at IS NULL;

  RETURN FOUND;
END;
$$;
