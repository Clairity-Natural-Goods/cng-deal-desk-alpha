-- ==============================================================================
-- CNG DEAL DESK ALPHA V2 — SYNC STATUS & DRAFT PERSISTENCE IN BACKEND
-- Migration: 20261114000004_add_sync_status_to_transactions.sql
-- Description: Adds sync_status column to public.transactions so pending sync
--              and drafts are persisted, indexed, and tracked directly in Supabase.
-- ==============================================================================

-- 1. Add sync_status column with validation check
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'pending_sync'
  CHECK (sync_status IN ('pending_sync', 'synced', 'sync_failed'));

-- 2. Backfill existing records: drafts retain 'pending_sync', completed/approved become 'synced'
UPDATE public.transactions
  SET sync_status = CASE
    WHEN status = 'Draft' THEN 'pending_sync'
    ELSE 'synced'
  END
  WHERE sync_status IS NULL OR sync_status = 'pending_sync';

-- 3. High-performance indexes for status and sync_status filtering
CREATE INDEX IF NOT EXISTS idx_transactions_sync_status ON public.transactions(sync_status);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
