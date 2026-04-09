-- Create curios_sellers table (configurable sellers with commission rates)
CREATE TABLE IF NOT EXISTS public.curios_sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  display_name TEXT,
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00
);

ALTER TABLE public.curios_sellers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'curios_sellers'
    AND policyname = 'Allow all curios_sellers operations'
  ) THEN
    CREATE POLICY "Allow all curios_sellers operations"
      ON public.curios_sellers
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed default sellers
INSERT INTO public.curios_sellers (name, display_name, commission_pct)
VALUES
  ('Belinda M', 'B.Creations / Belinda M', 20.00),
  ('Linda M', 'Linda M', 20.00),
  ('Book Nook', 'Book Nook', 100.00),
  ('Ant V', 'Ant V', 20.00)
ON CONFLICT DO NOTHING;

-- Create curios_sheets table (separate from cash up sheets)
CREATE TABLE IF NOT EXISTS public.curios_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sheet_date TEXT,
  entries JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  image_url TEXT,
  raw_text TEXT
);

ALTER TABLE public.curios_sheets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'curios_sheets'
    AND policyname = 'Allow all curios_sheets operations'
  ) THEN
    CREATE POLICY "Allow all curios_sheets operations"
      ON public.curios_sheets
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
