-- ==============================================================================
-- CNG DEAL DESK ALPHA V2 — COMPANY PRODUCTION PENDING MIGRATIONS
-- Target Project: ktbmxjakzkopijdzkxlo (https://ktbmxjakzkopijdzkxlo.supabase.co)
-- Consolidates:
--   1. 20261104000002_seed_data.sql
--   2. 20261104000003_auto_confirm_users.sql
--   3. 20261110000001_mvtr_transactions.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PART 1: SEED CORE OPERATIONAL DATA (20261104000002_seed_data.sql)
-- ------------------------------------------------------------------------------

-- 1.1 Seed Parties
INSERT INTO public.parties (id, name, role, district, contact_person, contact_channel, authority_status, consent_aggregate_use, created_date, updated_date)
VALUES
  ('p1', 'Lira Grain Processors Ltd', 'Buyer', 'Lira', 'Okot Peter', '+256 772 100 200', 'VERIFIED', true, NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day'),
  ('p2', 'Amuru United Farmers Co-op', 'Supplier or farmer group', 'Amuru', 'Akello Grace', '+256 782 300 400', 'VERIFIED', true, NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day'),
  ('p3', 'Nwoya Producers Association', 'Supplier or farmer group', 'Nwoya', 'Ochan David', '+256 752 500 600', 'REPORTED', true, NOW() - INTERVAL '8 days', NOW() - INTERVAL '2 days'),
  ('p4', 'Northern Corridor Hauliers', 'Transporter', 'Gulu', 'Kayiira Sam', '+256 701 700 800', 'VERIFIED', true, NOW() - INTERVAL '7 days', NOW() - INTERVAL '2 days'),
  ('p5', 'Gulu Millers Consortium', 'Buyer', 'Gulu', 'Auma Christine', '+256 774 900 100', 'OPEN', true, NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- 1.2 Seed Observations
INSERT INTO public.observations (id, type, commodity, district, place, quantity_tonnes, price_per_kg, transport_cost, moisture_pct, status, observed_date, party_id, consent_aggregate_use, evidence_note, created_date, updated_date)
VALUES
  ('o1', 'Supply offer', 'Maize', 'Amuru', 'Layibi', 25, 1150, NULL, 12.8, 'VERIFIED', CURRENT_DATE - 1, 'p2', true, 'Weighed on site, moisture tested with calibrated dickey-john', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('o2', 'Supply offer', 'Maize', 'Amuru', 'Atiak', 15, 1180, NULL, 13.2, 'REPORTED', CURRENT_DATE - 3, 'p2', true, 'Phone quotation from group coordinator', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  ('o3', 'Buyer requirement', 'Maize', 'Lira', 'Railway division', 30, 1380, NULL, 12.5, 'VERIFIED', CURRENT_DATE - 1, 'p1', true, 'Purchase order #LGP-2026-88 signed', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('o4', 'Price quote', 'Maize', 'Gulu', 'Cereleno market', NULL, 1300, NULL, NULL, 'VERIFIED', CURRENT_DATE - 2, NULL, true, 'Wholesale board price', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  ('o5', 'Price quote', 'Maize', 'Gulu', 'Main market', NULL, 1320, NULL, NULL, 'VERIFIED', CURRENT_DATE - 4, NULL, true, 'Dealer retail wholesale', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
  ('o6', 'Price quote', 'Maize', 'Gulu', 'Layibi trade post', NULL, 1290, NULL, NULL, 'VERIFIED', CURRENT_DATE - 5, NULL, true, 'Aggregate dealer transaction', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
  ('o7', 'Transport quote', 'Maize', 'Amuru', 'Amuru to Lira route', NULL, NULL, 650000, NULL, 'VERIFIED', CURRENT_DATE - 2, 'p4', true, 'Quotation for 15-tonne Fuso truck', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  ('o8', 'Quality reading', 'Maize', 'Amuru', 'Pabbo storage', NULL, NULL, NULL, 13.0, 'VERIFIED', CURRENT_DATE - 3, 'p2', true, 'Bag probe sample test', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  ('o9', 'Supply offer', 'Maize', 'Nwoya', 'Anaka', 18, 1140, NULL, 13.5, 'VERIFIED', CURRENT_DATE - 4, 'p3', true, 'Warehouse stock inspected', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
  ('o10', 'Price quote', 'Maize', 'Lira', 'Main market', NULL, 1350, NULL, NULL, 'VERIFIED', CURRENT_DATE - 2, NULL, true, 'Wholesale intake rate', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  ('o11', 'Price quote', 'Maize', 'Lira', 'Adyel', NULL, 1360, NULL, NULL, 'VERIFIED', CURRENT_DATE - 5, NULL, true, 'Commercial miller spot price', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
  ('o12', 'Price quote', 'Maize', 'Lira', 'Ojwina', NULL, 1340, NULL, NULL, 'VERIFIED', CURRENT_DATE - 6, NULL, true, 'Trader gate quote', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days')
ON CONFLICT (id) DO NOTHING;

-- 1.3 Seed Deals
INSERT INTO public.deals (id, name, buyer_id, supplier_id, commodity, proof_quantity_tonnes, buyer_price_per_kg, supplier_price_per_kg, stage, evidence, per_tonne_fee, minimum_fee, commissioned, cost_field, cost_testing, cost_transport, cost_other, staff_hours, staff_cost_per_hour, working_days, approval_status, payment_status, classification, created_date, updated_date)
VALUES
  ('d1', 'Lira Millers - Amuru Co-op 20t Maize', 'p1', 'p2', 'Maize', 20, 1380, 1150, 3, '["VERIFIED","VERIFIED","VERIFIED","VERIFIED","VERIFIED","VERIFIED","OPEN","OPEN"]'::jsonb, 30000, 25000, true, 25000, 30000, 0, 5000, 8, 6000, 3, 'Requested', 'Not invoiced', 'Class A - Fulfilled & Contribution Positive', NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 day'),
  ('d2', 'Gulu Millers - Nwoya 15t Proof Batch', 'p5', 'p3', 'Maize', 15, 1320, 1140, 1, '["VERIFIED","REPORTED","OPEN","OPEN","OPEN","OPEN","OPEN","OPEN"]'::jsonb, 30000, 25000, false, 15000, 20000, 0, 0, 4, 6000, 1, 'Not requested', 'Not invoiced', 'Not classified', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- 1.4 Seed Deal Events
INSERT INTO public.deal_events (id, deal_id, label, detail, created_date)
VALUES
  ('e1', 'd1', 'Deal matched & commissioned', 'Amuru United supply matched to Lira Grain order #88.', NOW() - INTERVAL '3 days'),
  ('e2', 'd1', 'Gate evidence verified', 'Quantity (20t), moisture (12.8%) and stock title verified on site.', NOW() - INTERVAL '2 days'),
  ('e3', 'd1', 'Approval requested', 'Management execution approval requested.', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PART 2: AUTO-CONFIRM USER ACCOUNTS (20261104000003_auto_confirm_users.sql)
-- ------------------------------------------------------------------------------

-- 2.1 Confirm existing users in auth.users
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 2.2 Trigger function to auto-confirm new registrations
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS trigger AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.3 Attach before-insert trigger on auth.users
DROP TRIGGER IF EXISTS trg_auto_confirm_new_user ON auth.users;
CREATE TRIGGER trg_auto_confirm_new_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_new_user();

-- ------------------------------------------------------------------------------
-- PART 3: MINIMUM VIABLE TRANSACTION RECORD (20261110000001_mvtr_transactions.sql)
-- ------------------------------------------------------------------------------

-- 3.1 Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY DEFAULT ('txn_' || substr(md5(random()::text), 1, 12)),
  client_id UUID UNIQUE NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT NOT NULL DEFAULT 'Field Officer',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (
    status IN (
      'Draft',
      'FieldCaptured',
      'DealPackIncomplete',
      'DealPackComplete',
      'SubmittedForReview',
      'PendingApproval',
      'Approved',
      'Rejected'
    )
  ),
  buyer_id TEXT REFERENCES public.parties(id) ON DELETE SET NULL,
  supplier_id TEXT REFERENCES public.parties(id) ON DELETE SET NULL,
  commodity TEXT NOT NULL CHECK (
    commodity IN ('Maize', 'Beans', 'Soybeans', 'Sorghum', 'Rice', 'Cassava')
  ),
  buyer_requirements JSONB NOT NULL DEFAULT '{
    "buyer_name": "",
    "product_specification": "",
    "required_tonnes": 0,
    "moisture_limit_pct": 14.0,
    "quality_spec": "Grade 1 - Clean, dry, free of pests",
    "delivery_location": "",
    "delivery_district": "Gulu",
    "required_delivery_date": "",
    "purchasing_conditions": ""
  }'::jsonb,
  supplier_verification JSONB NOT NULL DEFAULT '{
    "supplier_name": "",
    "contact_person": "",
    "phone": "",
    "district": "Amuru",
    "location_details": "",
    "verification_status": "REPORTED",
    "claimed_tonnes": 0,
    "confirmed_tonnes": 0,
    "moisture_reading_pct": 0,
    "verification_date": "",
    "verifying_officer": "",
    "evidence_notes": ""
  }'::jsonb,
  transport_collection JSONB NOT NULL DEFAULT '{
    "arrangement": "Company-arranged",
    "collection_point": "",
    "destination": "",
    "transporter_name": "",
    "transporter_contact": "",
    "estimated_tonnes": 0,
    "transport_rate_per_tonne": 0,
    "total_transport_cost": 0,
    "collection_status": "Planned",
    "waybill_ref": "",
    "notes": ""
  }'::jsonb,
  payment_terms JSONB NOT NULL DEFAULT '{
    "agreed_price_per_kg": 0,
    "currency": "UGX",
    "payment_method": "Bank transfer",
    "payment_schedule": "On delivery and inspection",
    "deposit_required": false,
    "deposit_amount": 0,
    "outstanding_balance": 0,
    "payment_status": "Agreed",
    "payment_conditions": ""
  }'::jsonb,
  fee_margin JSONB NOT NULL DEFAULT '{
    "cng_fee_per_tonne": 30000,
    "minimum_fee": 25000,
    "calculation_basis": "Per tonne accepted",
    "expected_gross_fee": 0,
    "cost_field": 0,
    "cost_testing": 0,
    "cost_transport": 0,
    "cost_other": 0,
    "staff_hours": 0,
    "staff_rate_per_hour": 6000,
    "total_direct_costs": 0,
    "overhead_pct": 15,
    "overhead_amount": 0,
    "projected_net_margin": 0,
    "notes": ""
  }'::jsonb,
  decision_matrix JSONB NOT NULL DEFAULT '{
    "counterparty_reliability_score": 0,
    "quality_compliance_score": 0,
    "margin_feasibility_score": 0,
    "logistics_certainty_score": 0,
    "payment_security_score": 0,
    "total_score": 0,
    "max_score": 100,
    "recommendation": "Pending Evaluation",
    "explanation": "",
    "evaluator_name": "",
    "evaluation_date": ""
  }'::jsonb,
  approval JSONB NOT NULL DEFAULT '{
    "status": "Pending",
    "approver_id": null,
    "approver_name": "",
    "decision_date": null,
    "comments": "",
    "approval_evidence": "",
    "rejection_reason": ""
  }'::jsonb,
  notes TEXT,
  sync_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 Indexes on Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_client_id ON public.transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON public.transactions(reference);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer_id ON public.transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_supplier_id ON public.transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_transactions_commodity ON public.transactions(commodity);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON public.transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_updated_at ON public.transactions(updated_at DESC);

-- 3.3 Transaction Events Table
CREATE TABLE IF NOT EXISTS public.transaction_events (
  id TEXT PRIMARY KEY DEFAULT ('txev_' || substr(md5(random()::text), 1, 12)),
  transaction_id TEXT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  client_id UUID,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID REFERENCES auth.users(id),
  actor_name TEXT NOT NULL DEFAULT 'System',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_events_txn_id ON public.transaction_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_events_created_at ON public.transaction_events(created_at DESC);

-- 3.4 Approval Security Trigger (DEF-01)
CREATE OR REPLACE FUNCTION public.enforce_mvtr_approval_permissions()
RETURNS TRIGGER AS $$
DECLARE
  v_current_role text;
  v_old_approval_status text;
  v_new_approval_status text;
BEGIN
  v_current_role := public.current_user_role();
  
  v_old_approval_status := coalesce(OLD.approval->>'status', 'Pending');
  v_new_approval_status := coalesce(NEW.approval->>'status', 'Pending');

  IF (v_new_approval_status <> v_old_approval_status) OR (NEW.status IN ('Approved', 'Rejected') AND OLD.status NOT IN ('Approved', 'Rejected')) THEN
    IF v_current_role <> 'admin' THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Only Clarence or an authorized administrator can approve or reject transactions. Field officers cannot approve records.';
    END IF;

    IF v_new_approval_status = 'Approved' THEN
      NEW.status := 'Approved';
      NEW.approval := jsonb_set(
        jsonb_set(NEW.approval, '{decision_date}', to_jsonb(NOW()::text)),
        '{approver_id}',
        to_jsonb(auth.uid()::text)
      );
    ELSIF v_new_approval_status = 'Rejected' THEN
      NEW.status := 'Rejected';
      NEW.approval := jsonb_set(
        jsonb_set(NEW.approval, '{decision_date}', to_jsonb(NOW()::text)),
        '{approver_id}',
        to_jsonb(auth.uid()::text)
      );
    END IF;
  END IF;

  NEW.updated_at := NOW();
  NEW.sync_version := coalesce(OLD.sync_version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_mvtr_approval_permissions ON public.transactions;
CREATE TRIGGER trg_enforce_mvtr_approval_permissions
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mvtr_approval_permissions();

-- 3.5 RLS Policies on Transactions and Events
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select_authenticated" ON public.transactions;
CREATE POLICY "transactions_select_authenticated" ON public.transactions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "transactions_insert_authenticated" ON public.transactions;
CREATE POLICY "transactions_insert_authenticated" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('admin', 'user')
  );

DROP POLICY IF EXISTS "transactions_update_authenticated" ON public.transactions;
CREATE POLICY "transactions_update_authenticated" ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'user'
      AND status NOT IN ('Approved', 'Rejected')
    )
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'user'
      AND status NOT IN ('Approved', 'Rejected')
    )
  );

DROP POLICY IF EXISTS "transactions_delete_admin" ON public.transactions;
CREATE POLICY "transactions_delete_admin" ON public.transactions
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "transaction_events_select_authenticated" ON public.transaction_events;
CREATE POLICY "transaction_events_select_authenticated" ON public.transaction_events
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "transaction_events_insert_authenticated" ON public.transaction_events;
CREATE POLICY "transaction_events_insert_authenticated" ON public.transaction_events
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS "transaction_events_delete_admin" ON public.transaction_events;
CREATE POLICY "transaction_events_delete_admin" ON public.transaction_events
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- 3.6 Benchmark Seed Transaction
INSERT INTO public.transactions (
  id,
  client_id,
  reference,
  created_by_name,
  status,
  buyer_id,
  supplier_id,
  commodity,
  buyer_requirements,
  supplier_verification,
  transport_collection,
  payment_terms,
  fee_margin,
  decision_matrix,
  approval,
  notes
) VALUES (
  'txn_seed_0001',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'::uuid,
  'TXN-20261110-001',
  'Field Officer Ocen',
  'Approved',
  'p5',
  'p2',
  'Maize',
  '{
    "buyer_name": "Gulu Grain Millers Ltd",
    "product_specification": "White Maize, Grain Grade 1",
    "required_tonnes": 30,
    "moisture_limit_pct": 13.5,
    "quality_spec": "Grade 1 - moisture <13.5%, broken grains <2%, no aflatoxin",
    "delivery_location": "Gulu Industrial Area Mill #2",
    "delivery_district": "Gulu",
    "required_delivery_date": "2026-11-15",
    "purchasing_conditions": "Payment within 48h of weighbridge ticket and quality clearance"
  }'::jsonb,
  '{
    "supplier_name": "Amuru Farmers Cooperative Society",
    "contact_person": "Okello David",
    "phone": "+256 772 100 200",
    "district": "Amuru",
    "location_details": "Amuru Town Council Store #4",
    "verification_status": "VERIFIED",
    "claimed_tonnes": 35,
    "confirmed_tonnes": 30,
    "moisture_reading_pct": 12.8,
    "verification_date": "2026-11-09",
    "verifying_officer": "Field Officer Ocen",
    "evidence_notes": "Sample drawn from 300 bags. Calibrated mini-GAC reading 12.8% moisture."
  }'::jsonb,
  '{
    "arrangement": "Company-arranged",
    "collection_point": "Amuru Central Bulking Store",
    "destination": "Gulu Grain Millers Mill #2",
    "transporter_name": "Northern Hauliers Uganda",
    "transporter_contact": "+256 782 300 400",
    "estimated_tonnes": 30,
    "transport_rate_per_tonne": 25000,
    "total_transport_cost": 750000,
    "collection_status": "Planned",
    "waybill_ref": "WB-2026-1109-01",
    "notes": "Truck scheduled for loading 07:00 AM"
  }'::jsonb,
  '{
    "agreed_price_per_kg": 1150,
    "currency": "UGX",
    "payment_method": "Bank transfer",
    "payment_schedule": "50% on truck loading, 50% on mill weighbridge",
    "deposit_required": true,
    "deposit_amount": 17250000,
    "outstanding_balance": 17250000,
    "payment_status": "Agreed",
    "payment_conditions": "Stanbic escrow release on certificate of delivery"
  }'::jsonb,
  '{
    "cng_fee_per_tonne": 30000,
    "minimum_fee": 25000,
    "calculation_basis": "30 t @ UGX 30,000/t",
    "expected_gross_fee": 900000,
    "cost_field": 60000,
    "cost_testing": 25000,
    "cost_transport": 0,
    "cost_other": 15000,
    "staff_hours": 6,
    "staff_rate_per_hour": 6000,
    "total_direct_costs": 136000,
    "overhead_pct": 15,
    "overhead_amount": 135000,
    "projected_net_margin": 629000,
    "notes": "Healthy gross margin of UGX 900,000 against direct field and overhead costs."
  }'::jsonb,
  '{
    "counterparty_reliability_score": 18,
    "quality_compliance_score": 19,
    "margin_feasibility_score": 18,
    "logistics_certainty_score": 17,
    "payment_security_score": 18,
    "total_score": 90,
    "max_score": 100,
    "recommendation": "Proceed",
    "explanation": "High score (90/100). Low moisture (12.8%), verified cooperative volumes, and established miller.",
    "evaluator_name": "Field Officer Ocen",
    "evaluation_date": "2026-11-09"
  }'::jsonb,
  '{
    "status": "Approved",
    "approver_id": null,
    "approver_name": "Clarence (Managing Director)",
    "decision_date": "2026-11-09T16:30:00Z",
    "comments": "Approved for dispatch. Ensure weighbridge ticket is uploaded before final payout.",
    "approval_evidence": "Deal Pack v1 signed off",
    "rejection_reason": ""
  }'::jsonb,
  'Verified benchmark transaction captured in Amuru-Gulu corridor.'
) ON CONFLICT (client_id) DO NOTHING;
