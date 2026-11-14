-- ==============================================================================
--   CNG DEAL DESK ALPHA V2 — IDENTITY DISCLOSURE CONTROLS & AUDIT TRAIL MIGRATION
--   File: supabase/migrations/20261114000001_identity_disclosure_and_audit.sql
--   Purpose: Implements backend identity disclosure enforcement, purpose-based
--            authorization (BANKING vs OPERATIONAL), and immutable audit trail.
-- ==============================================================================

-- 1. Create disclosure_audit_logs table
CREATE TABLE IF NOT EXISTS public.disclosure_audit_logs (
  id TEXT PRIMARY KEY DEFAULT ('dal_' || substr(md5(random()::text), 1, 12)),
  transaction_id TEXT,
  requesting_user_id UUID REFERENCES auth.users(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('BUYER', 'SUPPLIER', 'COUNTERPARTY', 'GENERAL')),
  disclosure_purpose TEXT NOT NULL CHECK (disclosure_purpose IN ('BANKING', 'OPERATIONAL')),
  disclosed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_result TEXT NOT NULL CHECK (access_result IN ('GRANTED', 'DENIED')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient audit queries
CREATE INDEX IF NOT EXISTS idx_disclosure_audit_user ON public.disclosure_audit_logs(requesting_user_id);
CREATE INDEX IF NOT EXISTS idx_disclosure_audit_txn ON public.disclosure_audit_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_disclosure_audit_time ON public.disclosure_audit_logs(access_timestamp DESC);

-- Enable RLS
ALTER TABLE public.disclosure_audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies on disclosure_audit_logs
-- Only admins, auditors, and compliance officers can view audit logs
DROP POLICY IF EXISTS "Admins and auditors can view disclosure audit logs" ON public.disclosure_audit_logs;
CREATE POLICY "Admins and auditors can view disclosure audit logs"
  ON public.disclosure_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'auditor', 'compliance')
    )
  );

-- Authenticated users can insert disclosure records through authorized flows
DROP POLICY IF EXISTS "Authenticated users can record disclosure logs" ON public.disclosure_audit_logs;
CREATE POLICY "Authenticated users can record disclosure logs"
  ON public.disclosure_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (requesting_user_id = auth.uid());

-- Prevent updates to audit log entries (immutable)
DROP POLICY IF EXISTS "Prevent updates to disclosure audit logs" ON public.disclosure_audit_logs;
CREATE POLICY "Prevent updates to disclosure audit logs"
  ON public.disclosure_audit_logs
  FOR UPDATE
  TO authenticated
  USING (false);

-- Prevent deletions from audit log entries (immutable)
DROP POLICY IF EXISTS "Prevent deletes from disclosure audit logs" ON public.disclosure_audit_logs;
CREATE POLICY "Prevent deletes from disclosure audit logs"
  ON public.disclosure_audit_logs
  FOR DELETE
  TO authenticated
  USING (false);

-- 3. Security Definer RPC Function for Controlled Identity Disclosure
CREATE OR REPLACE FUNCTION public.request_identity_disclosure(
  p_party_id TEXT,
  p_transaction_id TEXT,
  p_purpose TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_is_authorized BOOLEAN := FALSE;
  v_disclosed_fields JSONB := '[]'::jsonb;
  v_result JSONB;
  v_party RECORD;
  v_subject_type TEXT := 'COUNTERPARTY';
BEGIN
  -- 1. Ensure user is authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be signed in to request disclosure.';
  END IF;

  -- 2. Validate disclosure purpose
  IF p_purpose NOT IN ('BANKING', 'OPERATIONAL') THEN
    RAISE EXCEPTION 'INVALID_PURPOSE: Disclosure purpose must be either BANKING or OPERATIONAL.';
  END IF;

  -- 3. Validate reason length
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'INVALID_REASON: A substantive business justification (minimum 5 characters) is required.';
  END IF;

  -- 4. Retrieve user role from profiles
  SELECT role INTO v_user_role
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_role IS NULL THEN
    v_user_role := 'user';
  END IF;

  -- 5. Check role authorization matrix
  IF p_purpose = 'BANKING' THEN
    v_is_authorized := v_user_role IN ('admin', 'finance', 'compliance');
  ELSIF p_purpose = 'OPERATIONAL' THEN
    v_is_authorized := v_user_role IN ('admin', 'operations', 'field_officer', 'operator');
  END IF;

  -- 6. Fetch target counterparty record
  SELECT * INTO v_party
  FROM public.parties
  WHERE id = p_party_id;

  IF v_party.id IS NOT NULL THEN
    IF v_party.role = 'Buyer' THEN
      v_subject_type := 'BUYER';
    ELSIF v_party.role = 'Supplier' THEN
      v_subject_type := 'SUPPLIER';
    END IF;
  END IF;

  -- 7. Handle Unauthorized Request
  IF NOT v_is_authorized THEN
    -- Log the denied attempt
    INSERT INTO public.disclosure_audit_logs (
      transaction_id,
      requesting_user_id,
      subject_type,
      disclosure_purpose,
      disclosed_fields,
      access_timestamp,
      access_result,
      reason
    ) VALUES (
      p_transaction_id,
      v_user_id,
      v_subject_type,
      p_purpose,
      '[]'::jsonb,
      NOW(),
      'DENIED',
      p_reason
    );

    RAISE EXCEPTION 'INSUFFICIENT_PERMISSIONS: Role "%" does not permit disclosure for purpose "%".', v_user_role, p_purpose;
  END IF;

  -- 8. Prepare authorized fields based on purpose
  IF p_purpose = 'BANKING' THEN
    v_disclosed_fields := '["contact_person", "bank_details"]'::jsonb;
    v_result := jsonb_build_object(
      'party_id', v_party.id,
      'name', v_party.name,
      'contact_person', COALESCE(v_party.contact_person, '—'),
      'bank_details', COALESCE(v_party.bank_details, '—'),
      'purpose', 'BANKING',
      'disclosed_at', NOW()
    );
  ELSIF p_purpose = 'OPERATIONAL' THEN
    v_disclosed_fields := '["contact_person", "contact_channel", "district"]'::jsonb;
    v_result := jsonb_build_object(
      'party_id', v_party.id,
      'name', v_party.name,
      'contact_person', COALESCE(v_party.contact_person, '—'),
      'contact_channel', COALESCE(v_party.contact_channel, '—'),
      'district', COALESCE(v_party.district, '—'),
      'purpose', 'OPERATIONAL',
      'disclosed_at', NOW()
    );
  END IF;

  -- 9. Log the granted disclosure in the permanent audit trail
  INSERT INTO public.disclosure_audit_logs (
    transaction_id,
    requesting_user_id,
    subject_type,
    disclosure_purpose,
    disclosed_fields,
    access_timestamp,
    access_result,
    reason
  ) VALUES (
    p_transaction_id,
    v_user_id,
    v_subject_type,
    p_purpose,
    v_disclosed_fields,
    NOW(),
    'GRANTED',
    p_reason
  );

  RETURN v_result;
END;
$$;

-- Restrict execution permissions on RPC
REVOKE ALL ON FUNCTION public.request_identity_disclosure(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_identity_disclosure(TEXT, TEXT, TEXT, TEXT) TO authenticated;
