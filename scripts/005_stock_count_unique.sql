-- Add unique constraints required for upsert on_conflict to work
-- Run in Supabase SQL editor

-- First deduplicate any existing rows (keep the latest count_id per item+date)
DELETE FROM vb_retail_stock_count a
  USING vb_retail_stock_count b
  WHERE a.item_id = b.item_id
    AND a.count_date = b.count_date
    AND a.count_id < b.count_id;

DELETE FROM vb_food_stock_count a
  USING vb_food_stock_count b
  WHERE a.item_id = b.item_id
    AND a.count_date = b.count_date
    AND a.count_id < b.count_id;

-- Add the constraints
ALTER TABLE vb_retail_stock_count
  ADD CONSTRAINT vb_retail_stock_count_item_date_key UNIQUE (item_id, count_date);

ALTER TABLE vb_food_stock_count
  ADD CONSTRAINT vb_food_stock_count_item_date_key UNIQUE (item_id, count_date);
