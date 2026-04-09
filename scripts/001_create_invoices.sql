-- Drop old tables if they exist
DROP TABLE IF EXISTS public.invoices;

-- Create simplified cash_up_sheets table (float always 1000, calcs done in app)
CREATE TABLE IF NOT EXISTS public.cash_up_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sheet_date TEXT,
  total_cash NUMERIC(10,2),
  slips_paid_out JSONB DEFAULT '[]'::jsonb,
  credit_card_yoco NUMERIC(10,2),
  charged_sales_accounts NUMERIC(10,2),
  till_total_z_print NUMERIC(10,2),
  curios_sales JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  image_url TEXT,
  raw_text TEXT
);

ALTER TABLE public.cash_up_sheets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cash_up_sheets'
    AND policyname = 'Allow all cash_up_sheets operations'
  ) THEN
    CREATE POLICY "Allow all cash_up_sheets operations"
      ON public.cash_up_sheets
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
