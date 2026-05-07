-- Depreciating assets table for Village Bakery P&L
CREATE TABLE IF NOT EXISTS vb_depreciation_asset (
  asset_id          SERIAL PRIMARY KEY,
  description       TEXT NOT NULL,
  purchase_date     DATE NOT NULL,
  purchase_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
  residual_value    NUMERIC(12,2) NOT NULL DEFAULT 0,
  useful_life_months INTEGER NOT NULL DEFAULT 60,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Example seed data (adjust/delete as needed)
-- INSERT INTO vb_depreciation_asset (description, purchase_date, purchase_cost, residual_value, useful_life_months)
-- VALUES
--   ('Solar panel system / inverter', '2023-06-01', 85000, 5000, 120),
--   ('Commercial fridge',             '2022-03-01', 28000, 2000,  84),
--   ('Cage for gas bottles',          '2024-01-01',  3500,    0,  60),
--   ('4POS till system',              '2023-09-01',  8500,  500,  48),
--   ('Generator',                     '2023-11-01', 42000, 3000,  96);
