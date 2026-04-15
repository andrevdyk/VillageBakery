'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Upload, Plus, ChevronLeft, ChevronRight, X, Check,
  AlertCircle, FileSpreadsheet, Loader2, SlidersHorizontal,
  TrendingUp, TrendingDown, ReceiptText, BarChart3, Store,
  Pencil, Trash2, Phone, MapPin, CreditCard, FileText,
  Users, RefreshCw, Repeat, Banknote, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { EmployeesTab } from './employees-tab'
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import * as XLSX from 'xlsx'

// ─── Brand colours ────────────────────────────────────────────────────────────
const BRAND = {
  coffee:     '#5C3D2E',
  caramel:    '#C4874A',
  wheat:      '#D4A96A',
  sage:       '#7A9E7E',
  terracotta: '#C0614A',
}
const CHART_PALETTE = [
  BRAND.caramel, BRAND.coffee, BRAND.terracotta, BRAND.sage,
  BRAND.wheat, '#8B5E3C', '#A8C5A0', '#E8B87A', '#6B8E6B', '#D4956A',
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface Supplier {
  supplier_id: number
  company_name: string
  address: string | null
  phone_number: string | null
  tax_number: string | null
  vat_number: string | null
  vat_registered: boolean
  account_number: string | null
  payment_terms: string | null
  notes: string | null
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
  date_paid: string | null
  vb_supplier: { company_name: string }
}

interface ExpenseRow {
  supplier_id: number
  invoice_number?: string
  invoice_date: string
  product_description?: string
  amount_excl_vat: number
  vat_rated: boolean
  date_paid?: string
}

interface AnalyticsExpense {
  supplier_id: number
  invoice_date: string
  amount_excl_vat: number
  vat_rated: boolean
  vat_amount: number
  amount_incl_vat: number
  date_paid: string | null
  vb_supplier: { company_name: string }
}

interface RecurringExpense {
  recurring_id: number
  supplier_id: number | null
  description: string
  amount_excl_vat: number
  vat_rated: boolean
  is_active: boolean
  category: string | null
  notes: string | null
  vb_supplier?: { company_name: string } | null
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

function financialYearRange(fy: string) {
  const [startY] = fy.split('/').map(Number)
  return { from: `${startY}-03-01`, to: `${startY + 1}-02-28` }
}
function calcVat(amount: number, vatRated: boolean) {
  const vat = vatRated ? Math.round(amount * 0.15 * 100) / 100 : 0
  return { vat_amount: vat, amount_incl_vat: Math.round((amount + vat) * 100) / 100 }
}

// ─── Custom Chart Tooltip ─────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
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
          {p.name}: <span className="font-semibold text-foreground ml-1">{ZAR(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Vendor Form Modal ────────────────────────────────────────────────────────
type SupplierForm = Omit<Supplier, 'supplier_id'>

const EMPTY_SUPPLIER: SupplierForm = {
  company_name: '', address: null, phone_number: null, tax_number: null,
  vat_number: null, vat_registered: false, account_number: null,
  payment_terms: null, notes: null,
}

function VendorModal({
  open, onClose, initial, onSave,
}: {
  open: boolean
  onClose: () => void
  initial?: Supplier | null
  onSave: (data: SupplierForm, id?: number) => Promise<void>
}) {
  const [form, setForm] = useState<SupplierForm>(EMPTY_SUPPLIER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) setForm(initial ? { ...initial } : EMPTY_SUPPLIER)
  }, [open, initial])

  const set = (k: keyof SupplierForm, v: unknown) =>
    setForm(f => ({ ...f, [k]: v === '' ? null : v }))

  async function handleSave() {
    if (!form.company_name.trim()) return setError('Company name is required')
    setError(''); setSaving(true)
    await onSave(form, initial?.supplier_id)
    setSaving(false); onClose()
  }

  const isEdit = !!initial

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-none sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit vendor' : 'Add vendor'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Company name */}
          <div className="space-y-1.5">
            <Label>Company name <span className="text-destructive">*</span></Label>
            <Input
              value={form.company_name}
              placeholder="e.g. Bakels South Africa"
              onChange={e => set('company_name', e.target.value)}
            />
          </div>

          {/* Phone + Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone number</Label>
              <Input value={form.phone_number ?? ''} placeholder="+27 21 000 0000" onChange={e => set('phone_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={form.address ?? ''} placeholder="Street, City" onChange={e => set('address', e.target.value)} />
            </div>
          </div>

          {/* Tax + VAT number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tax number</Label>
              <Input value={form.tax_number ?? ''} placeholder="Tax / income tax ref" onChange={e => set('tax_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>VAT number</Label>
              <Input value={form.vat_number ?? ''} placeholder="VAT registration no." onChange={e => set('vat_number', e.target.value)} />
            </div>
          </div>

          {/* VAT registered toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="vat-reg"
              checked={form.vat_registered}
              onCheckedChange={v => set('vat_registered', v === true)}
            />
            <Label htmlFor="vat-reg" className="cursor-pointer">VAT registered supplier</Label>
          </div>

          {/* Account + payment terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bank account number</Label>
              <Input value={form.account_number ?? ''} placeholder="Account number" onChange={e => set('account_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment terms</Label>
              <Input value={form.payment_terms ?? ''} placeholder="e.g. Net 30" onChange={e => set('payment_terms', e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={form.notes ?? ''}
              placeholder="Any additional notes…"
              rows={3}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1 sticky bottom-0 bg-background pb-2 sm:static sm:pb-0 sm:bg-transparent">
            <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? 'Save changes' : 'Add vendor'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Vendors Tab ──────────────────────────────────────────────────────────────
function VendorsTab({
  suppliers, onAdd, onEdit, onDelete,
}: {
  suppliers: Supplier[]
  onAdd: () => void
  onEdit: (s: Supplier) => void
  onDelete: (id: number) => void
}) {
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)

  const filtered = suppliers.filter(s =>
    s.company_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          className="h-8 text-xs max-w-xs"
          placeholder="Search vendors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSearch('')}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} vendor{filtered.length !== 1 ? 's' : ''}</span>
        <Button size="sm" onClick={onAdd} className="gap-1.5">
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">Add vendor</span><span className="sm:hidden">Add</span>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Store className="w-10 h-10 opacity-30" />
          <p className="text-sm">{search ? 'No vendors match your search.' : 'No vendors yet.'}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Account #</TableHead>
                  <TableHead>Payment terms</TableHead>
                  <TableHead>VAT reg.</TableHead>
                  <TableHead>VAT no.</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow key={s.supplier_id}>
                    <TableCell className="text-sm font-medium">{s.company_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.phone_number ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.account_number ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.payment_terms ?? '—'}</TableCell>
                    <TableCell>
                      {s.vat_registered
                        ? <Badge variant="secondary" className="text-xs">Yes</Badge>
                        : <span className="text-xs text-muted-foreground">No</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.vat_number ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(s)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map(s => (
              <div key={s.supplier_id} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{s.company_name}</p>
                    {s.payment_terms && <p className="text-xs text-muted-foreground mt-0.5">{s.payment_terms}</p>}
                  </div>
                  {s.vat_registered && <Badge variant="secondary" className="text-xs shrink-0">VAT reg.</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {s.phone_number && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="w-3 h-3" />{s.phone_number}
                    </div>
                  )}
                  {s.address && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3 h-3" />{s.address}
                    </div>
                  )}
                  {s.account_number && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CreditCard className="w-3 h-3" />{s.account_number}
                    </div>
                  )}
                  {s.vat_number && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FileText className="w-3 h-3" />VAT: {s.vat_number}
                    </div>
                  )}
                </div>
                {s.notes && <p className="text-xs text-muted-foreground border-t pt-2">{s.notes}</p>}
                <div className="flex gap-2 pt-1 border-t">
                  <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => onEdit(s)}>
                    <Pencil className="w-3 h-3 mr-1.5" />Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)}>
                    <Trash2 className="w-3 h-3 mr-1.5" />Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.company_name}</strong>. This cannot be undone and will fail if the vendor has existing expenses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { onDelete(deleteTarget.supplier_id); setDeleteTarget(null) } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ open, onClose, suppliers, onImport }: {
  open: boolean; onClose: () => void; suppliers: Supplier[]
  onImport: (rows: ExpenseRow[]) => Promise<void>
}) {
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() { setRows([]); setErrors([]); setDone(false); if (fileRef.current) fileRef.current.value = '' }
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
          const vatBool = ['true','1','yes'].includes(String(row['vat_rated']).toLowerCase())
          if (!errs.some(e => e.startsWith(`Row ${lineNo}:`))) {
            parsed.push({ supplier_id: supplierId, invoice_number: String(row['invoice_number'] || '').trim() || undefined, invoice_date: dateStr, product_description: String(row['product_description'] || '').trim() || undefined, amount_excl_vat: amountExcl, vat_rated: vatBool })
          }
        })
        setErrors(errs); setRows(parsed)
      } catch { setErrors(['Could not parse file. Please use the correct CSV or XLSX format.']) }
    }
    reader.readAsArrayBuffer(file)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[85vh] overflow-y-auto p-4 sm:p-6 rounded-none sm:rounded-xl">
        <DialogHeader><DialogTitle>Import expenses from file</DialogTitle></DialogHeader>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center"><Check className="w-6 h-6 text-green-600" /></div>
            <p className="text-sm font-medium">{rows.length} expense{rows.length !== 1 ? 's' : ''} imported successfully</p>
            <Button variant="outline" size="sm" onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <div className="space-y-5">
            <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-xl p-6 sm:p-8 cursor-pointer hover:bg-muted/30 transition-colors text-center"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f) }}>
              <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                <span className="sm:hidden">Tap to browse a CSV or XLSX file</span>
                <span className="hidden sm:inline">Drop a CSV or XLSX file here, or <span className="text-primary underline">browse</span></span>
              </span>
              <span className="text-xs text-muted-foreground">Required: supplier_id · invoice_date · amount_excl_vat · vat_rated</span>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f) }} />
            </label>
            {errors.length > 0 && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-1">
                <div className="flex items-center gap-2 text-red-700 text-sm font-medium"><AlertCircle className="w-4 h-4 flex-shrink-0" />{errors.length} issue{errors.length !== 1 ? 's' : ''} found</div>
                {errors.map((e, i) => <p key={i} className="text-xs text-red-600 pl-6">{e}</p>)}
              </div>
            )}
            {rows.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">{rows.length} row{rows.length !== 1 ? 's' : ''} ready to import</p>
                <div className="rounded-xl border overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead>Invoice #</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Excl. VAT</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {rows.map((r, i) => {
                        const { amount_incl_vat } = calcVat(r.amount_excl_vat, r.vat_rated)
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{suppliers.find(s => s.supplier_id === r.supplier_id)?.company_name ?? `#${r.supplier_id}`}</TableCell>
                            <TableCell className="text-xs">{r.invoice_number ?? '—'}</TableCell>
                            <TableCell className="text-xs">{r.invoice_date}</TableCell>
                            <TableCell className="text-xs text-right">{ZAR(r.amount_excl_vat)}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{ZAR(amount_incl_vat)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={reset}>Clear</Button>
                  <Button onClick={async () => { setImporting(true); await onImport(rows); setImporting(false); setDone(true) }} disabled={importing}>
                    {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Import {rows.length} expense{rows.length !== 1 ? 's' : ''}
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

// ─── Add / Edit Expense Modal ─────────────────────────────────────────────────
function AddExpenseModal({ open, onClose, suppliers, onSave }: {
  open: boolean; onClose: () => void; suppliers: Supplier[]
  onSave: (row: ExpenseRow) => Promise<void>
}) {
  // 'expense' = normal supplier expense, 'bank' = bank fees (no supplier needed)
  const [mode, setMode]     = useState<'expense' | 'bank'>('expense')
  const [form, setForm]     = useState<Partial<ExpenseRow>>({ vat_rated: false, amount_excl_vat: 0 })
  const [bankFees, setBankFees] = useState({ amount: 0, description: 'Bank charges', date: new Date().toISOString().split('T')[0], date_paid: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Reset on open
  useEffect(() => {
    if (open) {
      setMode('expense')
      setForm({ vat_rated: false, amount_excl_vat: 0 })
      setBankFees({ amount: 0, description: 'Bank charges', date: new Date().toISOString().split('T')[0], date_paid: '' })
      setError('')
    }
  }, [open])

  const set = (k: keyof ExpenseRow, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const { vat_amount, amount_incl_vat } = calcVat(form.amount_excl_vat ?? 0, form.vat_rated ?? false)

  async function handleSave() {
    if (mode === 'bank') {
      if (!bankFees.amount || bankFees.amount <= 0) return setError('Please enter a bank fee amount')
      if (!bankFees.date) return setError('Please enter a date')
      // Bank fees: no supplier, VAT-exempt, description = bank charges
      setError(''); setSaving(true)
      // For bank fees we omit supplier_id so it's null in the DB
      // (requires supplier_id to be nullable in vb_expense — see migration)
      await onSave({
        invoice_date: bankFees.date,
        product_description: bankFees.description || 'Bank charges',
        amount_excl_vat: bankFees.amount,
        vat_rated: false,
        date_paid: bankFees.date_paid || undefined,
      } as unknown as ExpenseRow)
      setSaving(false); onClose()
      return
    }
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

          {/* Mode toggle */}
          <div className="flex rounded-xl bg-muted p-1 gap-1">
            <button
              onClick={() => setMode('expense')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${mode === 'expense' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <FileText className="w-3.5 h-3.5" /> Supplier expense
            </button>
            <button
              onClick={() => setMode('bank')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${mode === 'bank' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Banknote className="w-3.5 h-3.5" /> Bank fees
            </button>
          </div>

          {mode === 'bank' ? (
            /* ── Bank fees form ── */
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Bank fees are recorded as zero-rated (0% VAT) expenses with no supplier.
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={bankFees.description}
                  placeholder="e.g. Bank charges, Monthly fee"
                  onChange={e => setBankFees(b => ({ ...b, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount (R)</Label>
                  <Input
                    type="number" inputMode="decimal" min={0} step={0.01} placeholder="0.00"
                    value={bankFees.amount || ''}
                    onChange={e => setBankFees(b => ({ ...b, amount: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={bankFees.date} onChange={e => setBankFees(b => ({ ...b, date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Date paid <span className="text-muted-foreground text-xs">(leave blank if unpaid)</span></Label>
                <Input type="date" value={bankFees.date_paid} onChange={e => setBankFees(b => ({ ...b, date_paid: e.target.value }))} />
              </div>
              <div className="rounded-xl bg-muted/40 border p-3 text-sm flex justify-between font-medium">
                <span>Total (no VAT)</span>
                <span>{ZAR(bankFees.amount || 0)}</span>
              </div>
            </div>
          ) : (
            /* ── Normal supplier expense form ── */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select onValueChange={v => set('supplier_id', Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.supplier_id} value={String(s.supplier_id)}>{s.company_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Invoice number</Label><Input placeholder="e.g. INV-001" onChange={e => set('invoice_number', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Invoice date</Label><Input type="date" onChange={e => set('invoice_date', e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label>Product / description</Label><Input placeholder="e.g. Bread flour, 25kg bags" onChange={e => set('product_description', e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Amount (excl. VAT)</Label>
                <Input type="number" inputMode="decimal" min={0} step={0.01} placeholder="0.00" onChange={e => set('amount_excl_vat', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="vat-rated" checked={form.vat_rated} onCheckedChange={v => set('vat_rated', v === true)} />
                <Label htmlFor="vat-rated" className="cursor-pointer">VAT rated (15%)</Label>
              </div>
              <div className="space-y-1.5">
                <Label>Date paid <span className="text-muted-foreground text-xs">(leave blank if unpaid)</span></Label>
                <Input type="date" onChange={e => set('date_paid', e.target.value || undefined)} />
              </div>
              <div className="rounded-xl bg-muted/40 border p-3 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Excl. VAT</span><span>{ZAR(form.amount_excl_vat ?? 0)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>VAT ({form.vat_rated ? '15%' : '0%'})</span><span>{ZAR(vat_amount)}</span></div>
                <div className="flex justify-between font-medium border-t pt-1 mt-1"><span>Total incl. VAT</span><span>{ZAR(amount_incl_vat)}</span></div>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
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

// ─── Recurring Expenses Tab ───────────────────────────────────────────────────
function RecurringTab({ suppliers }: { suppliers: Supplier[] }) {
  const supabase = createClient()
  const [items, setItems]             = useState<RecurringExpense[]>([])
  const [loading, setLoading]         = useState(true)
  const [generating, setGenerating]   = useState(false)
  const [showAdd, setShowAdd]         = useState(false)
  const [editItem, setEditItem]       = useState<RecurringExpense | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringExpense | null>(null)
  const [genResult, setGenResult]     = useState<string | null>(null)

  const ZAR_local = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('vb_recurring_expense')
      .select('*, vb_supplier(company_name)')
      .order('description')
    setItems((data as RecurringExpense[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function handleToggleActive(item: RecurringExpense) {
    await supabase.from('vb_recurring_expense').update({ is_active: !item.is_active }).eq('recurring_id', item.recurring_id)
    await fetchItems()
  }

  async function handleDelete(id: number) {
    await supabase.from('vb_recurring_expense').delete().eq('recurring_id', id)
    setDeleteTarget(null)
    await fetchItems()
  }

  async function handleGenerateMonth() {
    const now = new Date()
    // Use current month's 1st as invoice date
    const invoiceDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const active = items.filter(i => i.is_active)
    if (!active.length) return setGenResult('No active recurring expenses to generate.')
    setGenerating(true)

    // Check for duplicates: already generated this month?
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthEnd   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`

    const rows = active.map(item => ({
      supplier_id:         item.supplier_id,
      invoice_date:        invoiceDate,
      product_description: item.description,
      amount_excl_vat:     item.amount_excl_vat,
      vat_rated:           item.vat_rated,
    }))

    const { error } = await supabase.from('vb_expense').insert(rows)
    setGenerating(false)
    if (error) {
      setGenResult(`Error: ${error.message}`)
    } else {
      setGenResult(`Generated ${active.length} expense${active.length !== 1 ? 's' : ''} for ${now.toLocaleString('en-ZA', { month: 'long', year: 'numeric' })}.`)
    }
  }

  const activeCount = items.filter(i => i.is_active).length
  const totalMonthly = items.filter(i => i.is_active).reduce((s, i) => {
    const { amount_incl_vat } = calcVat(i.amount_excl_vat, i.vat_rated)
    return s + amount_incl_vat
  }, 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            {activeCount} active · est. <strong>{ZAR_local(totalMonthly)}</strong>/month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            className="gap-1.5"
            onClick={handleGenerateMonth}
            disabled={generating || activeCount === 0}
          >
            {generating
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />
            }
            <span className="hidden sm:inline">Generate this month</span>
            <span className="sm:hidden">Generate</span>
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditItem(null); setShowAdd(true) }}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">Add recurring</span><span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* Generation result banner */}
      {genResult && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2.5 flex items-center justify-between gap-2 text-sm text-green-700">
          <span>{genResult}</span>
          <button onClick={() => setGenResult(null)} className="text-green-500 hover:text-green-700"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Repeat className="w-10 h-10 opacity-30" />
          <p className="text-sm">No recurring expenses yet.</p>
          <p className="text-xs text-center max-w-xs">Add fixed monthly costs like insurance, internet, or hosting. Generate them all at once each month.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Active</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Excl. VAT</TableHead>
                  <TableHead>VAT</TableHead>
                  <TableHead className="text-right">Monthly total</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => {
                  const { amount_incl_vat } = calcVat(item.amount_excl_vat, item.vat_rated)
                  return (
                    <TableRow key={item.recurring_id} className={!item.is_active ? 'opacity-40' : ''}>
                      <TableCell>
                        <button onClick={() => handleToggleActive(item)} className="text-muted-foreground hover:text-foreground transition-colors">
                          {item.is_active
                            ? <ToggleRight className="w-5 h-5 text-green-600" />
                            : <ToggleLeft className="w-5 h-5" />
                          }
                        </button>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{item.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.vb_supplier?.company_name ?? <span className="italic">None</span>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.category ?? '—'}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">{ZAR_local(item.amount_excl_vat)}</TableCell>
                      <TableCell>{item.vat_rated ? <Badge variant="secondary" className="text-xs">15%</Badge> : <span className="text-xs text-muted-foreground">0%</span>}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums font-medium">{ZAR_local(amount_incl_vat)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditItem(item); setShowAdd(true) }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {items.map(item => {
              const { amount_incl_vat } = calcVat(item.amount_excl_vat, item.vat_rated)
              return (
                <div key={item.recurring_id} className={`rounded-xl border bg-card p-4 space-y-3 ${!item.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.vb_supplier?.company_name ?? 'No supplier'}{item.category ? ` · ${item.category}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.vat_rated ? <Badge variant="secondary" className="text-xs">15%</Badge> : <span className="text-xs text-muted-foreground">0%</span>}
                      <button onClick={() => handleToggleActive(item)}>
                        {item.is_active
                          ? <ToggleRight className="w-5 h-5 text-green-600" />
                          : <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                        }
                      </button>
                    </div>
                  </div>
                  <div className="flex items-end justify-between pt-1 border-t">
                    <span className="text-xs text-muted-foreground">{ZAR_local(item.amount_excl_vat)} excl. VAT</span>
                    <span className="text-sm font-semibold tabular-nums">{ZAR_local(amount_incl_vat)}/mo</span>
                  </div>
                  <div className="flex gap-2 pt-1 border-t">
                    <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => { setEditItem(item); setShowAdd(true) }}>
                      <Pencil className="w-3 h-3 mr-1.5" />Edit
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)}>
                      <Trash2 className="w-3 h-3 mr-1.5" />Delete
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Add / Edit dialog */}
      <RecurringExpenseModal
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditItem(null) }}
        suppliers={suppliers}
        initial={editItem}
        onSave={async (data, id) => {
          if (id) await supabase.from('vb_recurring_expense').update(data).eq('recurring_id', id)
          else    await supabase.from('vb_recurring_expense').insert([data])
          await fetchItems()
        }}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recurring expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{deleteTarget?.description}</strong> from your recurring list. Already-generated expenses are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget.recurring_id)}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Recurring Expense Form Modal ─────────────────────────────────────────────
function RecurringExpenseModal({ open, onClose, suppliers, initial, onSave }: {
  open: boolean; onClose: () => void; suppliers: Supplier[]
  initial?: RecurringExpense | null
  onSave: (data: Omit<RecurringExpense, 'recurring_id' | 'vb_supplier'>, id?: number) => Promise<void>
}) {
  const EMPTY = { supplier_id: null as number | null, description: '', amount_excl_vat: 0, vat_rated: false, is_active: true, category: '', notes: '' }
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (open) {
      setForm(initial
        ? { supplier_id: initial.supplier_id, description: initial.description, amount_excl_vat: initial.amount_excl_vat, vat_rated: initial.vat_rated, is_active: initial.is_active, category: initial.category ?? '', notes: initial.notes ?? '' }
        : { ...EMPTY }
      )
      setError('')
    }
  }, [open, initial])

  const { vat_amount, amount_incl_vat } = calcVat(form.amount_excl_vat, form.vat_rated)

  async function handleSave() {
    if (!form.description.trim()) return setError('Description is required')
    if (!form.amount_excl_vat || form.amount_excl_vat <= 0) return setError('Amount is required')
    setError(''); setSaving(true)
    await onSave({
      supplier_id: form.supplier_id,
      description: form.description.trim(),
      amount_excl_vat: form.amount_excl_vat,
      vat_rated: form.vat_rated,
      is_active: form.is_active,
      category: form.category.trim() || null,
      notes: form.notes.trim() || null,
    }, initial?.recurring_id)
    setSaving(false); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-md h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-none sm:rounded-xl">
        <DialogHeader><DialogTitle>{initial ? 'Edit recurring expense' : 'Add recurring expense'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Description <span className="text-destructive">*</span></Label>
            <Input value={form.description} placeholder="e.g. Business Insurance, Internet" onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Supplier <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Select value={form.supplier_id ? String(form.supplier_id) : 'none'} onValueChange={v => setForm(f => ({ ...f, supplier_id: v === 'none' ? null : Number(v) }))}>
              <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None / internal</SelectItem>
                {suppliers.map(s => <SelectItem key={s.supplier_id} value={String(s.supplier_id)}>{s.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount excl. VAT (R)</Label>
              <Input type="number" inputMode="decimal" min={0} step={0.01} value={form.amount_excl_vat || ''} placeholder="0.00" onChange={e => setForm(f => ({ ...f, amount_excl_vat: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={form.category} placeholder="e.g. Utilities, Admin" onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="rec-vat" checked={form.vat_rated} onCheckedChange={v => setForm(f => ({ ...f, vat_rated: v === true }))} />
            <Label htmlFor="rec-vat" className="cursor-pointer">VAT rated (15%)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="rec-active" checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v === true }))} />
            <Label htmlFor="rec-active" className="cursor-pointer">Active (include when generating)</Label>
          </div>
          <div className="rounded-xl bg-muted/40 border p-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Excl. VAT</span><span>{ZAR(form.amount_excl_vat)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>VAT ({form.vat_rated ? '15%' : '0%'})</span><span>{ZAR(vat_amount)}</span></div>
            <div className="flex justify-between font-medium border-t pt-1 mt-1"><span>Monthly total</span><span>{ZAR(amount_incl_vat)}</span></div>
          </div>
          {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
          <div className="flex justify-end gap-2 pt-1 sticky bottom-0 bg-background pb-2 sm:static sm:pb-0 sm:bg-transparent">
            <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{initial ? 'Save changes' : 'Add recurring'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Mark as Paid Modal ───────────────────────────────────────────────────────
function MarkPaidModal({
  open, onClose, expense, onSave,
}: {
  open: boolean
  onClose: () => void
  expense: Expense | null
  onSave: (expenseId: number, datePaid: string, notes: string) => Promise<void>
}) {
  const today = new Date().toISOString().split('T')[0]
  const [datePaid, setDatePaid] = useState(today)
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (open) { setDatePaid(today); setNotes('') }
  }, [open])

  if (!expense) return null

  async function handleSave() {
    if (!datePaid) return
    setSaving(true)
    await onSave(expense!.expense_id, datePaid, notes)
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-sm p-4 sm:p-6 rounded-none sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          {/* Summary of what's being paid */}
          <div className="rounded-xl bg-muted/40 border p-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Supplier</span>
              <span className="font-medium text-foreground">{expense.vb_supplier?.company_name ?? '—'}</span>
            </div>
            {expense.invoice_number && (
              <div className="flex justify-between text-muted-foreground">
                <span>Invoice #</span><span>{expense.invoice_number}</span>
              </div>
            )}
            <div className="flex justify-between font-medium border-t pt-1 mt-1">
              <span>Amount</span>
              <span>{new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(expense.amount_incl_vat))}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Date paid</Label>
            <Input type="date" value={datePaid} onChange={e => setDatePaid(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              value={notes}
              placeholder="e.g. Paid via EFT, reference 12345…"
              rows={3}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !datePaid}
              className="flex-1 sm:flex-none gap-1.5"
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Check className="w-4 h-4" />
              }
              Confirm payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Filter Sheet (mobile) ─────────────────────────────────────────────────────
function FilterSheet({ open, onClose, suppliers, filterMonth, setFilterMonth, filterYear, setFilterYear, filterFY, setFilterFY, filterSupplier, setFilterSupplier, filterVat, setFilterVat, filterPaid, setFilterPaid, onClear, hasActiveFilters, yearOptions, fyOptions }: {
  open: boolean; onClose: () => void; suppliers: Supplier[]
  filterMonth: string; setFilterMonth: (v: string) => void
  filterYear: string; setFilterYear: (v: string) => void
  filterFY: string; setFilterFY: (v: string) => void
  filterSupplier: string; setFilterSupplier: (v: string) => void
  filterVat: string; setFilterVat: (v: string) => void
  filterPaid: string; setFilterPaid: (v: string) => void
  onClear: () => void; hasActiveFilters: boolean
  yearOptions: string[]; fyOptions: string[]
}) {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-auto max-h-[90dvh] overflow-y-auto rounded-t-2xl px-4 pb-8">
        <SheetHeader className="mb-4"><SheetTitle>Filter expenses</SheetTitle></SheetHeader>
        <div className="space-y-4">
          {[
            { label: 'Year', value: filterYear, onChange: (v: string) => { setFilterFY('all'); setFilterYear(v) }, options: [{ value: 'all', label: 'All years' }, ...yearOptions.map(y => ({ value: y, label: y }))] },
            { label: 'Month', value: filterMonth, onChange: (v: string) => { setFilterFY('all'); setFilterMonth(v) }, options: [{ value: 'all', label: 'All months' }, ...MONTHS.map(m => ({ value: m, label: m }))] },
            { label: 'Financial year', value: filterFY, onChange: (v: string) => { setFilterMonth('all'); setFilterFY(v) }, options: [{ value: 'all', label: 'All fin. years' }, ...fyOptions.map(fy => ({ value: fy, label: `FY ${fy}` }))] },
            { label: 'Supplier', value: filterSupplier, onChange: setFilterSupplier, options: [{ value: 'all', label: 'All suppliers' }, ...suppliers.map(s => ({ value: String(s.supplier_id), label: s.company_name }))] },
            { label: 'VAT status', value: filterVat, onChange: setFilterVat, options: [{ value: 'all', label: 'All (VAT)' }, { value: 'vat', label: 'VAT rated' }, { value: 'no-vat', label: 'Zero rated' }] },
            { label: 'Payment status', value: filterPaid, onChange: setFilterPaid, options: [{ value: 'all', label: 'All' }, { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }] },
          ].map(({ label, value, onChange, options }) => (
            <div key={label} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">{label}</Label>
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            {hasActiveFilters && <Button variant="outline" className="flex-1" onClick={() => { onClear(); onClose() }}><X className="w-4 h-4 mr-1.5" /> Clear</Button>}
            <Button className="flex-1" onClick={onClose}>Apply</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Mobile Expense Card ───────────────────────────────────────────────────────
function ExpenseCard({ expense, onMarkPaid }: { expense: Expense; onMarkPaid: (e: Expense) => void }) {
  const isPaid = !!expense.date_paid
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
        <div className="flex items-center gap-1.5 shrink-0">
          {expense.vat_rated ? <Badge variant="secondary" className="text-xs">15% VAT</Badge> : <span className="text-xs text-muted-foreground">0% VAT</span>}
          <Badge variant={isPaid ? 'default' : 'outline'} className={`text-xs ${isPaid ? 'bg-green-100 text-green-700 border-green-200' : 'text-amber-600 border-amber-300'}`}>
            {isPaid ? 'Paid' : 'Unpaid'}
          </Badge>
        </div>
      </div>
      {expense.product_description && <p className="text-xs text-muted-foreground line-clamp-2">{expense.product_description}</p>}
      <div className="flex items-end justify-between pt-1 border-t">
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>{ZAR(Number(expense.amount_excl_vat))} excl.</div>
          <div>{ZAR(Number(expense.vat_amount))} VAT</div>
          {isPaid && expense.date_paid && <div className="text-green-600">Paid {new Date(expense.date_paid).toLocaleDateString('en-ZA')}</div>}
        </div>
        <div className="text-right space-y-1.5">
          <p className="text-sm font-semibold tabular-nums">{ZAR(Number(expense.amount_incl_vat))}</p>
          {!isPaid && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => onMarkPaid(expense)}
            >
              <Check className="w-3 h-3" /> Mark paid
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Analysis KPI Card ────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, accentColor }: {
  label: string; value: string; sub?: string; trend?: number; accentColor?: string
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 relative overflow-hidden">
      {accentColor && <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: accentColor }} />}
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-1">{label}</p>
      <p className="font-serif text-xl font-bold text-foreground mt-1 leading-tight">{value}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {trend != null && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trend >= 0 ? 'text-destructive' : 'text-green-600'}`}>
            {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(trend).toFixed(1)}%
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
    return Array.from(map.entries()).map(([name, total]) => ({ name, total: Math.round(total) })).sort((a, b) => b.total - a.total)
  }, [expenses])

  const top10 = supplierData.slice(0, 10)
  const topSupplier = supplierData[0]

  const monthlyData = useMemo(() => {
    const map = new Map<string, { excl: number; vat: number; incl: number }>()
    for (const e of expenses) {
      const d = new Date(e.invoice_date); if (isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const cur = map.get(key) ?? { excl: 0, vat: 0, incl: 0 }
      map.set(key, { excl: cur.excl + Number(e.amount_excl_vat), vat: cur.vat + Number(e.vat_amount), incl: cur.incl + Number(e.amount_incl_vat) })
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([key, vals]) => {
      const [yr, mo] = key.split('-')
      return { name: `${MONTHS_SHORT[parseInt(mo) - 1]} ${yr}`, excl: Math.round(vals.excl), vat: Math.round(vals.vat), incl: Math.round(vals.incl) }
    })
  }, [expenses])

  const vatSplit = useMemo(() => {
    let vatTotal = 0, nonVatTotal = 0
    for (const e of expenses) { if (e.vat_rated) vatTotal += Number(e.amount_incl_vat); else nonVatTotal += Number(e.amount_incl_vat) }
    return [{ name: 'VAT rated (15%)', value: Math.round(vatTotal) }, { name: 'Zero rated (0%)', value: Math.round(nonVatTotal) }]
  }, [expenses])

  // Payment status
  const paymentStats = useMemo(() => {
    let paid = 0, unpaid = 0
    for (const e of expenses) {
      if (e.date_paid) paid += Number(e.amount_incl_vat)
      else unpaid += Number(e.amount_incl_vat)
    }
    return { paid: Math.round(paid), unpaid: Math.round(unpaid) }
  }, [expenses])

  const totalVat  = useMemo(() => expenses.reduce((s, e) => s + Number(e.vat_amount), 0), [expenses])
  const totalIncl = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount_incl_vat), 0), [expenses])
  const avgMonthly = monthlyData.length > 0 ? totalIncl / monthlyData.length : 0
  const trend = useMemo(() => {
    if (monthlyData.length < 2) return 0
    const prev = monthlyData[monthlyData.length - 2].incl, curr = monthlyData[monthlyData.length - 1].incl
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Spend (incl. VAT)" value={ZAR(totalIncl)} sub={`${expenses.length} invoices`} accentColor={BRAND.caramel} />
        <KpiCard label="Outstanding (unpaid)" value={ZAR(paymentStats.unpaid)} sub={ZAR(paymentStats.paid) + ' paid'} accentColor={BRAND.terracotta} />
        <KpiCard label="Avg Monthly Spend" value={ZAR(avgMonthly)} sub={`over ${monthlyData.length} months`} accentColor={BRAND.coffee} trend={trend} />
        <KpiCard label="Top 3 Supplier Share" value={`${top3Share.toFixed(1)}%`} sub={topSupplier ? topSupplier.name : '—'} accentColor={BRAND.sage} />
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
                <linearGradient id="inclGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={BRAND.caramel} stopOpacity={0.2} /><stop offset="95%" stopColor={BRAND.caramel} stopOpacity={0} /></linearGradient>
                <linearGradient id="exclGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={BRAND.coffee} stopOpacity={0.15} /><stop offset="95%" stopColor={BRAND.coffee} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={ZARk} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <ReTooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="incl" name="Incl. VAT" stroke={BRAND.caramel} strokeWidth={2.5} fill="url(#inclGrad)" dot={false} activeDot={{ r: 4, fill: BRAND.caramel }} />
              <Area type="monotone" dataKey="excl" name="Excl. VAT" stroke={BRAND.coffee} strokeWidth={2} fill="url(#exclGrad)" dot={false} activeDot={{ r: 4, fill: BRAND.coffee }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-foreground">VAT Breakdown</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Rated vs. zero-rated spend</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={vatSplit} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3} strokeWidth={0}>
                {vatSplit.map((_, i) => <Cell key={i} fill={i === 0 ? BRAND.caramel : BRAND.wheat} />)}
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

      {/* Payment status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Total paid', value: paymentStats.paid, color: BRAND.sage, pct: totalIncl > 0 ? paymentStats.paid / totalIncl : 0 },
          { label: 'Outstanding', value: paymentStats.unpaid, color: BRAND.terracotta, pct: totalIncl > 0 ? paymentStats.unpaid / totalIncl : 0 },
        ].map(({ label, value, color, pct }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">{label}</p>
            <p className="font-serif text-2xl font-bold mt-1">{ZAR(value)}</p>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: color }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">{(pct * 100).toFixed(1)}% of total spend</p>
          </div>
        ))}
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
            <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={ZARk} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis type="category" dataKey="name" width={140} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <ReTooltip content={<CustomTooltip />} />
            <Bar dataKey="total" name="Total spend" radius={[0, 5, 5, 0]} maxBarSize={26}>
              {top10.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-5 space-y-1">
          {top10.map((s, i) => (
            <div key={s.name} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
              <span className="w-5 text-[10px] font-bold tabular-nums text-muted-foreground text-right shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{s.name}</span>
                  <span className="text-sm font-semibold tabular-nums shrink-0">{ZAR(s.total)}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(s.total / top10[0].total) * 100}%`, background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                {totalIncl > 0 ? `${((s.total / totalIncl) * 100).toFixed(1)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {supplierData.length > 10 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-serif text-base font-bold text-foreground mb-4">All Suppliers <span className="text-sm font-normal text-muted-foreground">(#{11}–{supplierData.length})</span></h3>
          <div className="space-y-1">
            {supplierData.slice(10).map((s, i) => (
              <div key={s.name} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                <span className="w-5 text-[10px] font-bold tabular-nums text-muted-foreground text-right shrink-0">#{i + 11}</span>
                <span className="flex-1 text-sm truncate">{s.name}</span>
                <span className="text-sm font-semibold tabular-nums">{ZAR(s.total)}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{totalIncl > 0 ? `${((s.total / totalIncl) * 100).toFixed(1)}%` : '—'}</span>
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

  const [expenses, setExpenses]     = useState<Expense[]>([])
  const [suppliers, setSuppliers]   = useState<Supplier[]>([])
  const [loading, setLoading]       = useState(true)
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [activeTab, setActiveTab]   = useState<'expenses' | 'analysis' | 'recurring' | 'vendors' | 'employees'>('expenses')
  const [allExpenses, setAllExpenses] = useState<AnalyticsExpense[]>([])

  // Vendor modal state
  const [vendorModalOpen, setVendorModalOpen] = useState(false)
  const [editingVendor, setEditingVendor]     = useState<Supplier | null>(null)

  // Mark paid modal state
  const [markPaidExpense, setMarkPaidExpense] = useState<Expense | null>(null)

  const now = new Date()
  const [filterMonth, setFilterMonth]               = useState<string>('all')
  const [filterYear, setFilterYear]                 = useState<string>(String(now.getFullYear()))
  const [filterFY, setFilterFY]                     = useState<string>('all')
  const [filterSupplier, setFilterSupplier]         = useState<string>('all')
  const [filterVat, setFilterVat]                   = useState<string>('all')
  const [filterPaid, setFilterPaid]                 = useState<string>('all')
  const [filterDescription, setFilterDescription]   = useState<string>('')

  const [showUpload, setShowUpload]   = useState(false)
  const [showAdd, setShowAdd]         = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const yearOptions = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - 2 + i))
  const fyOptions   = Array.from({ length: 5 }, (_, i) => { const y = now.getFullYear() - 2 + i; return `${y}/${y + 1}` })

  // ── Fetch suppliers ───────────────────────────────────────────────────────
  const fetchSuppliers = useCallback(async () => {
    const { data } = await supabase.from('vb_supplier')
      .select('supplier_id, company_name, address, phone_number, tax_number, vat_number, vat_registered, account_number, payment_terms, notes')
      .order('company_name')
    setSuppliers((data as Supplier[]) ?? [])
  }, [])

  useEffect(() => { fetchSuppliers() }, [fetchSuppliers])

  // ── Shared filter builder ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(q: any) {
    if (filterFY !== 'all') {
      const { from, to } = financialYearRange(filterFY)
      q = q.gte('invoice_date', from).lte('invoice_date', to)
    } else {
      if (filterYear !== 'all') q = q.gte('invoice_date', `${filterYear}-01-01`).lte('invoice_date', `${filterYear}-12-31`)
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
    if (filterPaid === 'paid')    q = q.not('date_paid', 'is', null)
    if (filterPaid === 'unpaid')  q = q.is('date_paid', null)
    if (filterDescription.trim()) q = q.ilike('product_description', `%${filterDescription.trim()}%`)
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
  }, [page, filterMonth, filterYear, filterFY, filterSupplier, filterVat, filterPaid, filterDescription])

  const fetchAll = useCallback(async () => {
    let q = supabase.from('vb_expense').select('supplier_id, invoice_date, amount_excl_vat, vat_rated, vat_amount, amount_incl_vat, date_paid, vb_supplier(company_name)')
    q = applyFilters(q)
    const { data } = await q
    setAllExpenses((data as unknown as AnalyticsExpense[]) ?? [])
  }, [filterMonth, filterYear, filterFY, filterSupplier, filterVat, filterPaid, filterDescription])

  const [summary, setSummary] = useState({ excl: 0, vat: 0, incl: 0, unpaid: 0 })
  const fetchSummary = useCallback(async () => {
    let q = supabase.from('vb_expense').select('amount_excl_vat, vat_amount, amount_incl_vat, date_paid')
    q = applyFilters(q)
    const { data } = await q
    if (!data) return
    setSummary({
      excl:   data.reduce((s, r) => s + Number(r.amount_excl_vat), 0),
      vat:    data.reduce((s, r) => s + Number(r.vat_amount), 0),
      incl:   data.reduce((s, r) => s + Number(r.amount_incl_vat), 0),
      unpaid: data.filter(r => !r.date_paid).reduce((s, r) => s + Number(r.amount_incl_vat), 0),
    })
  }, [filterMonth, filterYear, filterFY, filterSupplier, filterVat, filterPaid, filterDescription])

  useEffect(() => { setPage(1) }, [filterMonth, filterYear, filterFY, filterSupplier, filterVat, filterPaid, filterDescription])
  useEffect(() => { fetchExpenses() }, [fetchExpenses])
  useEffect(() => { fetchAll() },      [fetchAll])
  useEffect(() => { fetchSummary() },  [fetchSummary])

  const refreshAll = async () => Promise.all([fetchExpenses(), fetchAll(), fetchSummary()])

  async function insertExpenses(rows: ExpenseRow[]) { await supabase.from('vb_expense').insert(rows); await refreshAll() }
  async function insertOne(row: ExpenseRow)         { await supabase.from('vb_expense').insert([row]); await refreshAll() }

  // ── Vendor CRUD ───────────────────────────────────────────────────────────
  async function handleSaveVendor(data: SupplierForm, id?: number) {
    if (id) await supabase.from('vb_supplier').update(data).eq('supplier_id', id)
    else    await supabase.from('vb_supplier').insert([data])
    await fetchSuppliers()
  }
  async function handleDeleteVendor(id: number) {
    await supabase.from('vb_supplier').delete().eq('supplier_id', id)
    await fetchSuppliers()
  }

  // ── Mark as paid ──────────────────────────────────────────────────────────
  async function handleMarkPaid(expenseId: number, datePaid: string, notes: string) {
    await supabase.from('vb_expense')
      .update({ date_paid: datePaid, ...(notes.trim() ? { notes } : {}) })
      .eq('expense_id', expenseId)
    await refreshAll()
  }

  const totalPages       = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const clearFilters     = () => { setFilterMonth('all'); setFilterYear(String(now.getFullYear())); setFilterFY('all'); setFilterSupplier('all'); setFilterVat('all'); setFilterPaid('all'); setFilterDescription('') }
  const hasActiveFilters = filterMonth !== 'all' || filterFY !== 'all' || filterSupplier !== 'all' || filterVat !== 'all' || filterPaid !== 'all' || !!filterDescription.trim()
  const activeFilterCount = [filterMonth !== 'all', filterFY !== 'all', filterSupplier !== 'all', filterVat !== 'all', filterPaid !== 'all', !!filterDescription.trim()].filter(Boolean).length

  // ── Desktop filter selects config ─────────────────────────────────────────
  const desktopFilters = [
    { value: filterYear,     onChange: (v: string) => { setFilterFY('all'); setFilterYear(v) },     w: 'w-28', placeholder: 'Year',      opts: [{ v: 'all', l: 'All years' },     ...yearOptions.map(y  => ({ v: y,          l: y }))] },
    { value: filterMonth,    onChange: (v: string) => { setFilterFY('all'); setFilterMonth(v) },    w: 'w-32', placeholder: 'Month',     opts: [{ v: 'all', l: 'All months' },    ...MONTHS.map(m       => ({ v: m,          l: m }))] },
    { value: filterFY,       onChange: (v: string) => { setFilterMonth('all'); setFilterFY(v) },    w: 'w-36', placeholder: 'Fin. year', opts: [{ v: 'all', l: 'All fin. years' }, ...fyOptions.map(fy  => ({ v: fy,         l: `FY ${fy}` }))] },
    { value: filterSupplier, onChange: setFilterSupplier,                                           w: 'w-44', placeholder: 'Supplier',  opts: [{ v: 'all', l: 'All suppliers' }, ...suppliers.map(s   => ({ v: String(s.supplier_id), l: s.company_name }))] },
    { value: filterVat,      onChange: setFilterVat,                                                w: 'w-32', placeholder: 'VAT',       opts: [{ v: 'all', l: 'All (VAT)' }, { v: 'vat', l: 'VAT rated' }, { v: 'no-vat', l: 'Zero rated' }] },
    { value: filterPaid,     onChange: setFilterPaid,                                               w: 'w-32', placeholder: 'Payment',   opts: [{ v: 'all', l: 'All' }, { v: 'paid', l: 'Paid' }, { v: 'unpaid', l: 'Unpaid' }] },
  ]

  const FilterBar = (
    <div className="space-y-2">
      {/* Description search — always visible */}
      <div className="relative">
        <Input
          className="h-8 text-xs pl-3 pr-7"
          placeholder="Search description…"
          value={filterDescription}
          onChange={e => setFilterDescription(e.target.value)}
        />
        {filterDescription && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setFilterDescription('')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Mobile selects trigger */}
      <div className="flex items-center gap-2 sm:hidden">
        <Button variant="outline" size="sm" className="h-9 gap-1.5 flex-1" onClick={() => setShowFilters(true)}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
          {hasActiveFilters && <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs leading-none">{activeFilterCount}</Badge>}
        </Button>
        {hasActiveFilters && <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFilters}><X className="w-3 h-3 mr-1" /> Clear</Button>}
        <span className="ml-auto text-xs text-muted-foreground shrink-0">{total} record{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Desktop selects */}
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        {desktopFilters.map(({ value, onChange, w, placeholder, opts }) => (
          <Select key={placeholder} value={value} onValueChange={onChange}>
            <SelectTrigger className={`${w} h-8 text-xs`}><SelectValue placeholder={placeholder} /></SelectTrigger>
            <SelectContent>{opts.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
          </Select>
        ))}
        {hasActiveFilters && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}><X className="w-3 h-3 mr-1" /> Clear filters</Button>}
        <span className="ml-auto text-xs text-muted-foreground">{total} record{total !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 sm:py-8 space-y-5 sm:space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track supplier invoices and purchases</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowUpload(true)} className="gap-1.5">
            <Upload className="w-4 h-4" /><span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add expense</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* Summary cards — now 4: added Amount to Pay */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total excl. VAT', value: summary.excl,   color: BRAND.caramel },
          { label: 'VAT paid',        value: summary.vat,    color: BRAND.terracotta },
          { label: 'Total incl. VAT', value: summary.incl,   color: BRAND.coffee },
          { label: 'Amount to pay',   value: summary.unpaid, color: BRAND.sage },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl bg-card border p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: color }} />
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-base sm:text-lg font-semibold tabular-nums">{ZAR(value)}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
        <TabsList className="h-9 rounded-xl bg-muted p-1">
          <TabsTrigger value="expenses" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <ReceiptText className="w-3.5 h-3.5" /> Expenses
          </TabsTrigger>
          <TabsTrigger value="analysis" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <BarChart3 className="w-3.5 h-3.5" /> Analysis
          </TabsTrigger>
          <TabsTrigger value="recurring" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Repeat className="w-3.5 h-3.5" /> Recurring
          </TabsTrigger>
          <TabsTrigger value="vendors" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Store className="w-3.5 h-3.5" /> Vendors
          </TabsTrigger>
          <TabsTrigger value="employees" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Users className="w-3.5 h-3.5" /> Employees
          </TabsTrigger>
        </TabsList>

        {/* ── Expenses tab ── */}
        <TabsContent value="expenses" className="mt-5 space-y-4">
          {FilterBar}
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
                  <TableHead className="text-right">To pay</TableHead>
                  <TableHead>VAT?</TableHead>
                  <TableHead>Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading…</TableCell></TableRow>
                ) : expenses.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground text-sm">No expenses found for the selected filters.</TableCell></TableRow>
                ) : expenses.map(e => (
                  <TableRow key={e.expense_id}>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">{new Date(e.invoice_date).toLocaleDateString('en-ZA')}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{e.vb_supplier?.company_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.invoice_number ?? '—'}</TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate">{e.product_description ?? '—'}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums">{ZAR(Number(e.amount_excl_vat))}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-muted-foreground">{ZAR(Number(e.vat_amount))}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums font-medium">{ZAR(Number(e.amount_incl_vat))}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums">
                      {e.date_paid
                        ? <span className="text-muted-foreground">—</span>
                        : <span className="font-medium text-amber-600">{ZAR(Number(e.amount_incl_vat))}</span>
                      }
                    </TableCell>
                    <TableCell>{e.vat_rated ? <Badge variant="secondary" className="text-xs">15%</Badge> : <span className="text-xs text-muted-foreground">0%</span>}</TableCell>
                    <TableCell>
                      {e.date_paid ? (
                        <span className="text-xs text-green-600 font-medium whitespace-nowrap">
                          {new Date(e.date_paid).toLocaleDateString('en-ZA')}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap"
                          onClick={() => setMarkPaidExpense(e)}
                        >
                          <Check className="w-3 h-3" /> Mark paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="sm:hidden space-y-3">
            {loading ? (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin" />Loading…</div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No expenses found for the selected filters.</div>
            ) : expenses.map(e => <ExpenseCard key={e.expense_id} expense={e} onMarkPaid={setMarkPaidExpense} />)}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {page} of {totalPages}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Analysis tab ── */}
        <TabsContent value="analysis" className="mt-5 space-y-4">
          {FilterBar}
          <AnalysisTab expenses={allExpenses} />
        </TabsContent>

        {/* ── Recurring tab ── */}
        <TabsContent value="recurring" className="mt-5">
          <RecurringTab suppliers={suppliers} />
        </TabsContent>

        {/* ── Vendors tab ── */}
        <TabsContent value="vendors" className="mt-5">
          <VendorsTab
            suppliers={suppliers}
            onAdd={() => { setEditingVendor(null); setVendorModalOpen(true) }}
            onEdit={(s) => { setEditingVendor(s); setVendorModalOpen(true) }}
            onDelete={handleDeleteVendor}
          />
        </TabsContent>

        {/* ── Employees tab — self-contained component ── */}
        <TabsContent value="employees" className="mt-5">
          <EmployeesTab />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} suppliers={suppliers} onImport={insertExpenses} />
      <AddExpenseModal open={showAdd} onClose={() => setShowAdd(false)} suppliers={suppliers} onSave={insertOne} />
      <VendorModal open={vendorModalOpen} onClose={() => setVendorModalOpen(false)} initial={editingVendor} onSave={handleSaveVendor} />
      <MarkPaidModal
        open={!!markPaidExpense}
        onClose={() => setMarkPaidExpense(null)}
        expense={markPaidExpense}
        onSave={handleMarkPaid}
      />
      <FilterSheet
        open={showFilters} onClose={() => setShowFilters(false)} suppliers={suppliers}
        filterMonth={filterMonth}       setFilterMonth={setFilterMonth}
        filterYear={filterYear}         setFilterYear={setFilterYear}
        filterFY={filterFY}             setFilterFY={setFilterFY}
        filterSupplier={filterSupplier} setFilterSupplier={setFilterSupplier}
        filterVat={filterVat}           setFilterVat={setFilterVat}
        filterPaid={filterPaid}         setFilterPaid={setFilterPaid}
        onClear={clearFilters}          hasActiveFilters={hasActiveFilters}
        yearOptions={yearOptions}       fyOptions={fyOptions}
      />
    </div>
  )
}