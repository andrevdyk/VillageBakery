import { NextRequest } from 'next/server'
import { calcSheet } from '@/lib/calc'
import type { CashUpSheet } from '@/lib/schema'

function buildExcelCSV(sheets: CashUpSheet[]): string {
  const rows: string[][] = []

  rows.push([
    'Date',
    'Total Cash',
    'Less Float',
    'Total Cash to Take Out',
    'Slips Paid Out',
    'Slips Total',
    'Total Cash Received',
    'Credit Card / Yoco',
    'Accounts',
    'Total Actual',
    'Till Total (Z Print)',
    'Over/Short Variance',
    'Curios Cash',
    'Curios Card',
    'Curios Total',
    'Curios Items',
    'Notes',
    'Scanned At',
  ])

  for (const s of sheets) {
    const calc = calcSheet(s)

    const slipsDesc = (s.slips_paid_out ?? [])
      .map((x) => `${x.description}: R${(x.amount ?? 0).toFixed(2)}`)
      .join(' | ')
    const slipsTotal = calc.slipsTotal

    const curiosItems = (s.curios_sales ?? [])
      .map((x) => `${x.name}${x.description ? ` — ${x.description}` : ''}: R${(x.amount ?? 0).toFixed(2)} (${x.payment_type})`)
      .join(' | ')
    const curiosCash = (s.curios_sales ?? [])
      .filter((c) => c.payment_type === 'cash')
      .reduce((sum, c) => sum + (c.amount ?? 0), 0)
    const curiosCard = (s.curios_sales ?? [])
      .filter((c) => c.payment_type === 'card')
      .reduce((sum, c) => sum + (c.amount ?? 0), 0)

    rows.push([
      s.sheet_date ?? '',
      fmt(s.total_cash),
      '1000.00',
      calc.totalCashToTakeOut.toFixed(2),
      slipsDesc,
      slipsTotal.toFixed(2),
      calc.totalCashReceived.toFixed(2),
      fmt(s.credit_card_yoco),
      fmt(s.charged_sales_accounts),
      calc.totalActual.toFixed(2),
      fmt(s.till_total_z_print),
      calc.variance.toFixed(2),
      curiosCash.toFixed(2),
      curiosCard.toFixed(2),
      (curiosCash + curiosCard).toFixed(2),
      curiosItems,
      s.notes ?? '',
      new Date(s.created_at).toLocaleString('en-ZA'),
    ])
  }

  const csvLines = rows.map((row) =>
    row
      .map((cell) => {
        const str = String(cell)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      })
      .join(',')
  )

  return '\uFEFF' + csvLines.join('\r\n')
}

function fmt(val: number | null | undefined): string {
  return val != null ? val.toFixed(2) : ''
}

export async function POST(req: NextRequest) {
  try {
    const { sheets } = (await req.json()) as { sheets: CashUpSheet[] }

    if (!Array.isArray(sheets) || sheets.length === 0) {
      return Response.json({ error: 'No sheets provided' }, { status: 400 })
    }

    const csv = buildExcelCSV(sheets)
    const today = new Date().toISOString().split('T')[0]
    const filename = `village-bakery-cashup-${today}.csv`

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[v0] Excel export error:', error)
    return Response.json({ error: 'Export failed' }, { status: 500 })
  }
}

