CREATE TABLE ops.llm_budget_period (
  player_id text NOT NULL,
  period date NOT NULL,
  spent_usd numeric(14, 6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT llm_budget_period_pk PRIMARY KEY (player_id, period),
  CONSTRAINT llm_budget_period_amount_check CHECK (spent_usd >= 0)
);

CREATE TABLE ops.llm_budget_entry (
  id text PRIMARY KEY,
  player_id text NOT NULL,
  period date NOT NULL,
  reserved_usd numeric(14, 6) NOT NULL,
  spent_usd numeric(14, 6) NOT NULL DEFAULT 0,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT llm_budget_entry_period_fk
    FOREIGN KEY (player_id, period)
    REFERENCES ops.llm_budget_period(player_id, period)
    ON DELETE CASCADE,
  CONSTRAINT llm_budget_entry_status_check
    CHECK (status IN ('pending', 'settled', 'released', 'expired')),
  CONSTRAINT llm_budget_entry_amounts_check
    CHECK (reserved_usd >= 0 AND spent_usd >= 0)
);

CREATE INDEX llm_budget_entry_player_period_status_idx
  ON ops.llm_budget_entry (player_id, period, status);
CREATE INDEX llm_budget_entry_expires_idx
  ON ops.llm_budget_entry (expires_at)
  WHERE status = 'pending';
