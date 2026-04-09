/**
 * Seed script — inserts March 2026 + April 2026 cash up data.
 * All entries are card payments (credit_card_yoco), total_cash = 0.
 * Run: npx tsx scripts/seed-cashup-data.ts
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MARCH: Array<{ date: string; excl: number; incl: number }> = [
  { date: '1-Mar-26',  excl: 3988.48,  incl: 4586.75 },
  { date: '2-Mar-26',  excl: 2749.83,  incl: 3162.30 },
  { date: '3-Mar-26',  excl: 3761.18,  incl: 4325.36 },
  { date: '4-Mar-26',  excl: 2822.57,  incl: 3245.95 },
  { date: '5-Mar-26',  excl: 2698.58,  incl: 3103.37 },
  { date: '6-Mar-26',  excl: 4252.43,  incl: 4890.30 },
  { date: '7-Mar-26',  excl: 5048.97,  incl: 5806.31 },
  { date: '8-Mar-26',  excl: 2902.96,  incl: 3338.40 },
  { date: '9-Mar-26',  excl: 1764.35,  incl: 2029.00 },
  { date: '10-Mar-26', excl: 3157.13,  incl: 3630.70 },
  { date: '11-Mar-26', excl: 2420.32,  incl: 2783.37 },
  { date: '12-Mar-26', excl: 3987.39,  incl: 4585.50 },
  { date: '13-Mar-26', excl: 4643.52,  incl: 5340.05 },
  { date: '14-Mar-26', excl: 4170.30,  incl: 4795.85 },
  { date: '15-Mar-26', excl: 2695.74,  incl: 3100.10 },
  { date: '16-Mar-26', excl: 2703.09,  incl: 3108.55 },
  { date: '17-Mar-26', excl: 2223.61,  incl: 2557.15 },
  { date: '18-Mar-26', excl: 2343.00,  incl: 2694.45 },
  { date: '19-Mar-26', excl: 3846.30,  incl: 4423.25 },
  { date: '20-Mar-26', excl: 8325.82,  incl: 9574.69 },
  { date: '21-Mar-26', excl: 17667.09, incl: 20317.15 },
  { date: '22-Mar-26', excl: 9324.96,  incl: 10723.70 },
  { date: '23-Mar-26', excl: 5386.95,  incl: 6194.99 },
  { date: '24-Mar-26', excl: 2834.89,  incl: 3260.12 },
  { date: '25-Mar-26', excl: 4421.61,  incl: 5084.85 },
  { date: '26-Mar-26', excl: 3334.23,  incl: 3834.37 },
  { date: '27-Mar-26', excl: 4257.77,  incl: 4896.43 },
  { date: '28-Mar-26', excl: 4661.35,  incl: 5360.55 },
  { date: '29-Mar-26', excl: 6253.13,  incl: 7191.10 },
  { date: '30-Mar-26', excl: 3077.87,  incl: 3539.55 },
  { date: '31-Mar-26', excl: 5376.04,  incl: 6182.45 },
]

const APRIL: Array<{ date: string; excl: number; incl: number }> = [
  { date: '1-Apr-26', excl: 5267.96, incl: 6058.15 },
  { date: '2-Apr-26', excl: 6124.83, incl: 7043.55 },
  { date: '3-Apr-26', excl: 8324.09, incl: 9572.70 },
  { date: '4-Apr-26', excl: 8482.71, incl: 9755.12 },
  { date: '5-Apr-26', excl: 9248.52, incl: 10635.80 },
]

async function seed() {
  const rows = [...MARCH, ...APRIL].map(({ date, excl, incl }) => ({
    sheet_date: date,
    total_cash: 0,
    slips_paid_out: [],
    credit_card_yoco: incl,       // till total = incl VAT amount, all card
    charged_sales_accounts: 0,
    till_total_z_print: incl,
    curios_sales: [],
    notes: `Sales excl VAT: R${excl.toFixed(2)}`,
    image_url: null,
    raw_text: null,
  }))

  const { data, error } = await supabase
    .from('cash_up_sheets')
    .insert(rows)
    .select('id, sheet_date')

  if (error) {
    console.error('Seed error:', error.message)
    process.exit(1)
  }

  console.log(`Inserted ${data?.length ?? 0} rows:`)
  data?.forEach((r) => console.log(`  ${r.sheet_date} → ${r.id}`))
}

seed()
