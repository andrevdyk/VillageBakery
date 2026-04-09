import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SEED_DATA = [
  { date: '2026-03-01', total: 4586.75 },
  { date: '2026-03-02', total: 3162.30 },
  { date: '2026-03-03', total: 4325.36 },
  { date: '2026-03-04', total: 3245.95 },
  { date: '2026-03-05', total: 3103.37 },
  { date: '2026-03-06', total: 4890.30 },
  { date: '2026-03-07', total: 5806.31 },
  { date: '2026-03-08', total: 3338.40 },
  { date: '2026-03-09', total: 2029.00 },
  { date: '2026-03-10', total: 3630.70 },
  { date: '2026-03-11', total: 2783.37 },
  { date: '2026-03-12', total: 4585.50 },
  { date: '2026-03-13', total: 5340.05 },
  { date: '2026-03-14', total: 4795.85 },
  { date: '2026-03-15', total: 3100.10 },
  { date: '2026-03-16', total: 3108.55 },
  { date: '2026-03-17', total: 2557.15 },
  { date: '2026-03-18', total: 2694.45 },
  { date: '2026-03-19', total: 4423.25 },
  { date: '2026-03-20', total: 9574.69 },
  { date: '2026-03-21', total: 20317.15 },
  { date: '2026-03-22', total: 10723.70 },
  { date: '2026-03-23', total: 6194.99 },
  { date: '2026-03-24', total: 3260.12 },
  { date: '2026-03-25', total: 5084.85 },
  { date: '2026-03-26', total: 3834.37 },
  { date: '2026-03-27', total: 4896.43 },
  { date: '2026-03-28', total: 5360.55 },
  { date: '2026-03-29', total: 7191.10 },
  { date: '2026-03-30', total: 3539.55 },
  { date: '2026-03-31', total: 6182.45 },
  { date: '2026-04-01', total: 6058.15 },
  { date: '2026-04-02', total: 7043.55 },
  { date: '2026-04-03', total: 9572.74 },
  { date: '2026-04-04', total: 9755.12 },
  { date: '2026-04-05', total: 10635.80 },
]

export async function GET() {
  const supabase = await createClient()

  const rows = SEED_DATA.map(({ date, total }) => ({
    sheet_date: date,
    total_cash: 0,
    credit_card_yoco: total,
    charged_sales_accounts: 0,
    till_total_z_print: total,
    slips_paid_out: [],
    curios_sales: [],
    notes: null,
    raw_text: null,
    image_url: null,
  }))

  const { error, count } = await supabase
    .from('cash_up_sheets')
    .insert(rows, { count: 'exact' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inserted: count })
}
