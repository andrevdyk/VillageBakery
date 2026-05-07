-- Add category column to vb_expense table
ALTER TABLE vb_expense
  ADD COLUMN IF NOT EXISTS category TEXT;
