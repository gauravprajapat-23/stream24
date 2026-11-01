-- Stream24 PostgreSQL foundation.
-- Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_postgres_foundation.sql
-- Runtime cutover is deliberately separate; the current app still reads data/db.json.

CREATE TABLE IF NOT EXISTS stream24_records (
  collection text NOT NULL,
  record_id text NOT NULL,
  owner_id text,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, record_id),
  CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX IF NOT EXISTS stream24_records_owner_idx
  ON stream24_records (owner_id, collection);
CREATE INDEX IF NOT EXISTS stream24_records_payload_gin_idx
  ON stream24_records USING gin (payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS stream24_billing_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream24_billing_payments (
  payment_id text PRIMARY KEY,
  owner_id text NOT NULL,
  order_id text,
  subscription_id text,
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  status text NOT NULL,
  webhook_event_id text REFERENCES stream24_billing_webhook_events(event_id),
  provider_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stream24_billing_payments_owner_idx
  ON stream24_billing_payments (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stream24_entitlements (
  entitlement_id text PRIMARY KEY,
  owner_id text NOT NULL,
  plan_id text NOT NULL,
  source_payment_id text NOT NULL UNIQUE REFERENCES stream24_billing_payments(payment_id),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  max_concurrent_streams integer NOT NULL CHECK (max_concurrent_streams > 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS stream24_entitlements_owner_active_idx
  ON stream24_entitlements (owner_id, expires_at DESC)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS stream24_stream_reservations (
  stream_id text PRIMARY KEY,
  owner_id text NOT NULL,
  entitlement_id text NOT NULL REFERENCES stream24_entitlements(entitlement_id),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  released_at timestamptz,
  CHECK (lease_expires_at > reserved_at)
);
CREATE INDEX IF NOT EXISTS stream24_stream_reservations_owner_active_idx
  ON stream24_stream_reservations (owner_id, lease_expires_at)
  WHERE released_at IS NULL;

-- Call inside the same transaction that accepts a stream-start request.
-- The per-owner advisory lock makes quota check + reservation atomic across app instances.
CREATE OR REPLACE FUNCTION stream24_reserve_stream(p_owner_id text, p_stream_id text)
RETURNS stream24_stream_reservations
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit integer;
  v_entitlement_id text;
  v_active_count integer;
  v_existing_owner text;
  v_result stream24_stream_reservations;
BEGIN
  IF p_owner_id IS NULL OR p_owner_id = '' OR p_stream_id IS NULL OR p_stream_id = '' THEN
    RAISE EXCEPTION 'OWNER_AND_STREAM_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id, 0));

  SELECT max(max_concurrent_streams), (array_agg(entitlement_id ORDER BY max_concurrent_streams DESC, expires_at DESC))[1]
    INTO v_limit, v_entitlement_id
    FROM stream24_entitlements
   WHERE owner_id = p_owner_id
     AND status = 'ACTIVE'
     AND starts_at <= now()
     AND expires_at > now();

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_ENTITLEMENT' USING ERRCODE = 'P0001';
  END IF;

  SELECT owner_id INTO v_existing_owner
    FROM stream24_stream_reservations
   WHERE stream_id = p_stream_id
   FOR UPDATE;

  IF v_existing_owner IS NOT NULL AND v_existing_owner <> p_owner_id THEN
    RAISE EXCEPTION 'STREAM_OWNER_MISMATCH' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_active_count
    FROM stream24_stream_reservations
   WHERE owner_id = p_owner_id
     AND released_at IS NULL
     AND lease_expires_at > now()
     AND stream_id <> p_stream_id;

  IF v_active_count >= v_limit THEN
    RAISE EXCEPTION 'STREAM_CONCURRENCY_LIMIT' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO stream24_stream_reservations
    (stream_id, owner_id, entitlement_id, reserved_at, lease_expires_at, released_at)
  VALUES
    (p_stream_id, p_owner_id, v_entitlement_id, now(), now() + interval '2 minutes', NULL)
  ON CONFLICT (stream_id) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        entitlement_id = EXCLUDED.entitlement_id,
        reserved_at = now(),
        lease_expires_at = now() + interval '2 minutes',
        released_at = NULL
    WHERE stream24_stream_reservations.owner_id = EXCLUDED.owner_id
  RETURNING * INTO v_result;

  IF v_result.stream_id IS NULL THEN
    RAISE EXCEPTION 'STREAM_RESERVATION_CONFLICT' USING ERRCODE = '23505';
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION stream24_release_stream(p_owner_id text, p_stream_id text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE stream24_stream_reservations
     SET released_at = now()
   WHERE owner_id = p_owner_id
     AND stream_id = p_stream_id
     AND released_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;
