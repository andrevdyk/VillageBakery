import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import type { CurioEntry, Seller } from '@/lib/schema'
import { calcCuriosCommissions } from '@/lib/calc'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface SheetRow {
  sheet_date: string | null
  entries: CurioEntry[]
}

function getMonthName(dateStr: string | null): string {
  if (!dateStr) return 'Undated'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return MONTHS[d.getMonth()]
}

function buildSellerSheet(
  sellerName: string,
  rows: SheetRow[],
  sellerDefaultPct: number
): XLSX.WorkSheet {
  const wsData: (string | number)[][] = []

  // Group rows by month
  const byMonth = new Map<string, SheetRow[]>()
  for (const row of rows) {
    const month = getMonthName(row.sheet_date)
    if (!byMonth.has(month)) byMonth.set(month, [])
    byMonth.get(month)!.push(row)
  }

  for (const [month, monthRows] of byMonth.entries()) {
    // Month header row
    wsData.push([month.toUpperCase()])

    // Column headers
    wsData.push(['DATE', 'DESCRIPTION', 'AMOUNT', '%', 'COMM', 'PAYOUT'])

    let monthTotal = 0
    let monthComm = 0
    let monthPayout = 0

    for (const row of monthRows) {
      const dateLabel = row.sheet_date
        ? new Date(row.sheet_date).getDate().toString()
        : ''

      for (const entry of row.entries) {
        const amount = entry.amount ?? 0
        const pct = entry.commission_pct ?? sellerDefaultPct
        const comm = (amount * pct) / 100
        const payout = amount - comm

        wsData.push([
          dateLabel,
          entry.description || '',
          amount,
          `${pct.toFixed(2)}%`,
          parseFloat(comm.toFixed(2)),
          parseFloat(payout.toFixed(2)),
        ])

        monthTotal += amount
        monthComm += comm
        monthPayout += payout
      }
    }

    // Month totals row
    wsData.push([
      '',
      'TOTALS',
      parseFloat(monthTotal.toFixed(2)),
      '',
      parseFloat(monthComm.toFixed(2)),
      parseFloat(monthPayout.toFixed(2)),
    ])

    // Blank spacer row between months
    wsData.push([])
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = [
    { wch: 6 },  // DATE
    { wch: 28 }, // DESCRIPTION
    { wch: 12 }, // AMOUNT
    { wch: 8 },  // %
    { wch: 12 }, // COMM
    { wch: 12 }, // PAYOUT
  ]

  return ws
}

export async function POST(req: NextRequest) {
  try {
    const { sheets, sellers } = (await req.json()) as {
      sheets: SheetRow[]
      sellers: Seller[]
    }

    if (!Array.isArray(sheets) || sheets.length === 0) {
      return Response.json({ error: 'No sheets provided' }, { status: 400 })
    }

    const sellerMap = new Map(sellers.map((s) => [s.name.toLowerCase().trim(), s]))

    // Group all entries across all sheets by seller name
    const bySeller = new Map<string, SheetRow[]>()
    for (const sheet of sheets) {
      const entriesBySeller = new Map<string, CurioEntry[]>()
      for (const entry of sheet.entries ?? []) {
        const key = (entry.name ?? 'Unknown').toLowerCase().trim()
        if (!entriesBySeller.has(key)) entriesBySeller.set(key, [])
        entriesBySeller.get(key)!.push(entry)
      }

      for (const [sellerKey, entries] of entriesBySeller.entries()) {
        if (!bySeller.has(sellerKey)) bySeller.set(sellerKey, [])
        bySeller.get(sellerKey)!.push({ sheet_date: sheet.sheet_date, entries })
      }
    }

    const wb = XLSX.utils.book_new()
    const usedSheetNames = new Set<string>()

    for (const [sellerKey, sellerRows] of bySeller.entries()) {
      const seller = sellerMap.get(sellerKey)
      const defaultPct = seller?.commission_pct ?? 20

      // Build a unique sheet name within Excel's 31-char limit
      let baseName = (seller?.name || sellerRows[0].entries[0]?.name || sellerKey)
        .substring(0, 31)
        .replace(/[:\\/?*[\]]/g, '')
        .trim()
      let sheetName = baseName
      let counter = 2
      while (usedSheetNames.has(sheetName.toLowerCase())) {
        sheetName = `${baseName.substring(0, 28)} ${counter++}`
      }
      usedSheetNames.add(sheetName.toLowerCase())

      const ws = buildSellerSheet(sellerKey, sellerRows, defaultPct)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const today = new Date().toISOString().split('T')[0]
    const filename = `village-bakery-curios-${today}.xlsx`

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[v0] Curios export error:', error)
    return Response.json({ error: 'Export failed' }, { status: 500 })
  }
}
