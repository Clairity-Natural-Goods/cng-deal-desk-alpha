-- ==============================================================================
-- CNG DEAL DESK ALPHA V2 — BACKEND READINESS GATES & APPROVAL SECURITY
-- Migration: 20261117000001_enforce_readiness_and_approval_gates.sql
-- Description: Server-side & PostgreSQL level enforcement of mandatory Deal Pack
--              readiness requirements for Approved, Ready, and SubmittedForReview.
--              Guarantees that direct REST API or unauthenticated mutation paths
--              cannot bypass readiness gating.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.enforce_mvtr_readiness_and_approval_gates()
RETURNS TRIGGER AS $$
DECLARE
  v_current_role text;
  v_missing text[] := '{}';
  v_tonnes numeric;
  v_moisture numeric;
  v_price numeric;
  v_transport numeric;
  v_fee_gross numeric;
  v_fee_rate numeric;
BEGIN
  -- Determine current role
  v_current_role := public.current_user_role();

  -- Gating check: Applied whenever record transitions to or is inserted as Approved, Ready, or SubmittedForReview
  IF NEW.status IN ('Approved', 'Ready', 'SubmittedForReview') OR (coalesce(NEW.approval->>'status', '') = 'Approved') THEN
    
    -- 1. Check Buyer Information
    IF coalesce(trim(NEW.buyer_requirements->>'buyer_name'), '') = '' THEN
      v_missing := array_append(v_missing, 'buyer_name');
    END IF;

    v_tonnes := coalesce((NEW.buyer_requirements->>'required_tonnes')::numeric, 0);
    IF v_tonnes <= 0 THEN
      v_tonnes := coalesce((NEW.supplier_verification->>'confirmed_tonnes')::numeric, 0);
    END IF;
    IF v_tonnes <= 0 THEN
      v_missing := array_append(v_missing, 'volume_tonnes');
    END IF;

    -- 2. Check Supplier Information
    IF coalesce(trim(NEW.supplier_verification->>'supplier_name'), '') = '' THEN
      v_missing := array_append(v_missing, 'supplier_name');
    END IF;

    -- 3. Check Moisture Reading
    v_moisture := coalesce((NEW.supplier_verification->>'moisture_reading_pct')::numeric, 0);
    IF v_moisture <= 0 OR v_moisture > 15.0 THEN
      v_missing := array_append(v_missing, 'moisture_readings');
    END IF;

    -- 4. Check Transport Quotation & Transporter
    IF NEW.transport_collection->>'total_transport_cost' IS NULL OR coalesce(trim(NEW.transport_collection->>'transporter_name'), '') = '' THEN
      v_missing := array_append(v_missing, 'transport_quote');
    END IF;

    -- 5. Check Agreed Price and Payment Schedule
    v_price := coalesce((NEW.payment_terms->>'agreed_price_per_kg')::numeric, 0);
    IF v_price <= 0 THEN
      v_missing := array_append(v_missing, 'agreed_price_per_kg');
    END IF;
    IF coalesce(trim(NEW.payment_terms->>'payment_schedule'), '') = '' THEN
      v_missing := array_append(v_missing, 'payment_schedule');
    END IF;

    -- 6. Check Written CNG Fee & Acceptance
    v_fee_gross := coalesce((NEW.fee_margin->>'expected_gross_fee')::numeric, 0);
    v_fee_rate := coalesce((NEW.fee_margin->>'cng_fee_per_tonne')::numeric, 0);
    IF v_fee_gross <= 0 AND v_fee_rate < 25000 THEN
      v_missing := array_append(v_missing, 'written_fee');
    END IF;

    IF (NEW.status = 'Approved' OR coalesce(NEW.approval->>'status', '') = 'Approved') AND 
      coalesce(NEW.fee_margin->>'acceptance_status', '') NOT IN ('Accepted', 'Confirmed') THEN
      v_missing := array_append(v_missing, 'fee_acceptance');
    END IF;

    -- Rejection Response
    IF array_length(v_missing, 1) > 0 THEN
      RAISE EXCEPTION 'READY transition rejected: missing %', array_to_string(v_missing, ', ');
    END IF;
  END IF;

  -- 7. Clarence / Administrator Executive Authority Check
  IF (NEW.status IN ('Approved', 'Rejected') AND (OLD IS NULL OR OLD.status NOT IN ('Approved', 'Rejected')))
     OR (coalesce(NEW.approval->>'status', '') IN ('Approved', 'Rejected') AND (OLD IS NULL OR coalesce(OLD.approval->>'status', '') <> coalesce(NEW.approval->>'status', ''))) THEN
    IF v_current_role <> 'admin' THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Only Clarence or an authorized administrator can approve or reject transactions. Field officers cannot approve records.';
    END IF;

    -- Stamp approver metadata
    IF NEW.status = 'Approved' OR coalesce(NEW.approval->>'status', '') = 'Approved' THEN
      NEW.status := 'Approved';
      NEW.approval := jsonb_set(
        jsonb_set(coalesce(NEW.approval, '{}'::jsonb), '{decision_date}', to_jsonb(NOW()::text)),
        '{approver_id}',
        to_jsonb(coalesce(auth.uid()::text, 'admin_system'))
      );
    ELSIF NEW.status = 'Rejected' OR coalesce(NEW.approval->>'status', '') = 'Rejected' THEN
      NEW.status := 'Rejected';
      NEW.approval := jsonb_set(
        jsonb_set(coalesce(NEW.approval, '{}'::jsonb), '{decision_date}', to_jsonb(NOW()::text)),
        '{approver_id}',
        to_jsonb(coalesce(auth.uid()::text, 'admin_system'))
      );
    END IF;
  END IF;

  NEW.updated_at := NOW();
  NEW.sync_version := coalesce(OLD.sync_version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to both INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_enforce_mvtr_approval_permissions ON public.transactions;
DROP TRIGGER IF EXISTS trg_enforce_mvtr_readiness_and_approval_gates ON public.transactions;
CREATE TRIGGER trg_enforce_mvtr_readiness_and_approval_gates
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mvtr_readiness_and_approval_gates();
