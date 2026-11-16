-- Issue #24: shared Photon rate limit + circuit via Supabase table (no Redis).
-- Process-local limiter remains a fallback when RPCs fail.
-- Applied live as version 20261116050526.

CREATE TABLE IF NOT EXISTS public.geocode_rate_buckets (
  bucket_key text PRIMARY KEY,
  tokens double precision NOT NULL CHECK (tokens >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.geocode_rate_buckets IS
  'Shared token buckets for Photon proxy fair-use (#24). Access only via SECURITY DEFINER RPCs.';

ALTER TABLE public.geocode_rate_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.geocode_rate_buckets FROM PUBLIC;
REVOKE ALL ON TABLE public.geocode_rate_buckets FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.photon_circuit_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  open_until timestamptz
);

COMMENT ON TABLE public.photon_circuit_state IS
  'Single-row Photon upstream circuit breaker (#24).';

ALTER TABLE public.photon_circuit_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.photon_circuit_state FROM PUBLIC;
REVOKE ALL ON TABLE public.photon_circuit_state FROM anon, authenticated;

INSERT INTO public.photon_circuit_state (id, failure_count, open_until)
VALUES (1, 0, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.geocode_rate_limit_take(
  p_key text,
  p_capacity double precision,
  p_refill_per_ms double precision
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_now timestamptz := clock_timestamp();
  v_tokens double precision;
  v_updated timestamptz;
  v_elapsed_ms double precision;
BEGIN
  v_key := left(btrim(coalesce(p_key, '')), 200);
  IF v_key = '' THEN
    RETURN false;
  END IF;
  IF p_capacity IS NULL OR p_capacity < 1
     OR p_refill_per_ms IS NULL OR p_refill_per_ms <= 0 THEN
    RETURN false;
  END IF;

  SELECT b.tokens, b.updated_at
  INTO v_tokens, v_updated
  FROM public.geocode_rate_buckets AS b
  WHERE b.bucket_key = v_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.geocode_rate_buckets (bucket_key, tokens, updated_at)
    VALUES (v_key, p_capacity - 1, v_now);
    RETURN true;
  END IF;

  v_elapsed_ms := GREATEST(
    0,
    EXTRACT(EPOCH FROM (v_now - v_updated)) * 1000.0
  );
  v_tokens := LEAST(p_capacity, v_tokens + v_elapsed_ms * p_refill_per_ms);

  IF v_tokens < 1 THEN
    UPDATE public.geocode_rate_buckets
    SET tokens = v_tokens, updated_at = v_now
    WHERE bucket_key = v_key;
    RETURN false;
  END IF;

  UPDATE public.geocode_rate_buckets
  SET tokens = v_tokens - 1, updated_at = v_now
  WHERE bucket_key = v_key;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.geocode_rate_limit_take(text, double precision, double precision) IS
  'Atomic shared token-bucket take for Photon proxy (#24).';

REVOKE ALL ON FUNCTION public.geocode_rate_limit_take(text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.geocode_rate_limit_take(text, double precision, double precision)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.photon_circuit_is_open()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.photon_circuit_state AS s
    WHERE s.id = 1
      AND s.open_until IS NOT NULL
      AND s.open_until > clock_timestamp()
  );
$$;

COMMENT ON FUNCTION public.photon_circuit_is_open() IS
  'True while Photon circuit breaker is open (#24).';

REVOKE ALL ON FUNCTION public.photon_circuit_is_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.photon_circuit_is_open() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.photon_circuit_record_success()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.photon_circuit_state
  SET failure_count = 0, open_until = NULL
  WHERE id = 1;
END;
$$;

COMMENT ON FUNCTION public.photon_circuit_record_success() IS
  'Reset Photon circuit after a successful upstream call (#24).';

REVOKE ALL ON FUNCTION public.photon_circuit_record_success() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.photon_circuit_record_success()
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.photon_circuit_record_failure(
  p_threshold integer DEFAULT 3,
  p_open_ms integer DEFAULT 30000
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_threshold integer := GREATEST(coalesce(p_threshold, 3), 1);
  v_open_ms integer := GREATEST(coalesce(p_open_ms, 30000), 1000);
BEGIN
  UPDATE public.photon_circuit_state
  SET failure_count = failure_count + 1
  WHERE id = 1
  RETURNING failure_count INTO v_count;

  IF NOT FOUND THEN
    INSERT INTO public.photon_circuit_state (id, failure_count, open_until)
    VALUES (1, 1, NULL)
    RETURNING failure_count INTO v_count;
  END IF;

  IF v_count >= v_threshold THEN
    UPDATE public.photon_circuit_state
    SET failure_count = 0,
        open_until = clock_timestamp() + make_interval(secs => v_open_ms / 1000.0)
    WHERE id = 1;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.photon_circuit_record_failure(integer, integer) IS
  'Increment Photon failures; open circuit when threshold hit. Returns whether opened (#24).';

REVOKE ALL ON FUNCTION public.photon_circuit_record_failure(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.photon_circuit_record_failure(integer, integer)
  TO anon, authenticated, service_role;
