'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Upload, Plus, ChevronLeft, ChevronRight, X, Check,
  AlertCircle, FileSpreadsheet, Loader2, SlidersHorizontal,
  TrendingUp, TrendingDown, ReceiptText, BarChart3,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  PieChart, Pie, Tooltip as ReTooltip, ResponsiveContainer,
  AreaChart, Area, Legend,
} from 'recharts'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import * as XLSX from 'xlsx'

// ─── Brand colours ────────────────────────────────────────────────────────────
const BRAND = {
  coffee:     '#5C3D2E',
  caramel:    '#C4874A',
  wheat:      '#D4A96A',
  cream:      '#F0E0C0',
  sage:       '#7A9E7E',
  terracotta: '#C0614A',
}
const CHART_PALETTE = [
  BRAND.caramel, BRAND.coffee, BRAND.terracotta, BRAND.sage,
  BRAND.wheat, '#8B5E3C', '#A8C5A0', '#E8B87A',
  '#6B8E6B', '#D4956A',
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface Supplier {
  supplier_id: number
  company_name: string
  vat_registered: boolean
}
interface Expense {
  expense_id: number
  supplier_id: number
  invoice_number: string | null
  invoice_date: string
  product_description: string | null
  amount_excl_vat: number
  vat_rated: boolean
  vat_amount: number
  amount_incl_vat: number
  vb_supplier: { company_name: string }
}
interface ExpenseRow {
  supplier_id: number
  invoice_number?: string
  invoice_date: string
  product_description?: string
  amount_excl_vat: number
  vat_rated: boolean
}
interface AnalyticsExpense {
  supplier_id: number
  invoice_date: string
  amount_excl_vat: number
  vat_rated: boolean
  vat_amount: number
  amount_incl_vat: number
  vb_supplier: { company_name: string }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PAGE_SIZE = 15

const ZAR = (n: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n)
const ZARk = (n: number) =>
  n >= 1000
    ? `R${(n / 1000).toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`
    : `R${n.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`

function financialYearRange(fy: string): { from: string; to: string } {
  const [startY] = fy.split('/').map(Number)
  return { from: `${startY}-03-01`, to: `${startY + 1}-02-28` }
}
function calcVat(amount: number, vatRated: boolean) {
  const vat = vatRated ? Math.round(amount * 0.15 * 100) / 100 : 0
  return { vat_amount: vat, amount_incl_vat: Math.round((amount + vat) * 100) / 100 }
}

// ─── Custom Chart Tooltip ─────────────────────────────────────────────────────
function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-semibold text-foreground mb-1.5">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-muted-foreground">
          {p.color && <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />}
          {p.name}:
          <span className="font-semibold text-foreground ml-1">{ZAR(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({
  open, onClose, suppliers, onImport,
}: {
  open: boolean; onClose: () => void; suppliers: Supplier[]
  onImport: (rows: ExpenseRow[]) => Promise<void>
}) {
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setRows([]); setErrors([]); setDone(false)
    if (fileRef.current) fileRef.current.value = ''
  }
  function handleClose() { reset(); onClose() }

  function parseFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const errs: string[] = [], parsed: ExpenseRow[] = []
        json.forEach((row, i) => {
          const lineNo = i + 2
          const supplierId = Number(row['supplier_id'])
          const amountExcl = Number(row['amount_excl_vat'])
          const rawDate = row['invoice_date']
          if (!supplierId || isNaN(supplierId)) errs.push(`Row ${lineNo}: missing/invalid supplier_id`)
          if (!suppliers.find(s => s.supplier_id === supplierId)) errs.push(`Row ${lineNo}: supplier_id ${supplierId} not found`)
          if (isNaN(amountExcl) || amountExcl < 0) errs.push(`Row ${lineNo}: invalid amount_excl_vat`)
          if (!rawDate) errs.push(`Row ${lineNo}: missing invoice_date`)
          let dateStr = ''
          if (rawDate instanceof Date) dateStr = rawDate.toISOString().split('T')[0]
          else if (typeof rawDate === 'string' && rawDate.trim()) dateStr = rawDate.trim()
          const vatRated = String(row['vat_rated']).toLowerCase()
          const vatBool = vatRated === 'true' || vatRated === '1' || vatRated === 'yes'
          if (!errs.some(e => e.startsWith(`Row ${lineNo}:`))) {
            parsed.push({
              supplier_id: supplierId,
              invoice_number: String(row['invoice_number'] || '').trim() || undefined,
              invoice_date: dateStr,
              product_description: String(row['product_description'] || '').trim() || undefined,
              amount_excl_vat: amountExcl, vat_rated: vatBool,
            })
          }
        })
        setErrors(errs); setRows(parsed)
      } catch { setErrors(['Could not parse file. Please use the correct CSV or XLSX format.']) }
    }
    reader.readAsArrayBuffer(file)
  }

  const supplierName = (id: number) =>
    suppliers.find(s => s.supplier_id === id)?.company_name ?? `#${id}`

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[85vh] overflow-y-auto p-4 sm:p-6 rounded-none sm:rounded-xl">
        <DialogHeader><DialogTitle>Import expenses from file</DialogTitle></DialogHeader>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium">
              {rows.length} expense{rows.length !== 1 ? 's' : ''} imported successfully
            </p>
            <Button variant="outline" size="sm" onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <div className="space-y-5">
            <label
              className="flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-xl p-6 sm:p-8 cursor-pointer hover:bg-muted/30 active:bg-muted/50 transition-colors text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f) }}
            >
              <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                <span className="sm:hidden">Tap to browse a CSV or XLSX file</span>
                <span className="hidden sm:inline">
                  Drop a CSV or XLSX file here, or <span className="text-primary underline">browse</span>
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                Required: supplier_id · invoice_date · amount_excl_vat · vat_rated
              </span>
              <input
                ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f) }}
              />
            </label>

            {errors.length > 0 && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-1">
                <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {errors.length} issue{errors.length !== 1 ? 's' : ''} found
                </div>
                {errors.map((e, i) => <p key={i} className="text-xs text-red-600 pl-6">{e}</p>)}
              </div>
            )}

            {rows.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  {rows.length} row{rows.length !== 1 ? 's' : ''} ready to import
                </p>
                <div className="rounded-xl border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Supplier</TableHead>
                        <TableHead className="whitespace-nowrap">Invoice #</TableHead>
                        <TableHead className="whitespace-nowrap">Date</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Excl. VAT</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => {
                        const { amount_incl_vat } = calcVat(r.amount_excl_vat, r.vat_rated)
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs whitespace-nowrap">{supplierName(r.supplier_id)}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{r.invoice_number ?? '—'}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{r.invoice_date}</TableCell>
                            <TableCell className="text-xs text-right whitespace-nowrap">{ZAR(r.amount_excl_vat)}</TableCell>
                            <TableCell className="text-xs text-right font-medium whitespace-nowrap">{ZAR(amount_incl_vat)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={reset}>Clear</Button>
                  <Button
                    onClick={async () => { setImporting(true); await onImport(rows); setImporting(false); setDone(true) }}
                    disabled={importing}
                  >
                    {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Import {rows.length} expense{rows.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Expense Modal ─────────────────────────────────────────────────────────
function AddExpenseModal({
  open, onClose, suppliers, onSave,
}: {
  open: boolean; onClose: () => void; suppliers: Supplier[]
  onSave: (row: ExpenseRow) => Promise<void>
}) {
  const [form, setForm] = useState<Partial<ExpenseRow>>({ vat_rated: false, amount_excl_vat: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof ExpenseRow, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const { vat_amount, amount_incl_vat } = calcVat(form.amount_excl_vat ?? 0, form.vat_rated ?? false)

  async function handleSave() {
    if (!form.supplier_id) return setError('Please select a supplier')
    if (!form.invoice_date) return setError('Please enter an invoice date')
    if (!form.amount_excl_vat || form.amount_excl_vat <= 0) return setError('Please enter a valid amount')
    setError(''); setSaving(true)
    await onSave(form as ExpenseRow)
    setSaving(false); setForm({ vat_rated: false, amount_excl_vat: 0 }); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-md h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-none sm:rounded-xl">
        <DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Select onValueChange={(v) => set('supplier_id', Number(v))}>
              <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => (
                  <SelectItem key={s.supplier_id} value={String(s.supplier_id)}>{s.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice number</Label>
              <Input placeholder="e.g. INV-001" onChange={e => set('invoice_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice date</Label>
              <Input type="date" onChange={e => set('invoice_date', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Product / description</Label>
            <Input placeholder="e.g. Bread flour, 25kg bags" onChange={e => set('product_description', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (excl. VAT)</Label>
            <Input
              type="number" inputMode="decimal" min={0} step={0.01} placeholder="0.00"
              onChange={e => set('amount_excl_vat', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="vat-rated" checked={form.vat_rated}
              onCheckedChange={(v) => set('vat_rated', v === true)}
            />
            <Label htmlFor="vat-rated" className="cursor-pointer">VAT rated (15%)</Label>
          </div>
          <div className="rounded-xl bg-muted/40 border p-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Excl. VAT</span><span>{ZAR(form.amount_excl_vat ?? 0)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>VAT ({form.vat_rated ? '15%' : '0%'})</span><span>{ZAR(vat_amount)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1 mt-1">
              <span>Total incl. VAT</span><span>{ZAR(amount_incl_vat)}</span>
            </div>
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1 sticky bottom-0 bg-background pb-2 sm:static sm:pb-0 sm:bg-transparent">
            <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save expense
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Filter Sheet (mobile bottom sheet) ──────────────────────────────────────
function FilterSheet({
  open, onClose, suppliers,
  filterMonth, setFilterMonth, filterYear, setFilterYear,
  filterFY, setFilterFY, filterSupplier, setFilterSupplier,
  filterVat, setFilterVat, onClear, hasActiveFilters, yearOptions, fyOptions,
}: {
  open: boolean; onClose: () => void; suppliers: Supplier[]
  filterMonth: string; setFilterMonth: (v: string) => void
  filterYear: string; setFilterYear: (v: string) => void
  filterFY: string; setFilterFY: (v: string) => void
  filterSupplier: string; setFilterSupplier: (v: string) => void
  filterVat: string; setFilterVat: (v: string) => void
  onClear: () => void; hasActiveFilters: boolean
  yearOptions: string[]; fyOptions: string[]
}) {
  const filterGroups = [
    {
      label: 'Year', value: filterYear,
      onChange: (v: string) => { setFilterFY('all'); setFilterYear(v) },
      options: [{ value: 'all', label: 'All years' }, ...yearOptions.map(y => ({ value: y, label: y }))],
    },
    {
      label: 'Month', value: filterMonth,
      onChange: (v: string) => { setFilterFY('all'); setFilterMonth(v) },
      options: [{ value: 'all', label: 'All months' }, ...MONTHS.map(m => ({ value: m, label: m }))],
    },
    {
      label: 'Financial year', value: filterFY,
      onChange: (v: string) => { setFilterMonth('all'); setFilterFY(v) },
      options: [{ value: 'all', label: 'All fin. years' }, ...fyOptions.map(fy => ({ value: fy, label: `FY ${fy}` }))],
    },
    {
      label: 'Supplier', value: filterSupplier, onChange: setFilterSupplier,
      options: [{ value: 'all', label: 'All suppliers' }, ...suppliers.map(s => ({ value: String(s.supplier_id), label: s.company_name }))],
    },
    {
      label: 'VAT status', value: filterVat, onChange: setFilterVat,
      options: [{ value: 'all', label: 'All (VAT)' }, { value: 'vat', label: 'VAT rated' }, { value: 'no-vat', label: 'Zero rated' }],
    },
  ]

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-auto max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-8">
        <SheetHeader className="mb-4"><SheetTitle>Filter expenses</SheetTitle></SheetHeader>
        <div className="space-y-4">
          {filterGroups.map(({ label, value, onChange, options }) => (
            <div key={label} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">{label}</Label>
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            {hasActiveFilters && (
              <Button variant="outline" className="flex-1" onClick={() => { onClear(); onClose() }}>
                <X className="w-4 h-4 mr-1.5" /> Clear
              </Button>
            )}
            <Button className="flex-1" onClick={onClose}>Apply</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Mobile Expense Card ───────────────────────────────────────────────────────
function ExpenseCard({ expense }: { expense: Expense }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{expense.vb_supplier?.company_name ?? '—'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(expense.invoice_date).toLocaleDateString('en-ZA')}
            {expense.invoice_number && <> · {expense.invoice_number}</>}
          </p>
        </div>
        {expense.vat_rated
          ? <Badge variant="secondary" className="text-xs shrink-0">15% VAT</Badge>
          : <span className="text-xs text-muted-foreground shrink-0">0% VAT</span>
        }
      </div>
      {expense.product_description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{expense.product_description}</p>
      )}
      <div className="flex items-end justify-between pt-1 border-t">
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>{ZAR(Number(expense.amount_excl_vat))} excl.</div>
          <div>{ZAR(Number(expense.vat_amount))} VAT</div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">{ZAR(Number(expense.amount_incl_vat))}</p>
          <p className="text-xs text-muted-foreground">total incl. VAT</p>
        </div>
      </div>
    </div>
  )
}

// ─── Analysis KPI Card ────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, trend, accentColor,
}: {
  label: string; value: string; sub?: string; trend?: number; accentColor?: string
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 relative overflow-hidden">
      {accentColor && (
        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: accentColor }} />
      )}
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-1">{label}</p>
      <p className="font-serif text-xl font-bold text-foreground mt-1 leading-tight">{value}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {trend != null && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trend >= 0 ? 'text-destructive' : 'text-green-600'}`}>
            {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

// ─── Analysis Tab ─────────────────────────────────────────────────────────────
function AnalysisTab({ expenses }: { expenses: AnalyticsExpense[] }) {
  const supplierData = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of expenses) {
      const name = e.vb_supplier?.company_name ?? 'Unknown'
      map.set(name, (map.get(name) ?? 0) + Number(e.amount_incl_vat))
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
  }, [expenses])

  const top10 = supplierData.slice(0, 10)
  const topSupplier = supplierData[0]

  const monthlyData = useMemo(() => {
    const map = new Map<string, { excl: number; vat: number; incl: number }>()
    for (const e of expenses) {
      const d = new Date(e.invoice_date)
      if (isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const cur = map.get(key) ?? { excl: 0, vat: 0, incl: 0 }
      map.set(key, {
        excl: cur.excl + Number(e.amount_excl_vat),
        vat:  cur.vat  + Number(e.vat_amount),
        incl: cur.incl + Number(e.amount_incl_vat),
      })
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, vals]) => {
        const [yr, mo] = key.split('-')
        return {
          name: `${MONTHS_SHORT[parseInt(mo) - 1]} ${yr}`,
          excl: Math.round(vals.excl),
          vat:  Math.round(vals.vat),
          incl: Math.round(vals.incl),
        }
      })
  }, [expenses])

  const vatSplit = useMemo(() => {
    let vatTotal = 0, nonVatTotal = 0
    for (const e of expenses) {
      if (e.vat_rated) vatTotal += Number(e.amount_incl_vat)
      else nonVatTotal += Number(e.amount_incl_vat)
    }
    return [
      { name: 'VAT rated (15%)', value: Math.round(vatTotal) },
      { name: 'Zero rated (0%)',  value: Math.round(nonVatTotal) },
    ]
  }, [expenses])

  const totalVat  = useMemo(() => expenses.reduce((s, e) => s + Number(e.vat_amount), 0), [expenses])
  const totalIncl = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount_incl_vat), 0), [expenses])
  const avgMonthly = monthlyData.length > 0 ? totalIncl / monthlyData.length : 0

  const trend = useMemo(() => {
    if (monthlyData.length < 2) return 0
    const prev = monthlyData[monthlyData.length - 2].incl
    const curr = monthlyData[monthlyData.length - 1].incl
    return prev > 0 ? ((curr - prev) / prev) * 100 : 0
  }, [monthlyData])

  const top3Share = useMemo(() => {
    const top3Total = supplierData.slice(0, 3).reduce((s, d) => s + d.total, 0)
    return totalIncl > 0 ? (top3Total / totalIncl) * 100 : 0
  }, [supplierData, totalIncl])

  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <BarChart3 className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">No expense data to analyse yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total Spend (incl. VAT)" value={ZAR(totalIncl)}
          sub={`${expenses.length} invoices`} accentColor={BRAND.caramel}
        />
        <KpiCard
          label="Total VAT Paid" value={ZAR(totalVat)}
          sub={`${((totalVat / totalIncl) * 100).toFixed(1)}% of spend`}
          accentColor={BRAND.terracotta} trend={trend}
        />
        <KpiCard
          label="Avg Monthly Spend" value={ZAR(avgMonthly)}
          sub={`over ${monthlyData.length} months`} accentColor={BRAND.coffee}
        />
        <KpiCard
          label="Top 3 Supplier Share" value={`${top3Share.toFixed(1)}%`}
          sub={topSupplier ? topSupplier.name : '—'} accentColor={BRAND.sage}
        />
      </div>

      {/* Monthly trend + VAT split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-foreground">Monthly Spend Trend</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Last 12 months · excl. vs. incl. VAT</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthlyData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="inclGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={BRAND.caramel} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={BRAND.caramel} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="exclGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={BRAND.coffee} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={BRAND.coffee} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name" axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                axisLine={false} tickLine={false} tickFormatter={ZARk}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <ReTooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone" dataKey="incl" name="Incl. VAT"
                stroke={BRAND.caramel} strokeWidth={2.5} fill="url(#inclGrad)"
                dot={false} activeDot={{ r: 4, fill: BRAND.caramel }}
              />
              <Area
                type="monotone" dataKey="excl" name="Excl. VAT"
                stroke={BRAND.coffee} strokeWidth={2} fill="url(#exclGrad)"
                dot={false} activeDot={{ r: 4, fill: BRAND.coffee }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* VAT donut */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-foreground">VAT Breakdown</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Rated vs. zero-rated spend</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={vatSplit} dataKey="value"
                cx="50%" cy="50%" innerRadius={45} outerRadius={72}
                paddingAngle={3} strokeWidth={0}
              >
                {vatSplit.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? BRAND.caramel : BRAND.wheat} />
                ))}
              </Pie>
              <ReTooltip formatter={(v: number) => ZAR(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {vatSplit.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: i === 0 ? BRAND.caramel : BRAND.wheat }} />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
                <span className="font-medium tabular-nums">{ZAR(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top 10 suppliers */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            <h3 className="font-serif text-base font-bold text-foreground">Top 10 Suppliers by Spend</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Total paid incl. VAT across filtered period</p>
          </div>
          {topSupplier && (
            <div className="shrink-0 text-right rounded-xl px-4 py-2.5 border" style={{ background: `${BRAND.caramel}15` }}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Top supplier</p>
              <p className="font-serif font-bold text-sm mt-0.5" style={{ color: BRAND.caramel }}>{topSupplier.name}</p>
              <p className="text-xs font-semibold tabular-nums text-foreground">{ZAR(topSupplier.total)}</p>
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={top10.length * 36 + 20}>
          <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis
              type="number" axisLine={false} tickLine={false} tickFormatter={ZARk}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              type="category" dataKey="name" width={140} axisLine={false} tickLine={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
            <ReTooltip content={<CustomTooltip />} />
            <Bar dataKey="total" name="Total spend" radius={[0, 5, 5, 0]} maxBarSize={26}>
              {top10.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Ranked list */}
        <div className="mt-5 space-y-1">
          {top10.map((s, i) => (
            <div key={s.name} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
              <span className="w-5 text-[10px] font-bold tabular-nums text-muted-foreground text-right shrink-0">
                #{i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{s.name}</span>
                  <span className="text-sm font-semibold tabular-nums shrink-0">{ZAR(s.total)}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(s.total / top10[0].total) * 100}%`,
                      background: CHART_PALETTE[i % CHART_PALETTE.length],
                    }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                {totalIncl > 0 ? `${((s.total / totalIncl) * 100).toFixed(1)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Remaining suppliers */}
      {supplierData.length > 10 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-serif text-base font-bold text-foreground mb-4">
            All Suppliers <span className="text-sm font-normal text-muted-foreground">(#{11}–{supplierData.length})</span>
          </h3>
          <div className="space-y-1">
            {supplierData.slice(10).map((s, i) => (
              <div key={s.name} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                <span className="w-5 text-[10px] font-bold tabular-nums text-muted-foreground text-right shrink-0">
                  #{i + 11}
                </span>
                <span className="flex-1 text-sm truncate">{s.name}</span>
                <span className="text-sm font-semibold tabular-nums">{ZAR(s.total)}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">
                  {totalIncl > 0 ? `${((s.total / totalIncl) * 100).toFixed(1)}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const supabase = createClient()

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<'expenses' | 'analysis'>('expenses')
  const [allExpenses, setAllExpenses] = useState<AnalyticsExpense[]>([])

  const now = new Date()
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [filterYear, setFilterYear] = useState<string>(String(now.getFullYear()))
  const [filterFY, setFilterFY] = useState<string>('all')
  const [filterSupplier, setFilterSupplier] = useState<string>('all')
  const [filterVat, setFilterVat] = useState<string>('all')

  const [showUpload, setShowUpload] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const yearOptions = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - 2 + i))
  const fyOptions   = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - 2 + i; return `${y}/${y + 1}`
  })

  useEffect(() => {
    supabase.from('vb_supplier')
      .select('supplier_id, company_name, vat_registered').order('company_name')
      .then(({ data }) => setSuppliers((data as Supplier[]) ?? []))
  }, [])

  // Shared filter application — returns a typed Supabase query builder
  // (we cast to `any` only at the boundary to avoid deep generic repetition)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(q: any) {
    if (filterFY !== 'all') {
      const { from, to } = financialYearRange(filterFY)
      q = q.gte('invoice_date', from).lte('invoice_date', to)
    } else {
      if (filterYear !== 'all')
        q = q.gte('invoice_date', `${filterYear}-01-01`).lte('invoice_date', `${filterYear}-12-31`)
      if (filterMonth !== 'all') {
        const m    = String(MONTHS.indexOf(filterMonth) + 1).padStart(2, '0')
        const y    = filterYear !== 'all' ? filterYear : String(now.getFullYear())
        const days = new Date(Number(y), Number(m), 0).getDate()
        q = q.gte('invoice_date', `${y}-${m}-01`).lte('invoice_date', `${y}-${m}-${days}`)
      }
    }
    if (filterSupplier !== 'all') q = q.eq('supplier_id', Number(filterSupplier))
    if (filterVat === 'vat')      q = q.eq('vat_rated', true)
    if (filterVat === 'no-vat')   q = q.eq('vat_rated', false)
    return q
  }

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('vb_expense')
      .select('*, vb_supplier(company_name)', { count: 'exact' })
      .order('invoice_date', { ascending: false })
    q = applyFilters(q)
    const from = (page - 1) * PAGE_SIZE
    q = q.range(from, from + PAGE_SIZE - 1)
    const { data, count } = await q
    setExpenses((data as Expense[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, filterMonth, filterYear, filterFY, filterSupplier, filterVat])

  const fetchAll = useCallback(async () => {
    let q = supabase.from('vb_expense').select(
      'supplier_id, invoice_date, amount_excl_vat, vat_rated, vat_amount, amount_incl_vat, vb_supplier(company_name)'
    )
    q = applyFilters(q)
    const { data } = await q
    setAllExpenses((data as unknown as AnalyticsExpense[]) ?? [])
  }, [filterMonth, filterYear, filterFY, filterSupplier, filterVat])

  const [summary, setSummary] = useState({ excl: 0, vat: 0, incl: 0 })
  const fetchSummary = useCallback(async () => {
    let q = supabase.from('vb_expense').select('amount_excl_vat, vat_amount, amount_incl_vat')
    q = applyFilters(q)
    const { data } = await q
    if (!data) return
    setSummary({
      excl: data.reduce((s, r) => s + Number(r.amount_excl_vat), 0),
      vat:  data.reduce((s, r) => s + Number(r.vat_amount), 0),
      incl: data.reduce((s, r) => s + Number(r.amount_incl_vat), 0),
    })
  }, [filterMonth, filterYear, filterFY, filterSupplier, filterVat])

  useEffect(() => { setPage(1) }, [filterMonth, filterYear, filterFY, filterSupplier, filterVat])
  useEffect(() => { fetchExpenses() }, [fetchExpenses])
  useEffect(() => { fetchAll() },     [fetchAll])
  useEffect(() => { fetchSummary() }, [fetchSummary])

  async function insertExpenses(rows: ExpenseRow[]) {
    await supabase.from('vb_expense').insert(rows)
    await Promise.all([fetchExpenses(), fetchAll(), fetchSummary()])
  }
  async function insertOne(row: ExpenseRow) {
    await supabase.from('vb_expense').insert([row])
    await Promise.all([fetchExpenses(), fetchAll(), fetchSummary()])
  }

  const totalPages      = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const clearFilters    = () => { setFilterMonth('all'); setFilterYear(String(now.getFullYear())); setFilterFY('all'); setFilterSupplier('all'); setFilterVat('all') }
  const hasActiveFilters = filterMonth !== 'all' || filterFY !== 'all' || filterSupplier !== 'all' || filterVat !== 'all'
  const activeFilterCount = [filterMonth !== 'all', filterFY !== 'all', filterSupplier !== 'all', filterVat !== 'all'].filter(Boolean).length

  // ── Shared filter bar ────────────────────────────────────────────────────
  const desktopFilters = [
    { value: filterYear, onChange: (v: string) => { setFilterFY('all'); setFilterYear(v) }, w: 'w-28', placeholder: 'Year', opts: [{ v: 'all', l: 'All years' }, ...yearOptions.map(y => ({ v: y, l: y }))] },
    { value: filterMonth, onChange: (v: string) => { setFilterFY('all'); setFilterMonth(v) }, w: 'w-32', placeholder: 'Month', opts: [{ v: 'all', l: 'All months' }, ...MONTHS.map(m => ({ v: m, l: m }))] },
    { value: filterFY, onChange: (v: string) => { setFilterMonth('all'); setFilterFY(v) }, w: 'w-36', placeholder: 'Fin. year', opts: [{ v: 'all', l: 'All fin. years' }, ...fyOptions.map(fy => ({ v: fy, l: `FY ${fy}` }))] },
    { value: filterSupplier, onChange: setFilterSupplier, w: 'w-44', placeholder: 'Supplier', opts: [{ v: 'all', l: 'All suppliers' }, ...suppliers.map(s => ({ v: String(s.supplier_id), l: s.company_name }))] },
    { value: filterVat, onChange: setFilterVat, w: 'w-32', placeholder: 'VAT', opts: [{ v: 'all', l: 'All (VAT)' }, { v: 'vat', l: 'VAT rated' }, { v: 'no-vat', l: 'Zero rated' }] },
  ]

  const FilterBar = (
    <div>
      {/* Mobile */}
      <div className="flex items-center gap-2 sm:hidden">
        <Button
          variant="outline" size="sm"
          className="h-9 gap-1.5 flex-1"
          onClick={() => setShowFilters(true)}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs leading-none">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFilters}>
            <X className="w-3 h-3 mr-1" /> Clear
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {total} record{total !== 1 ? 's' : ''}
        </span>
      </div>
      {/* Desktop */}
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        {desktopFilters.map(({ value, onChange, w, placeholder, opts }) => (
          <Select key={placeholder} value={value} onValueChange={onChange}>
            <SelectTrigger className={`${w} h-8 text-xs`}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {opts.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
            <X className="w-3 h-3 mr-1" /> Clear filters
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {total} record{total !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 sm:py-8 space-y-5 sm:space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track supplier invoices and purchases</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowUpload(true)} className="gap-1.5">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add expense</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total excl. VAT', value: summary.excl, color: BRAND.caramel },
          { label: 'VAT paid',        value: summary.vat,  color: BRAND.terracotta },
          { label: 'Total incl. VAT', value: summary.incl, color: BRAND.coffee },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl bg-card border p-4 relative overflow-hidden flex sm:block items-center justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: color }} />
            <p className="text-xs text-muted-foreground sm:mb-1">{label}</p>
            <p className="text-lg sm:text-xl font-semibold tabular-nums">{ZAR(value)}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'expenses' | 'analysis')}>
        <TabsList className="h-9 rounded-xl bg-muted p-1">
          <TabsTrigger
            value="expenses"
            className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm"
          >
            <ReceiptText className="w-3.5 h-3.5" /> Expenses
          </TabsTrigger>
          <TabsTrigger
            value="analysis"
            className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm"
          >
            <BarChart3 className="w-3.5 h-3.5" /> Analysis
          </TabsTrigger>
        </TabsList>

        {/* ── Expenses tab ── */}
        <TabsContent value="expenses" className="mt-5 space-y-4">
          {FilterBar}

          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Excl. VAT</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>VAT?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading…
                    </TableCell>
                  </TableRow>
                ) : expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      No expenses found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : expenses.map((e) => (
                  <TableRow key={e.expense_id}>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">
                      {new Date(e.invoice_date).toLocaleDateString('en-ZA')}
                    </TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate">
                      {e.vb_supplier?.company_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.invoice_number ?? '—'}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{e.product_description ?? '—'}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums">{ZAR(Number(e.amount_excl_vat))}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-muted-foreground">{ZAR(Number(e.vat_amount))}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums font-medium">{ZAR(Number(e.amount_incl_vat))}</TableCell>
                    <TableCell>
                      {e.vat_rated
                        ? <Badge variant="secondary" className="text-xs">15%</Badge>
                        : <span className="text-xs text-muted-foreground">0%</span>
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {loading ? (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground text-sm">
                <Loader2 className="w-5 h-5 animate-spin" />Loading…
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No expenses found for the selected filters.
              </div>
            ) : expenses.map((e) => <ExpenseCard key={e.expense_id} expense={e} />)}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {page} of {totalPages}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="icon" className="h-9 w-9 sm:h-8 sm:w-8"
                  disabled={page === 1} onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline" size="icon" className="h-9 w-9 sm:h-8 sm:w-8"
                  disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Analysis tab ── */}
        <TabsContent value="analysis" className="mt-5 space-y-4">
          {FilterBar}
          <AnalysisTab expenses={allExpenses} />
        </TabsContent>
      </Tabs>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      <UploadModal
        open={showUpload} onClose={() => setShowUpload(false)}
        suppliers={suppliers} onImport={insertExpenses}
      />
      <AddExpenseModal
        open={showAdd} onClose={() => setShowAdd(false)}
        suppliers={suppliers} onSave={insertOne}
      />
      <FilterSheet
        open={showFilters} onClose={() => setShowFilters(false)}
        suppliers={suppliers}
        filterMonth={filterMonth}   setFilterMonth={setFilterMonth}
        filterYear={filterYear}     setFilterYear={setFilterYear}
        filterFY={filterFY}         setFilterFY={setFilterFY}
        filterSupplier={filterSupplier} setFilterSupplier={setFilterSupplier}
        filterVat={filterVat}       setFilterVat={setFilterVat}
        onClear={clearFilters}      hasActiveFilters={hasActiveFilters}
        yearOptions={yearOptions}   fyOptions={fyOptions}
      />
    </div>
  )
}