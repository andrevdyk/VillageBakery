import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs'
import { calcSheet } from '@/lib/calc'
import type { CashUpSheet } from '@/lib/schema'

// ─── Brand palette ────────────────────────────────────────────────────────────
const C = {
  coffee:    '5C3D2E',   // dark espresso brown — headers
  caramel:   'C4874A',   // warm caramel — accents / totals stripe
  wheat:     'D4A96A',   // golden wheat — totals row bg
  cream:     'FDF6EC',   // light cream — alt row bg
  white:     'FFFFFF',
  lightBg:   'FAF5EE',   // very light warm white for sheet bg
  green:     '16A34A',   // positive variance
  red:       'DC2626',   // negative variance
  mutedText: '888888',
  darkText:  '2C1810',
}

const currFmt = '"R"#,##0.00'
const intFmt  = '#,##0'

function argb(hex: string) { return `FF${hex}` }

function solidFill(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } }
}

function thinBorder(hex = 'DDDDDD'): Partial<ExcelJS.Borders> {
  const s: ExcelJS.Border = { style: 'thin', color: { argb: argb(hex) } }
  return { top: s, bottom: s, left: s, right: s }
}

function applyHeaderCell(cell: ExcelJS.Cell, value: string, align: ExcelJS.Alignment['horizontal'] = 'left') {
  cell.value = value
  cell.font  = { bold: true, size: 10, color: { argb: argb(C.white) }, name: 'Calibri' }
  cell.fill  = solidFill(C.coffee)
  cell.alignment = { horizontal: align, vertical: 'middle', wrapText: false }
  cell.border = {
    bottom: { style: 'medium', color: { argb: argb(C.caramel) } },
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { sheets } = (await req.json()) as { sheets: CashUpSheet[] }

    if (!Array.isArray(sheets) || sheets.length === 0) {
      return Response.json({ error: 'No sheets provided' }, { status: 400 })
    }

    // Sort newest → oldest
    const sorted = [...sheets].sort((a, b) => {
      const da = a.sheet_date ?? a.created_at.slice(0, 10)
      const db = b.sheet_date ?? b.created_at.slice(0, 10)
      return db.localeCompare(da)
    })

    const wb = new ExcelJS.Workbook()
    wb.creator  = 'Village Bakery'
    wb.created  = new Date()
    wb.modified = new Date()

    const ws = wb.addWorksheet('Daily Cash Up', {
      pageSetup: {
        paperSize:   9,
        orientation: 'landscape',
        fitToPage:   true,
        fitToWidth:  1,
        fitToHeight: 0,
        margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
      },
      properties: { tabColor: { argb: argb(C.caramel) } },
    })

    // ── Column widths ─────────────────────────────────────────────────────────
    ws.columns = [
      { key: 'date',      width: 14 },  // A
      { key: 'cash',      width: 14 },  // B
      { key: 'card',      width: 14 },  // C
      { key: 'accounts',  width: 14 },  // D
      { key: 'total',     width: 14 },  // E
      { key: 'till',      width: 14 },  // F
      { key: 'variance',  width: 13 },  // G
      { key: 'new_bb',    width: 18 },  // H
      { key: 'old_bb',    width: 18 },  // I
      { key: 'bb_total',  width: 14 },  // J
      { key: 'slips',     width: 36 },  // K
      { key: 'notes',     width: 42 },  // L
    ]

    const TOTAL_COLS = 12  // A–L

    // ── Logo + header block ───────────────────────────────────────────────────
    // Rows 1-4 reserved for branding. Logo occupies A1:B4.
    ws.getRow(1).height = 26
    ws.getRow(2).height = 26
    ws.getRow(3).height = 18
    ws.getRow(4).height = 16

    // Try to embed the logo
    const logoPath = path.join(process.cwd(), 'public', 'logo.png')
    if (fs.existsSync(logoPath)) {
      const logoId = wb.addImage({ filename: logoPath, extension: 'png' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ws.addImage(logoId, { tl: { col: 0, row: 0 } as any, ext: { width: 180, height: 84 }, editAs: 'oneCell' })
    }

    // Title — right side of header (columns C–L = indices 2–11)
    ws.mergeCells('C1:L2')
    const titleCell = ws.getCell('C1')
    titleCell.value     = 'Village Bakery'
    titleCell.font      = { bold: true, size: 22, color: { argb: argb(C.coffee) }, name: 'Calibri' }
    titleCell.alignment = { horizontal: 'right', vertical: 'bottom' }

    ws.mergeCells('C3:L3')
    const subtitleCell = ws.getCell('C3')
    subtitleCell.value     = 'Daily Cash Up Report'
    subtitleCell.font      = { bold: false, size: 13, italic: true, color: { argb: argb(C.caramel) }, name: 'Calibri' }
    subtitleCell.alignment = { horizontal: 'right', vertical: 'middle' }

    ws.mergeCells('C4:L4')
    const metaCell  = ws.getCell('C4')
    const dateRange = sorted.length > 1
      ? `${sorted[sorted.length - 1].sheet_date ?? '?'} – ${sorted[0].sheet_date ?? '?'}`
      : sorted[0].sheet_date ?? ''
    metaCell.value     = `Generated ${new Date().toLocaleDateString('en-ZA')}  ·  ${sorted.length} sheet${sorted.length !== 1 ? 's' : ''}  ·  ${dateRange}`
    metaCell.font      = { size: 9, color: { argb: argb(C.mutedText) }, name: 'Calibri' }
    metaCell.alignment = { horizontal: 'right', vertical: 'middle' }

    // Light background across header rows
    for (let r = 1; r <= 4; r++) {
      for (let c = 1; c <= TOTAL_COLS; c++) {
        const cell = ws.getCell(r, c)
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).pattern === undefined) {
          cell.fill = solidFill(C.lightBg)
        }
      }
    }

    // ── Spacer row ────────────────────────────────────────────────────────────
    ws.getRow(5).height = 6

    // ── Column headers (row 6) ────────────────────────────────────────────────
    const HDR = 6
    ws.getRow(HDR).height = 30

    const headers: { label: string; align: ExcelJS.Alignment['horizontal'] }[] = [
      { label: 'Date',          align: 'left'  },
      { label: 'Cash',          align: 'right' },
      { label: 'Card / Yoco',   align: 'right' },
      { label: 'Accounts',      align: 'right' },
      { label: 'Total',         align: 'right' },
      { label: 'Till (Z Print)',align: 'right' },
      { label: 'Variance',      align: 'right' },
      { label: 'New Brown Bread',align: 'left' },
      { label: 'Old Brown Bread',align: 'left' },
      { label: 'BB Total',      align: 'right' },
      { label: 'Slips Paid Out',align: 'left'  },
      { label: 'Notes',         align: 'left'  },
    ]
    headers.forEach(({ label, align }, i) => applyHeaderCell(ws.getCell(HDR, i + 1), label, align))

    // ── Data rows ─────────────────────────────────────────────────────────────
    const totals = { cash: 0, card: 0, accounts: 0, total: 0, till: 0, variance: 0, bb: 0 }

    sorted.forEach((s, idx) => {
      const calc      = calcSheet(s)
      const isAlt     = idx % 2 === 1
      const bg        = isAlt ? C.cream : C.white
      const newBBVal  = (s.new_bb_sold ?? 0) * (s.new_bb_price ?? 22)
      const oldBBVal  = (s.old_bb_sold ?? 0) * (s.old_bb_price ?? 12)
      const bbTot     = newBBVal + oldBBVal
      const slipsText = (s.slips_paid_out ?? [])
        .map((sl) => `${sl.description?.trim() ?? '—'}: R${(sl.amount ?? 0).toFixed(2)}`)
        .join(' | ')

      totals.cash      += s.total_cash ?? 0
      totals.card      += s.credit_card_yoco ?? 0
      totals.accounts  += s.charged_sales_accounts ?? 0
      totals.total     += calc.totalActual
      totals.till      += s.till_total_z_print ?? 0
      totals.variance  += calc.variance
      totals.bb        += bbTot

      const rowNum = HDR + 1 + idx
      const row    = ws.getRow(rowNum)
      row.height   = 20

      // A: Date
      const dateCell2 = row.getCell(1)
      dateCell2.value     = s.sheet_date ?? s.created_at.slice(0, 10)
      dateCell2.font      = { bold: true, size: 10, color: { argb: argb(C.darkText) }, name: 'Calibri' }
      dateCell2.fill      = solidFill(bg)
      dateCell2.alignment = { vertical: 'middle' }
      dateCell2.border    = thinBorder()

      // B–F: numeric columns
      const numCols: [number, number | null][] = [
        [2, s.total_cash],
        [3, s.credit_card_yoco],
        [4, s.charged_sales_accounts],
        [5, calc.totalActual],
        [6, s.till_total_z_print],
      ]
      numCols.forEach(([col, val]) => {
        const cell   = row.getCell(col)
        cell.value   = val ?? null
        cell.numFmt  = currFmt
        cell.fill    = solidFill(col === 5 ? (isAlt ? 'FFF3E3' : 'FFF8F0') : bg)
        cell.font    = col === 5
          ? { bold: true, size: 10, color: { argb: argb(C.caramel) }, name: 'Calibri' }
          : { size: 10, color: { argb: argb(C.darkText) }, name: 'Calibri' }
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
        cell.border  = thinBorder()
      })

      // G: Variance
      const varCell   = row.getCell(7)
      varCell.value   = calc.variance
      varCell.numFmt  = '"R"#,##0.00;[Red]-"R"#,##0.00'
      varCell.fill    = solidFill(bg)
      varCell.font    = {
        bold: true, size: 10, name: 'Calibri',
        color: { argb: argb(calc.variance >= 0 ? C.green : C.red) },
      }
      varCell.alignment = { horizontal: 'right', vertical: 'middle' }
      varCell.border  = thinBorder()

      // H: New BB
      const newBBCell   = row.getCell(8)
      newBBCell.value   = (s.new_bb_sold ?? 0) > 0
        ? `${s.new_bb_sold} × R${(s.new_bb_price ?? 22).toFixed(2)} = R${newBBVal.toFixed(2)}`
        : '—'
      newBBCell.fill    = solidFill(bg)
      newBBCell.font    = { size: 10, color: { argb: argb(C.darkText) }, name: 'Calibri' }
      newBBCell.alignment = { vertical: 'middle' }
      newBBCell.border  = thinBorder()

      // I: Old BB
      const oldBBCell   = row.getCell(9)
      oldBBCell.value   = (s.old_bb_sold ?? 0) > 0
        ? `${s.old_bb_sold} × R${(s.old_bb_price ?? 12).toFixed(2)} = R${oldBBVal.toFixed(2)}`
        : '—'
      oldBBCell.fill    = solidFill(bg)
      oldBBCell.font    = { size: 10, color: { argb: argb(C.darkText) }, name: 'Calibri' }
      oldBBCell.alignment = { vertical: 'middle' }
      oldBBCell.border  = thinBorder()

      // J: BB Total
      const bbCell   = row.getCell(10)
      bbCell.value   = bbTot > 0 ? bbTot : null
      bbCell.numFmt  = currFmt
      bbCell.fill    = solidFill(bg)
      bbCell.font    = bbTot > 0
        ? { bold: true, size: 10, color: { argb: argb(C.coffee) }, name: 'Calibri' }
        : { size: 10, color: { argb: argb(C.mutedText) }, name: 'Calibri' }
      bbCell.alignment = { horizontal: 'right', vertical: 'middle' }
      bbCell.border  = thinBorder()

      // K: Slips
      const slipsCell   = row.getCell(11)
      slipsCell.value   = slipsText || '—'
      slipsCell.fill    = solidFill(bg)
      slipsCell.font    = { size: 9, color: { argb: argb(C.darkText) }, name: 'Calibri' }
      slipsCell.alignment = { vertical: 'middle', wrapText: true }
      slipsCell.border  = thinBorder()

      // L: Notes
      const notesCell   = row.getCell(12)
      notesCell.value   = s.notes ?? '—'
      notesCell.fill    = solidFill(bg)
      notesCell.font    = { size: 9, italic: true, color: { argb: argb(C.darkText) }, name: 'Calibri' }
      notesCell.alignment = { vertical: 'middle', wrapText: true }
      notesCell.border  = thinBorder()
    })

    // ── Totals row ────────────────────────────────────────────────────────────
    const totalsRowNum = HDR + 1 + sorted.length
    const totalsRow    = ws.getRow(totalsRowNum)
    totalsRow.height   = 28

    const topBorder: ExcelJS.Border = { style: 'medium', color: { argb: argb(C.coffee) } }

    const totalsData: [number, string | number | null, string, boolean][] = [
      [1,  `TOTAL  (${sorted.length} sheets)`, 'left',  true ],
      [2,  totals.cash,      'right', false],
      [3,  totals.card,      'right', false],
      [4,  totals.accounts,  'right', false],
      [5,  totals.total,     'right', true ],
      [6,  totals.till,      'right', false],
      [7,  totals.variance,  'right', true ],
      [8,  null,             'left',  false],
      [9,  null,             'left',  false],
      [10, totals.bb > 0 ? totals.bb : null, 'right', false],
      [11, null,             'left',  false],
      [12, null,             'left',  false],
    ]

    totalsData.forEach(([col, val, align, bold]) => {
      const cell      = totalsRow.getCell(col)
      cell.value      = val
      cell.fill       = solidFill(C.wheat)
      cell.font       = { bold, size: 10, color: { argb: argb(C.coffee) }, name: 'Calibri' }
      cell.alignment  = { horizontal: align as ExcelJS.Alignment['horizontal'], vertical: 'middle' }
      cell.border     = { top: topBorder }
      if (typeof val === 'number' && col !== 1) {
        if (col === 7) {
          cell.numFmt = '"R"#,##0.00;[Red]-"R"#,##0.00'
          cell.font   = { bold: true, size: 10, color: { argb: argb(totals.variance >= 0 ? C.green : C.red) }, name: 'Calibri' }
        } else {
          cell.numFmt = currFmt
        }
      }
    })

    // ── Footer note ───────────────────────────────────────────────────────────
    const footerRow = ws.getRow(totalsRowNum + 2)
    footerRow.height = 16
    ws.mergeCells(totalsRowNum + 2, 1, totalsRowNum + 2, TOTAL_COLS)
    const footerCell = footerRow.getCell(1)
    footerCell.value     = 'Brown Bread sales are non-vatable. Float deducted: R1,000.00 per day.'
    footerCell.font      = { size: 8, italic: true, color: { argb: argb(C.mutedText) }, name: 'Calibri' }
    footerCell.alignment = { horizontal: 'left' }

    // ── Freeze panes at row 7 (below headers) ────────────────────────────────
    ws.views = [{ state: 'frozen', ySplit: HDR, xSplit: 1 }]

    // ── Auto-filter on headers ────────────────────────────────────────────────
    ws.autoFilter = { from: { row: HDR, column: 1 }, to: { row: HDR, column: TOTAL_COLS } }

    // ── Generate buffer ───────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer()
    const today  = new Date().toISOString().split('T')[0]

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="village-bakery-cashup-${today}.xlsx"`,
      },
    })
  } catch (err) {
    console.error('[export-excel] error:', err)
    return Response.json({ error: 'Export failed' }, { status: 500 })
  }
}
