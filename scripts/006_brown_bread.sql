-- Add brown bread tracking columns to cash_up_sheets
ALTER TABLE cash_up_sheets
  ADD COLUMN IF NOT EXISTS new_bb_sold   integer        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS old_bb_sold   integer        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS new_bb_price  numeric(10,2)  DEFAULT 22,
  ADD COLUMN IF NOT EXISTS old_bb_price  numeric(10,2)  DEFAULT 12;
