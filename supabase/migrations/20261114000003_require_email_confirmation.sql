-- ==============================================================================
-- CNG DEAL DESK ALPHA V2 — STRICT EMAIL CONFIRMATION ENFORCEMENT
-- Migration: 20261114000003_require_email_confirmation.sql
-- Description:
--   1. Drops the legacy auto_confirm_new_user trigger so users MUST verify
--      their email address via Gmail/SMTP before signing in.
--   2. Ensures RLS policies allow authenticated users to insert & update drafts.
-- ==============================================================================

-- 1. Remove auto-confirm trigger on auth.users so Supabase sends real confirmation emails
DROP TRIGGER IF EXISTS trg_auto_confirm_new_user ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_new_user();

-- 2. Ensure authenticated users can insert and update draft transactions without restriction
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

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
      AND (
        status NOT IN ('Approved', 'Rejected')
        OR created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'user'
      AND (
        status NOT IN ('Approved', 'Rejected')
        OR created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "transactions_select_authenticated" ON public.transactions;
CREATE POLICY "transactions_select_authenticated" ON public.transactions
  FOR SELECT TO authenticated
  USING (true);
