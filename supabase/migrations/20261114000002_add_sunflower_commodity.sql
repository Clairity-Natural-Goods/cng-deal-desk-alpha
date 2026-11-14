-- ==============================================================================
--   CNG DEAL DESK ALPHA V2 — COMMODITY EXPANSION: ADD SUNFLOWER
--   File: supabase/migrations/20261114000002_add_sunflower_commodity.sql
--   Purpose: Adds 'Sunflower' to the allowable commodities across observations
--            and transactions tables.
-- ==============================================================================

-- 1. Update observations commodity check constraint
ALTER TABLE public.observations DROP CONSTRAINT IF EXISTS observations_commodity_check;
ALTER TABLE public.observations ADD CONSTRAINT observations_commodity_check 
  CHECK (commodity IN ('Maize', 'Beans', 'Soybeans', 'Sorghum', 'Rice', 'Cassava', 'Sunflower'));

-- 2. Update transactions commodity check constraint
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_commodity_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_commodity_check 
  CHECK (commodity IN ('Maize', 'Beans', 'Soybeans', 'Sorghum', 'Rice', 'Cassava', 'Sunflower'));
