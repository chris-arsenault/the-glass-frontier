-- Agent-panel narrations recorded alongside the canonical GM response while
-- the retrieval-driven narrator is under evaluation.
ALTER TABLE chronicle_turn
  ADD COLUMN IF NOT EXISTS prose_alternates jsonb,
  ADD COLUMN IF NOT EXISTS prose_cost_usd double precision;
