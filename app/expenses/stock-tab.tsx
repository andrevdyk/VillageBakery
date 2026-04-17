'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Check, AlertCircle, Loader2, ChevronDown, ChevronRight,
  Pencil, Trash2, Package, ShoppingBasket, Search, Upload,
  TrendingUp, TrendingDown, RefreshCw, BarChart3, AlertTriangle,
  FileSpreadsheet, Calendar, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockCategory { category_id: number; name: string; sort_order: number }

interface RetailItem {
  item_id: number
  category_id: number
  plu: string | null
  description: string
  supplier_label: string | null
  cost_price: number | null
  qty_per_case: number | null
  cost_per_item: number | null
  sell_price: number | null
  is_active: boolean
  notes: string | null
  category?: { name: string }
}

interface RetailCount {
  count_id: number
  item_id: number
  count_date: string
  opening_stock: number
  new_received: number
  closing_stock: number
  items_sold: number | null
  revenue: number | null
  notes: string | null
  description?: string
  cost_per_item?: number
  sell_price?: number
  plu?: string | null
  supplier_label?: string | null
  category_name?: string
  variance?: number
  op_stock_value?: number
  cl_stock_value?: number
  markup_pct?: number
  profit_per_item?: number
}

interface FoodItem {
  item_id: number
  category_id: number
  plu: string | null
  description: string
  unit_size: string | null
  cost_price: number | null
  qty_per_pack: number | null
  cost_per_unit: number | null
  sell_price: number | null
  is_active: boolean
  notes: string | null
  category?: { name: string }
}

interface FoodCount {
  count_id: number
  item_id: number
  count_date: string
  opening_stock: number
  new_received: number
  closing_stock: number
  notes: string | null
  description?: string
  cost_per_unit?: number
  unit_size?: string | null
  plu?: string | null
  category_name?: string
  variance?: number
  op_stock_value?: number
  cl_stock_value?: number
}

interface MonthOption { label: string; value: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ZAR = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n)

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
const fmtMonth = (d: string) => new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).toISOString().split('T')[0]
}

function getLastNMonths(n = 12): MonthOption[] {
  const opts: MonthOption[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const last = lastDayOfMonth(d.getFullYear(), d.getMonth() + 1)
    opts.push({
      label: d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' }),
      value: last,
    })
  }
  return opts
}

function varianceBadge(v: number | undefined) {
  if (v == null) return null
  if (v > 0)  return <Badge className="text-xs bg-red-50 text-red-600 border-red-200 border">{v > 0 ? '+' : ''}{v.toFixed(2)}</Badge>
  if (v < 0)  return <Badge className="text-xs bg-blue-50 text-blue-600 border-blue-200 border">{v.toFixed(2)}</Badge>
  return <Badge variant="secondary" className="text-xs">0</Badge>
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, trend, trendLabel, icon: Icon, accent }: {
  label: string; value: string; sub?: string
  trend?: 'up' | 'down' | 'flat'; trendLabel?: string
  icon?: React.ElementType; accent?: string
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
        {Icon && (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent ?? 'bg-muted'}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {(sub || trendLabel) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {trend === 'up' && <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />}
          {trend === 'down' && <ArrowDownRight className="w-3.5 h-3.5 text-emerald-500" />}
          {trend === 'flat' && <Minus className="w-3.5 h-3.5" />}
          <span>{trendLabel ?? sub}</span>
        </div>
      )}
    </div>
  )
}

// ─── Low Stock Alert Panel ────────────────────────────────────────────────────

function LowStockPanel({ counts }: { counts: RetailCount[] }) {
  const lowItems = useMemo(() => {
    return counts
      .filter(c => {
        if (c.opening_stock <= 0) return false
        const ratio = c.closing_stock / c.opening_stock
        return ratio < 0.25
      })
      .sort((a, b) => {
        const ra = a.closing_stock / a.opening_stock
        const rb = b.closing_stock / b.opening_stock
        return ra - rb
      })
  }, [counts])

  if (lowItems.length === 0) return (
    <div className="rounded-2xl border bg-card p-6 flex flex-col items-center gap-2 text-muted-foreground">
      <Check className="w-8 h-8 text-emerald-500 opacity-60" />
      <p className="text-sm font-medium">All items sufficiently stocked</p>
      <p className="text-xs">No items below 25% of opening stock</p>
    </div>
  )

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2 bg-amber-50">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-amber-700">{lowItems.length} items running low</span>
        <span className="text-xs text-amber-600 ml-auto">closing stock &lt; 25% of opening</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">Close</TableHead>
              <TableHead className="text-right">% Left</TableHead>
              <TableHead className="text-right">Cl. Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lowItems.map(c => {
              const pct = c.opening_stock > 0 ? (c.closing_stock / c.opening_stock * 100) : 0
              const color = pct === 0 ? 'text-red-600 bg-red-50' : pct < 10 ? 'text-orange-600 bg-orange-50' : 'text-amber-600 bg-amber-50'
              return (
                <TableRow key={c.count_id}>
                  <TableCell className="text-xs font-medium max-w-[200px] truncate">{c.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.category_name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{c.opening_stock}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-semibold">{c.closing_stock}</TableCell>
                  <TableCell className="text-right">
                    <Badge className={`text-xs border ${color}`}>{pct.toFixed(0)}%</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{ZAR(c.cl_stock_value)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ─── Category Value Breakdown ─────────────────────────────────────────────────

function CategoryBreakdown({ counts }: { counts: RetailCount[] }) {
  const cats = useMemo(() => {
    const map = new Map<string, { opVal: number; clVal: number; items: number }>()
    for (const c of counts) {
      const k = c.category_name ?? 'Uncategorised'
      const e = map.get(k) ?? { opVal: 0, clVal: 0, items: 0 }
      e.opVal += c.op_stock_value ?? 0
      e.clVal += c.cl_stock_value ?? 0
      e.items++
      map.set(k, e)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.clVal - a.clVal)
  }, [counts])

  const maxVal = Math.max(...cats.map(c => c.clVal), 1)

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b">
        <p className="text-sm font-semibold">Stock Value by Category</p>
        <p className="text-xs text-muted-foreground">Closing stock value</p>
      </div>
      <div className="p-4 space-y-3">
        {cats.map(cat => (
          <div key={cat.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate max-w-[160px]">{cat.name}</span>
              <span className="tabular-nums text-muted-foreground">{ZAR(cat.clVal)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground/80 transition-all"
                style={{ width: `${(cat.clVal / maxVal * 100).toFixed(1)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Retail Dashboard ─────────────────────────────────────────────────────────

function RetailDashboard({ counts, month }: { counts: RetailCount[]; month: string }) {
  const totals = useMemo(() => {
    const opValue  = counts.reduce((s, c) => s + (c.op_stock_value ?? 0), 0)
    const clValue  = counts.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0)
    const revenue  = counts.reduce((s, c) => s + (c.revenue ?? 0), 0)
    const itemsWithStock = counts.filter(c => c.opening_stock > 0 || c.closing_stock > 0).length
    const lowCount = counts.filter(c => c.opening_stock > 0 && c.closing_stock / c.opening_stock < 0.25).length
    const change   = opValue > 0 ? ((clValue - opValue) / opValue * 100) : 0
    return { opValue, clValue, revenue, itemsWithStock, lowCount, change }
  }, [counts])

  if (counts.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <BarChart3 className="w-10 h-10 opacity-20" />
      <p className="text-sm">No stock count data for this month.</p>
      <p className="text-xs">Upload a monthly Excel file or enter counts manually.</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Opening Stock Value"
          value={ZAR(totals.opValue)}
          icon={Package}
          accent="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Closing Stock Value"
          value={ZAR(totals.clValue)}
          trend={totals.change < 0 ? 'down' : totals.change > 0 ? 'up' : 'flat'}
          trendLabel={`${totals.change > 0 ? '+' : ''}${totals.change.toFixed(1)}% vs opening`}
          icon={Package}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Total Revenue"
          value={ZAR(totals.revenue)}
          icon={TrendingUp}
          accent="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="Low Stock Items"
          value={String(totals.lowCount)}
          sub={`of ${totals.itemsWithStock} tracked items`}
          icon={AlertTriangle}
          accent={totals.lowCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}
        />
      </div>

      {/* Low stock alerts */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Low Stock Alerts</h3>
        <LowStockPanel counts={counts} />
      </div>

      {/* Category breakdown */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Category Breakdown</h3>
        <CategoryBreakdown counts={counts} />
      </div>
    </div>
  )
}

// ─── Excel Upload Modal ───────────────────────────────────────────────────────

function ExcelUploadModal({ open, onClose, items, onSave, countDate, mode }: {
  open: boolean
  onClose: () => void
  items: (RetailItem | FoodItem)[]
  onSave: (rows: any[]) => Promise<void>
  countDate: string
  mode: 'retail' | 'food'
}) {
  const [file, setFile]       = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [matched, setMatched] = useState(0)
  const [unmatched, setUnmatched] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!open) { setFile(null); setPreview([]); setError(''); setUnmatched([]) } }, [open])

  function handleFile(f: File) {
    setFile(f); setError(''); setPreview([]); setUnmatched([])
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        // Try to find the right sheet
        const sheetName = mode === 'retail'
          ? wb.SheetNames.find(n => n.toLowerCase().includes('retail')) ?? wb.SheetNames[0]
          : wb.SheetNames.find(n => n.toLowerCase().includes('kitchen') || n.toLowerCase().includes('food')) ?? wb.SheetNames[0]

        const ws   = wb.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]

        // Find header row
        const headerIdx = data.findIndex(r => r.some(c => typeof c === 'string' && c.toUpperCase().includes('ITEM')))
        if (headerIdx < 0) return setError('Could not find header row with "ITEM" column')

        const headers = (data[headerIdx] as string[]).map(h => String(h ?? '').toUpperCase().trim())
        const col = (name: string) => headers.findIndex(h => h.includes(name))

        const itemCol    = col('ITEM')
        const openCol    = headers.findIndex(h => h.includes('O/STOCK') || h.includes('OPENING'))
        const recvCol    = headers.findIndex(h => h.includes('NEW STOCK') || h.includes('RECEIVED'))
        const closeCol   = headers.findIndex(h => h.includes('C/STOCK') || h.includes('CLOSING'))
        const soldCol    = headers.findIndex(h => h.includes('ITEMS SOLD'))
        const revCol     = headers.findIndex(h => h.includes('REVENUE'))

        if (itemCol < 0 || openCol < 0 || closeCol < 0)
          return setError(`Missing columns. Found: ${headers.filter(Boolean).join(', ')}`)

        // Build description→item_id map
        const descMap = new Map<string, number>()
        for (const item of items) {
          descMap.set(item.description.trim().toUpperCase(), item.item_id)
        }

        const rows: any[] = []
        const unmatched_: string[] = []

        for (let i = headerIdx + 1; i < data.length; i++) {
          const row = data[i]
          const desc = String(row[itemCol] ?? '').trim()
          if (!desc || desc.toLowerCase() === 'total') continue

          const itemId = descMap.get(desc.toUpperCase())
          if (!itemId) {
            if (desc && desc.length > 2) unmatched_.push(desc)
            continue
          }

          const os = parseFloat(row[openCol])  || 0
          const nr = parseFloat(row[recvCol])  || 0
          const cs = parseFloat(row[closeCol]) || 0

          const baseRow: any = { item_id: itemId, count_date: countDate, opening_stock: os, new_received: nr, closing_stock: cs, notes: null }
          if (mode === 'retail') {
            baseRow.items_sold = soldCol >= 0 && row[soldCol] != null ? parseFloat(row[soldCol]) || null : null
            baseRow.revenue    = revCol  >= 0 && row[revCol]  != null ? parseFloat(row[revCol])  || null : null
          }
          rows.push(baseRow)
        }

        setMatched(rows.length)
        setUnmatched(unmatched_.slice(0, 20))
        setPreview(rows)
      } catch (err: any) {
        setError('Failed to parse Excel file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(f)
  }

  async function handleSave() {
    if (!preview.length) return
    setSaving(true)
    await onSave(preview)
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg sm:max-w-xl overflow-y-auto max-h-[90vh] p-4 sm:p-6 rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Upload Monthly Stock Count
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-6 text-center space-y-3 hover:border-muted-foreground/40 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">{file ? file.name : 'Drop your Excel file here'}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {file ? `Parsed for ${fmtDate(countDate)}` : '.xlsx or .xls — same format as your stocktake sheet'}
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            {!file && (
              <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>
                Browse file
              </Button>
            )}
          </div>

          {preview.length > 0 && (
            <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-700">{matched} items matched and ready to import</span>
              </div>
              {unmatched.length > 0 && (
                <div>
                  <p className="text-xs text-amber-600 font-medium flex items-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3" />{unmatched.length} items not found in database (will be skipped):
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{unmatched.join(', ')}{unmatched.length === 20 ? '…' : ''}</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!preview.length || saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Import {matched > 0 ? `${matched} items` : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Item Form Modals ─────────────────────────────────────────────────────────

interface ItemFormRetail {
  category_id: number; plu: string; description: string; supplier_label: string
  cost_price: string; qty_per_case: string; cost_per_item: string; sell_price: string
  is_active: boolean; notes: string
}
interface ItemFormFood {
  category_id: number; plu: string; description: string; unit_size: string
  cost_price: string; qty_per_pack: string; cost_per_unit: string; sell_price: string
  is_active: boolean; notes: string
}

function RetailItemModal({ open, onClose, categories, initial, onSave }: {
  open: boolean; onClose: () => void; categories: StockCategory[]
  initial?: RetailItem | null; onSave: (data: Partial<RetailItem>, id?: number) => Promise<void>
}) {
  const EMPTY: ItemFormRetail = { category_id: categories[0]?.category_id ?? 0, plu: '', description: '', supplier_label: '', cost_price: '', qty_per_case: '', cost_per_item: '', sell_price: '', is_active: true, notes: '' }
  const [form, setForm] = useState<ItemFormRetail>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) {
      setForm(initial ? { category_id: initial.category_id, plu: initial.plu ?? '', description: initial.description, supplier_label: initial.supplier_label ?? '', cost_price: initial.cost_price?.toString() ?? '', qty_per_case: initial.qty_per_case?.toString() ?? '', cost_per_item: initial.cost_per_item?.toString() ?? '', sell_price: initial.sell_price?.toString() ?? '', is_active: initial.is_active, notes: initial.notes ?? '' } : { ...EMPTY, category_id: categories[0]?.category_id ?? 0 })
      setError('')
    }
  }, [open, initial])
  const set = (k: keyof ItemFormRetail, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  async function handleSave() {
    if (!form.description.trim()) return setError('Description is required')
    if (!form.category_id) return setError('Category is required')
    setError(''); setSaving(true)
    await onSave({ category_id: form.category_id, plu: form.plu || null, description: form.description.trim(), supplier_label: form.supplier_label || null, cost_price: form.cost_price ? parseFloat(form.cost_price) : null, qty_per_case: form.qty_per_case ? parseFloat(form.qty_per_case) : null, cost_per_item: form.cost_per_item ? parseFloat(form.cost_per_item) : null, sell_price: form.sell_price ? parseFloat(form.sell_price) : null, is_active: form.is_active, notes: form.notes || null }, initial?.item_id)
    setSaving(false); onClose()
  }
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-none sm:rounded-xl">
        <DialogHeader><DialogTitle>{initial ? 'Edit retail item' : 'Add retail item'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2"><Label>Category <span className="text-destructive">*</span></Label><Select value={String(form.category_id)} onValueChange={v => set('category_id', Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.category_id} value={String(c.category_id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5 col-span-2"><Label>Description <span className="text-destructive">*</span></Label><Input value={form.description} onChange={e => set('description', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>PLU</Label><Input value={form.plu} onChange={e => set('plu', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Supplier label</Label><Input value={form.supplier_label} onChange={e => set('supplier_label', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Cost price (case)</Label><Input type="number" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Qty per case</Label><Input type="number" value={form.qty_per_case} onChange={e => set('qty_per_case', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Cost per item</Label><Input type="number" value={form.cost_per_item} onChange={e => set('cost_per_item', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Sell price</Label><Input type="number" value={form.sell_price} onChange={e => set('sell_price', e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2"><Checkbox id="ri-active" checked={form.is_active} onCheckedChange={v => set('is_active', v === true)} /><Label htmlFor="ri-active" className="cursor-pointer">Active item</Label></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} rows={2} onChange={e => set('notes', e.target.value)} /></div>
          {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{initial ? 'Save' : 'Add item'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FoodItemModal({ open, onClose, categories, initial, onSave }: {
  open: boolean; onClose: () => void; categories: StockCategory[]
  initial?: FoodItem | null; onSave: (data: Partial<FoodItem>, id?: number) => Promise<void>
}) {
  const EMPTY: ItemFormFood = { category_id: categories[0]?.category_id ?? 0, plu: '', description: '', unit_size: '', cost_price: '', qty_per_pack: '', cost_per_unit: '', sell_price: '', is_active: true, notes: '' }
  const [form, setForm] = useState<ItemFormFood>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) {
      setForm(initial ? { category_id: initial.category_id, plu: initial.plu ?? '', description: initial.description, unit_size: initial.unit_size ?? '', cost_price: initial.cost_price?.toString() ?? '', qty_per_pack: initial.qty_per_pack?.toString() ?? '', cost_per_unit: initial.cost_per_unit?.toString() ?? '', sell_price: initial.sell_price?.toString() ?? '', is_active: initial.is_active, notes: initial.notes ?? '' } : { ...EMPTY, category_id: categories[0]?.category_id ?? 0 })
      setError('')
    }
  }, [open, initial])
  const set = (k: keyof ItemFormFood, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  async function handleSave() {
    if (!form.description.trim()) return setError('Description is required')
    setError(''); setSaving(true)
    await onSave({ category_id: form.category_id, plu: form.plu || null, description: form.description.trim(), unit_size: form.unit_size || null, cost_price: form.cost_price ? parseFloat(form.cost_price) : null, qty_per_pack: form.qty_per_pack ? parseFloat(form.qty_per_pack) : null, cost_per_unit: form.cost_per_unit ? parseFloat(form.cost_per_unit) : null, sell_price: form.sell_price ? parseFloat(form.sell_price) : null, is_active: form.is_active, notes: form.notes || null }, initial?.item_id)
    setSaving(false); onClose()
  }
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-none sm:rounded-xl">
        <DialogHeader><DialogTitle>{initial ? 'Edit food item' : 'Add food item'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2"><Label>Category <span className="text-destructive">*</span></Label><Select value={String(form.category_id)} onValueChange={v => set('category_id', Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.category_id} value={String(c.category_id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5 col-span-2"><Label>Description <span className="text-destructive">*</span></Label><Input value={form.description} onChange={e => set('description', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>PLU</Label><Input value={form.plu} onChange={e => set('plu', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Unit size</Label><Input value={form.unit_size} onChange={e => set('unit_size', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Cost price (pack)</Label><Input type="number" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Qty per pack</Label><Input type="number" value={form.qty_per_pack} onChange={e => set('qty_per_pack', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Cost per unit</Label><Input type="number" value={form.cost_per_unit} onChange={e => set('cost_per_unit', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Sell price</Label><Input type="number" value={form.sell_price} onChange={e => set('sell_price', e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2"><Checkbox id="fi-active" checked={form.is_active} onCheckedChange={v => set('is_active', v === true)} /><Label htmlFor="fi-active" className="cursor-pointer">Active item</Label></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} rows={2} onChange={e => set('notes', e.target.value)} /></div>
          {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{initial ? 'Save' : 'Add item'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Count Entry Modal (manual) ───────────────────────────────────────────────

function RetailCountModal({ open, onClose, items, existingCounts, onSave, countDate }: {
  open: boolean; onClose: () => void; items: RetailItem[]; existingCounts: RetailCount[]
  countDate: string; onSave: (rows: any[]) => Promise<void>
}) {
  type RowState = { opening_stock: string; new_received: string; closing_stock: string; items_sold: string; revenue: string }
  const [rows, setRows]   = useState<Record<number, RowState>>({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    const init: Record<number, RowState> = {}
    for (const item of items) {
      const ex = existingCounts.find(c => c.item_id === item.item_id)
      init[item.item_id] = { opening_stock: ex ? String(ex.opening_stock) : '0', new_received: ex ? String(ex.new_received) : '0', closing_stock: ex ? String(ex.closing_stock) : '0', items_sold: ex?.items_sold != null ? String(ex.items_sold) : '', revenue: ex?.revenue != null ? String(ex.revenue) : '' }
    }
    setRows(init); setSearch('')
  }, [open, items, existingCounts])

  const set = (itemId: number, k: keyof RowState, v: string) => setRows(r => ({ ...r, [itemId]: { ...r[itemId], [k]: v } }))
  const filtered = items.filter(i => i.description.toLowerCase().includes(search.toLowerCase()) || (i.plu && i.plu.includes(search)))

  async function handleSave() {
    setSaving(true)
    await onSave(items.map(item => ({ item_id: item.item_id, count_date: countDate, opening_stock: parseFloat(rows[item.item_id]?.opening_stock) || 0, new_received: parseFloat(rows[item.item_id]?.new_received) || 0, closing_stock: parseFloat(rows[item.item_id]?.closing_stock) || 0, items_sold: rows[item.item_id]?.items_sold ? parseFloat(rows[item.item_id].items_sold) : null, revenue: rows[item.item_id]?.revenue ? parseFloat(rows[item.item_id].revenue) : null, notes: null })))
    setSaving(false); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-5xl h-[100dvh] sm:h-[90vh] flex flex-col p-0 rounded-none sm:rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-4 shrink-0">
          <div><h2 className="font-semibold text-base">Retail Stock Count</h2><p className="text-xs text-muted-foreground">{fmtDate(countDate)} · {items.length} items</p></div>
          <div className="relative max-w-xs flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input className="pl-8 h-8 text-xs" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead className="w-8">PLU</TableHead><TableHead>Item</TableHead>
                <TableHead className="text-right w-24">Open</TableHead><TableHead className="text-right w-24">Received</TableHead>
                <TableHead className="text-right w-24">Close</TableHead><TableHead className="text-right w-20">Variance</TableHead>
                <TableHead className="text-right w-24">Sold</TableHead><TableHead className="text-right w-28">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => {
                const r = rows[item.item_id] ?? { opening_stock: '0', new_received: '0', closing_stock: '0', items_sold: '', revenue: '' }
                const variance = (parseFloat(r.opening_stock) || 0) + (parseFloat(r.new_received) || 0) - (parseFloat(r.closing_stock) || 0)
                return (
                  <TableRow key={item.item_id}>
                    <TableCell className="text-xs text-muted-foreground">{item.plu ?? '—'}</TableCell>
                    <TableCell className="text-xs font-medium max-w-[180px]"><p className="truncate">{item.description}</p>{item.sell_price != null && <p className="text-[10px] text-muted-foreground">{ZAR(item.sell_price)}</p>}</TableCell>
                    {(['opening_stock', 'new_received', 'closing_stock'] as const).map(k => (<TableCell key={k} className="text-right p-1"><Input type="number" className="h-7 text-xs text-right w-20 ml-auto" value={r[k]} onChange={e => set(item.item_id, k, e.target.value)} /></TableCell>))}
                    <TableCell className="text-right">{varianceBadge(variance)}</TableCell>
                    <TableCell className="text-right p-1"><Input type="number" className="h-7 text-xs text-right w-20 ml-auto" value={r.items_sold} placeholder="—" onChange={e => set(item.item_id, 'items_sold', e.target.value)} /></TableCell>
                    <TableCell className="text-right p-1"><Input type="number" className="h-7 text-xs text-right w-24 ml-auto" value={r.revenue} placeholder="—" onChange={e => set(item.item_id, 'revenue', e.target.value)} /></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div className="px-4 sm:px-6 py-3 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save count</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FoodCountModal({ open, onClose, items, existingCounts, onSave, countDate }: {
  open: boolean; onClose: () => void; items: FoodItem[]; existingCounts: FoodCount[]
  countDate: string; onSave: (rows: any[]) => Promise<void>
}) {
  type RowState = { opening_stock: string; new_received: string; closing_stock: string }
  const [rows, setRows]   = useState<Record<number, RowState>>({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    const init: Record<number, RowState> = {}
    for (const item of items) {
      const ex = existingCounts.find(c => c.item_id === item.item_id)
      init[item.item_id] = { opening_stock: ex ? String(ex.opening_stock) : '0', new_received: ex ? String(ex.new_received) : '0', closing_stock: ex ? String(ex.closing_stock) : '0' }
    }
    setRows(init); setSearch('')
  }, [open, items, existingCounts])

  const set = (itemId: number, k: keyof RowState, v: string) => setRows(r => ({ ...r, [itemId]: { ...r[itemId], [k]: v } }))
  const filtered = items.filter(i => i.description.toLowerCase().includes(search.toLowerCase()))

  async function handleSave() {
    setSaving(true)
    await onSave(items.map(item => ({ item_id: item.item_id, count_date: countDate, opening_stock: parseFloat(rows[item.item_id]?.opening_stock) || 0, new_received: parseFloat(rows[item.item_id]?.new_received) || 0, closing_stock: parseFloat(rows[item.item_id]?.closing_stock) || 0, notes: null })))
    setSaving(false); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-4xl h-[100dvh] sm:h-[90vh] flex flex-col p-0 rounded-none sm:rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-4 shrink-0">
          <div><h2 className="font-semibold text-base">Food / Kitchen Stock Count</h2><p className="text-xs text-muted-foreground">{fmtDate(countDate)} · {items.length} items</p></div>
          <div className="relative max-w-xs flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input className="pl-8 h-8 text-xs" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow><TableHead>Item</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Open</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Close</TableHead><TableHead className="text-right">Variance</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => {
                const r = rows[item.item_id] ?? { opening_stock: '0', new_received: '0', closing_stock: '0' }
                const variance = (parseFloat(r.opening_stock) || 0) + (parseFloat(r.new_received) || 0) - (parseFloat(r.closing_stock) || 0)
                return (
                  <TableRow key={item.item_id}>
                    <TableCell className="text-xs font-medium"><p className="truncate max-w-[200px]">{item.description}</p></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.unit_size ?? '—'}</TableCell>
                    {(['opening_stock', 'new_received', 'closing_stock'] as const).map(k => (<TableCell key={k} className="text-right p-1"><Input type="number" className="h-7 text-xs text-right w-20 ml-auto" value={r[k]} onChange={e => set(item.item_id, k, e.target.value)} /></TableCell>))}
                    <TableCell className="text-right">{varianceBadge(variance)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div className="px-4 sm:px-6 py-3 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save count</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Results views (category-grouped) ────────────────────────────────────────

function RetailCountResultsView({ counts, onNewCount }: { counts: RetailCount[]; onNewCount: () => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const byCategory = useMemo(() => {
    const map = new Map<string, RetailCount[]>()
    for (const c of counts) { const k = c.category_name ?? 'Uncategorised'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(c) }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [counts])
  const totals = useMemo(() => ({ opValue: counts.reduce((s, c) => s + (c.op_stock_value ?? 0), 0), clValue: counts.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0), revenue: counts.reduce((s, c) => s + (c.revenue ?? 0), 0) }), [counts])
  if (counts.length === 0) return (<div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3"><Package className="w-10 h-10 opacity-30" /><p className="text-sm">No stock count for this month.</p><Button size="sm" onClick={onNewCount}><Plus className="w-4 h-4 mr-1.5" />Enter count</Button></div>)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[{ label: 'Opening Value', value: totals.opValue }, { label: 'Closing Value', value: totals.clValue }, { label: 'Revenue', value: totals.revenue }].map(({ label, value }) => (
          <div key={label} className="rounded-xl border bg-card p-3 text-center"><p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p><p className="font-bold text-sm">{ZAR(value)}</p></div>
        ))}
      </div>
      {byCategory.map(([catName, items]) => {
        const isOpen = !collapsed.has(catName)
        const catRevenue = items.reduce((s, c) => s + (c.revenue ?? 0), 0)
        const catClValue = items.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0)
        return (
          <div key={catName} className="rounded-xl border overflow-hidden">
            <button className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left" onClick={() => setCollapsed(s => { const n = new Set(s); isOpen ? n.add(catName) : n.delete(catName); return n })}>
              <div className="flex items-center gap-2">{isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}<span className="text-xs font-semibold uppercase tracking-wide">{catName}</span><Badge variant="secondary" className="text-xs">{items.length}</Badge></div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">{catRevenue > 0 && <span>Rev: <strong>{ZAR(catRevenue)}</strong></span>}<span>Stock: <strong>{ZAR(catClValue)}</strong></span></div>
            </button>
            {isOpen && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-10">PLU</TableHead><TableHead>Item</TableHead><TableHead className="text-right">Open</TableHead><TableHead className="text-right">Rcvd</TableHead><TableHead className="text-right">Close</TableHead><TableHead className="text-right">Var</TableHead><TableHead className="text-right">Op Value</TableHead><TableHead className="text-right">Cl Value</TableHead><TableHead className="text-right">Sell</TableHead><TableHead className="text-right">Markup</TableHead><TableHead className="text-right">Sold</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {items.map(c => (
                      <TableRow key={c.count_id}>
                        <TableCell className="text-xs text-muted-foreground">{c.plu ?? '—'}</TableCell>
                        <TableCell className="text-xs font-medium max-w-[180px] truncate">{c.description}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{c.opening_stock}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{c.new_received}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{c.closing_stock}</TableCell>
                        <TableCell className="text-right">{varianceBadge(c.variance)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums text-muted-foreground">{ZAR(c.op_stock_value)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{ZAR(c.cl_stock_value)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{ZAR(c.sell_price)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{c.markup_pct != null ? `${c.markup_pct.toFixed(1)}%` : '—'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{c.items_sold ?? '—'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-medium">{ZAR(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FoodCountResultsView({ counts, onNewCount }: { counts: FoodCount[]; onNewCount: () => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const byCategory = useMemo(() => {
    const map = new Map<string, FoodCount[]>()
    for (const c of counts) { const k = c.category_name ?? 'Uncategorised'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(c) }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [counts])
  const totals = useMemo(() => ({ opValue: counts.reduce((s, c) => s + (c.op_stock_value ?? 0), 0), clValue: counts.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0) }), [counts])
  if (counts.length === 0) return (<div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3"><ShoppingBasket className="w-10 h-10 opacity-30" /><p className="text-sm">No food stock count for this month.</p><Button size="sm" onClick={onNewCount}><Plus className="w-4 h-4 mr-1.5" />Enter count</Button></div>)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[{ label: 'Opening Value', value: totals.opValue }, { label: 'Closing Value', value: totals.clValue }].map(({ label, value }) => (
          <div key={label} className="rounded-xl border bg-card p-3 text-center"><p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p><p className="font-bold text-sm">{ZAR(value)}</p></div>
        ))}
      </div>
      {byCategory.map(([catName, items]) => {
        const isOpen = !collapsed.has(catName)
        const catClValue = items.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0)
        return (
          <div key={catName} className="rounded-xl border overflow-hidden">
            <button className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left" onClick={() => setCollapsed(s => { const n = new Set(s); isOpen ? n.add(catName) : n.delete(catName); return n })}>
              <div className="flex items-center gap-2">{isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}<span className="text-xs font-semibold uppercase tracking-wide">{catName}</span><Badge variant="secondary" className="text-xs">{items.length}</Badge></div>
              <span className="text-xs text-muted-foreground">Stock: <strong>{ZAR(catClValue)}</strong></span>
            </button>
            {isOpen && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Open</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Close</TableHead><TableHead className="text-right">Variance</TableHead><TableHead className="text-right">Op Value</TableHead><TableHead className="text-right">Cl Value</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {items.map(c => (
                      <TableRow key={c.count_id}>
                        <TableCell className="text-xs font-medium max-w-[200px] truncate">{c.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.unit_size ?? '—'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{c.opening_stock}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{c.new_received}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{c.closing_stock}</TableCell>
                        <TableCell className="text-right">{varianceBadge(c.variance)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums text-muted-foreground">{ZAR(c.op_stock_value)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{ZAR(c.cl_stock_value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Items panels ─────────────────────────────────────────────────────────────

function RetailItemsPanel({ items, categories, onAdd, onEdit, onDelete }: { items: RetailItem[]; categories: StockCategory[]; onAdd: () => void; onEdit: (i: RetailItem) => void; onDelete: (id: number) => void }) {
  const [search, setSearch] = useState(''); const [catFilter, setCatFilter] = useState('all'); const [deleteTarget, setDeleteTarget] = useState<RetailItem | null>(null)
  const filtered = items.filter(i => (catFilter === 'all' || i.category_id === Number(catFilter)) && i.description.toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center"><div className="relative flex-1 min-w-[160px] max-w-xs"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input className="pl-8 h-8 text-xs" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} /></div><Select value={catFilter} onValueChange={setCatFilter}><SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map(c => <SelectItem key={c.category_id} value={String(c.category_id)}>{c.name}</SelectItem>)}</SelectContent></Select><span className="text-xs text-muted-foreground">{filtered.length} items</span><Button size="sm" className="ml-auto gap-1.5" onClick={onAdd}><Plus className="w-4 h-4" />Add item</Button></div>
      <div className="rounded-xl border overflow-hidden"><Table><TableHeader><TableRow><TableHead>PLU</TableHead><TableHead>Description</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Cost/item</TableHead><TableHead className="text-right">Sell</TableHead><TableHead className="text-right">Markup</TableHead><TableHead className="w-16" /></TableRow></TableHeader><TableBody>{filtered.length === 0 ? (<TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No items found.</TableCell></TableRow>) : filtered.map(item => { const markup = item.cost_per_item && item.sell_price ? ((item.sell_price - item.cost_per_item) / item.cost_per_item * 100).toFixed(1) + '%' : '—'; return (<TableRow key={item.item_id} className={!item.is_active ? 'opacity-40' : ''}><TableCell className="text-xs text-muted-foreground">{item.plu ?? '—'}</TableCell><TableCell className="text-sm font-medium max-w-[200px] truncate">{item.description}</TableCell><TableCell className="text-xs text-muted-foreground">{item.category?.name ?? '—'}</TableCell><TableCell className="text-xs text-right tabular-nums">{ZAR(item.cost_per_item)}</TableCell><TableCell className="text-xs text-right tabular-nums">{ZAR(item.sell_price)}</TableCell><TableCell className="text-xs text-right tabular-nums">{markup}</TableCell><TableCell><div className="flex items-center gap-1 justify-end"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="w-3.5 h-3.5" /></Button></div></TableCell></TableRow>) })}</TableBody></Table></div>
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete item?</AlertDialogTitle><AlertDialogDescription>This permanently deletes <strong>{deleteTarget?.description}</strong> and all its stock counts.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { if (deleteTarget) { onDelete(deleteTarget.item_id); setDeleteTarget(null) } }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  )
}

function FoodItemsPanel({ items, categories, onAdd, onEdit, onDelete }: { items: FoodItem[]; categories: StockCategory[]; onAdd: () => void; onEdit: (i: FoodItem) => void; onDelete: (id: number) => void }) {
  const [search, setSearch] = useState(''); const [catFilter, setCatFilter] = useState('all'); const [deleteTarget, setDeleteTarget] = useState<FoodItem | null>(null)
  const filtered = items.filter(i => (catFilter === 'all' || i.category_id === Number(catFilter)) && i.description.toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center"><div className="relative flex-1 min-w-[160px] max-w-xs"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input className="pl-8 h-8 text-xs" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} /></div><Select value={catFilter} onValueChange={setCatFilter}><SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map(c => <SelectItem key={c.category_id} value={String(c.category_id)}>{c.name}</SelectItem>)}</SelectContent></Select><span className="text-xs text-muted-foreground">{filtered.length} items</span><Button size="sm" className="ml-auto gap-1.5" onClick={onAdd}><Plus className="w-4 h-4" />Add item</Button></div>
      <div className="rounded-xl border overflow-hidden"><Table><TableHeader><TableRow><TableHead>PLU</TableHead><TableHead>Description</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Cost/unit</TableHead><TableHead className="w-16" /></TableRow></TableHeader><TableBody>{filtered.length === 0 ? (<TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No items found.</TableCell></TableRow>) : filtered.map(item => (<TableRow key={item.item_id} className={!item.is_active ? 'opacity-40' : ''}><TableCell className="text-xs text-muted-foreground">{item.plu ?? '—'}</TableCell><TableCell className="text-sm font-medium max-w-[220px] truncate">{item.description}</TableCell><TableCell className="text-xs text-muted-foreground">{item.category?.name ?? '—'}</TableCell><TableCell className="text-xs text-muted-foreground">{item.unit_size ?? '—'}</TableCell><TableCell className="text-xs text-right tabular-nums">{ZAR(item.cost_per_unit)}</TableCell><TableCell><div className="flex items-center gap-1 justify-end"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="w-3.5 h-3.5" /></Button></div></TableCell></TableRow>))}</TableBody></Table></div>
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete item?</AlertDialogTitle><AlertDialogDescription>This permanently deletes <strong>{deleteTarget?.description}</strong> and all its stock counts.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { if (deleteTarget) { onDelete(deleteTarget.item_id); setDeleteTarget(null) } }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  )
}

// ─── Month Selector ───────────────────────────────────────────────────────────

function MonthSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const months = getLastNMonths(24)
  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── Main StockTab ────────────────────────────────────────────────────────────

export function StockTab() {
  const supabase = createClient()

  // Fallback to last day of current month — will be overridden once we find real data
  const now = new Date()
  const currentMonthEnd = lastDayOfMonth(now.getFullYear(), now.getMonth() + 1)

  // ── Retail state ──
  const [retailCategories, setRetailCategories] = useState<StockCategory[]>([])
  const [retailItems,      setRetailItems]      = useState<RetailItem[]>([])
  const [retailCounts,     setRetailCounts]     = useState<RetailCount[]>([])
  const [retailMonth,      setRetailMonth]      = useState(currentMonthEnd)

  const [showRetailCount,   setShowRetailCount]   = useState(false)
  const [showRetailUpload,  setShowRetailUpload]  = useState(false)
  const [showRetailItem,    setShowRetailItem]    = useState(false)
  const [editRetailItem,    setEditRetailItem]    = useState<RetailItem | null>(null)

  // ── Food state ──
  const [foodCategories, setFoodCategories] = useState<StockCategory[]>([])
  const [foodItems,      setFoodItems]      = useState<FoodItem[]>([])
  const [foodCounts,     setFoodCounts]     = useState<FoodCount[]>([])
  const [foodMonth,      setFoodMonth]      = useState(currentMonthEnd)

  const [showFoodCount,   setShowFoodCount]   = useState(false)
  const [showFoodUpload,  setShowFoodUpload]  = useState(false)
  const [showFoodItem,    setShowFoodItem]    = useState(false)
  const [editFoodItem,    setEditFoodItem]    = useState<FoodItem | null>(null)

  const [loading, setLoading] = useState(true)

  // ── Fetch ──
  const fetchRetail = useCallback(async () => {
    const [cats, items] = await Promise.all([
      supabase.from('vb_retail_stock_category').select('*').order('sort_order'),
      supabase.from('vb_retail_stock_item').select('*, category:vb_retail_stock_category(name)').order('description'),
    ])
    setRetailCategories((cats.data as StockCategory[]) ?? [])
    setRetailItems((items.data as RetailItem[]) ?? [])
  }, [])

  const fetchRetailCounts = useCallback(async (date: string) => {
    const { data } = await supabase.from('vb_retail_stock_count_enriched').select('*').eq('count_date', date)
    setRetailCounts((data as RetailCount[]) ?? [])
  }, [])

  const fetchFood = useCallback(async () => {
    const [cats, items] = await Promise.all([
      supabase.from('vb_food_stock_category').select('*').order('sort_order'),
      supabase.from('vb_food_stock_item').select('*, category:vb_food_stock_category(name)').order('description'),
    ])
    setFoodCategories((cats.data as StockCategory[]) ?? [])
    setFoodItems((items.data as FoodItem[]) ?? [])
  }, [])

  const fetchFoodCounts = useCallback(async (date: string) => {
    const { data } = await supabase.from('vb_food_stock_count_enriched').select('*').eq('count_date', date)
    setFoodCounts((data as FoodCount[]) ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchRetail(),
      fetchFood(),
      supabase.from('vb_retail_stock_count').select('count_date').order('count_date', { ascending: false }).limit(1).single(),
      supabase.from('vb_food_stock_count').select('count_date').order('count_date', { ascending: false }).limit(1).single(),
    ]).then(([, , retailLatest, foodLatest]) => {
      if (retailLatest.data?.count_date) setRetailMonth(retailLatest.data.count_date)
      if (foodLatest.data?.count_date)   setFoodMonth(foodLatest.data.count_date)
      setLoading(false)
    })
  }, [])

  useEffect(() => { fetchRetailCounts(retailMonth) }, [retailMonth])
  useEffect(() => { fetchFoodCounts(foodMonth) }, [foodMonth])

  // ── Actions ──
  async function saveRetailCount(rows: any[]) {
    await supabase.from('vb_retail_stock_count').upsert(rows, { onConflict: 'item_id,count_date' })
    await fetchRetailCounts(retailMonth)
  }
  async function saveRetailItem(data: Partial<RetailItem>, id?: number) {
    if (id) await supabase.from('vb_retail_stock_item').update(data).eq('item_id', id)
    else    await supabase.from('vb_retail_stock_item').insert([data])
    await fetchRetail()
  }
  async function deleteRetailItem(id: number) {
    await supabase.from('vb_retail_stock_item').delete().eq('item_id', id)
    await fetchRetail()
  }
  async function saveFoodCount(rows: any[]) {
    await supabase.from('vb_food_stock_count').upsert(rows, { onConflict: 'item_id,count_date' })
    await fetchFoodCounts(foodMonth)
  }
  async function saveFoodItem(data: Partial<FoodItem>, id?: number) {
    if (id) await supabase.from('vb_food_stock_item').update(data).eq('item_id', id)
    else    await supabase.from('vb_food_stock_item').insert([data])
    await fetchFood()
  }
  async function deleteFoodItem(id: number) {
    await supabase.from('vb_food_stock_item').delete().eq('item_id', id)
    await fetchFood()
  }

  if (loading) return (
    <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin" /><p className="text-sm">Loading stock…</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <Tabs defaultValue="retail-dashboard">
        <TabsList className="h-9 rounded-xl bg-muted p-1 flex-wrap">
          <TabsTrigger value="retail-dashboard" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <BarChart3 className="w-3.5 h-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="retail" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Package className="w-3.5 h-3.5" /> Retail Counts
          </TabsTrigger>
          <TabsTrigger value="food" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <ShoppingBasket className="w-3.5 h-3.5" /> Food / Kitchen
          </TabsTrigger>
          <TabsTrigger value="retail-items" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Pencil className="w-3.5 h-3.5" /> Manage Retail
          </TabsTrigger>
          <TabsTrigger value="food-items" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Pencil className="w-3.5 h-3.5" /> Manage Food
          </TabsTrigger>
        </TabsList>

        {/* ── RETAIL DASHBOARD ── */}
        <TabsContent value="retail-dashboard" className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold">Retail Stock Overview</h2>
              <p className="text-xs text-muted-foreground">{fmtMonth(retailMonth)} month-end count</p>
            </div>
            <MonthSelector value={retailMonth} onChange={setRetailMonth} />
          </div>
          <RetailDashboard counts={retailCounts} month={retailMonth} />
        </TabsContent>

        {/* ── RETAIL COUNTS ── */}
        <TabsContent value="retail" className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <MonthSelector value={retailMonth} onChange={setRetailMonth} />
            <div className="flex items-center gap-2 ml-auto">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowRetailUpload(true)}>
                <FileSpreadsheet className="w-4 h-4" />Upload Excel
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setShowRetailCount(true)}>
                <RefreshCw className="w-4 h-4" />{retailCounts.length > 0 ? 'Update count' : 'Enter count'}
              </Button>
            </div>
          </div>
          <RetailCountResultsView counts={retailCounts} onNewCount={() => setShowRetailCount(true)} />
        </TabsContent>

        {/* ── FOOD COUNTS ── */}
        <TabsContent value="food" className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <MonthSelector value={foodMonth} onChange={setFoodMonth} />
            <div className="flex items-center gap-2 ml-auto">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowFoodUpload(true)}>
                <FileSpreadsheet className="w-4 h-4" />Upload Excel
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setShowFoodCount(true)}>
                <RefreshCw className="w-4 h-4" />{foodCounts.length > 0 ? 'Update count' : 'Enter count'}
              </Button>
            </div>
          </div>
          <FoodCountResultsView counts={foodCounts} onNewCount={() => setShowFoodCount(true)} />
        </TabsContent>

        {/* ── MANAGE RETAIL ITEMS ── */}
        <TabsContent value="retail-items" className="mt-5">
          <RetailItemsPanel items={retailItems} categories={retailCategories}
            onAdd={() => { setEditRetailItem(null); setShowRetailItem(true) }}
            onEdit={(i) => { setEditRetailItem(i); setShowRetailItem(true) }}
            onDelete={deleteRetailItem} />
        </TabsContent>

        {/* ── MANAGE FOOD ITEMS ── */}
        <TabsContent value="food-items" className="mt-5">
          <FoodItemsPanel items={foodItems} categories={foodCategories}
            onAdd={() => { setEditFoodItem(null); setShowFoodItem(true) }}
            onEdit={(i) => { setEditFoodItem(i); setShowFoodItem(true) }}
            onDelete={deleteFoodItem} />
        </TabsContent>
      </Tabs>

      {/* ── Modals ── */}
      <RetailCountModal open={showRetailCount} onClose={() => setShowRetailCount(false)}
        items={retailItems.filter(i => i.is_active)} existingCounts={retailCounts}
        countDate={retailMonth} onSave={saveRetailCount} />

      <FoodCountModal open={showFoodCount} onClose={() => setShowFoodCount(false)}
        items={foodItems.filter(i => i.is_active)} existingCounts={foodCounts}
        countDate={foodMonth} onSave={saveFoodCount} />

      <ExcelUploadModal open={showRetailUpload} onClose={() => setShowRetailUpload(false)}
        items={retailItems} onSave={saveRetailCount} countDate={retailMonth} mode="retail" />

      <ExcelUploadModal open={showFoodUpload} onClose={() => setShowFoodUpload(false)}
        items={foodItems} onSave={saveFoodCount} countDate={foodMonth} mode="food" />

      <RetailItemModal open={showRetailItem} onClose={() => setShowRetailItem(false)}
        categories={retailCategories} initial={editRetailItem} onSave={saveRetailItem} />

      <FoodItemModal open={showFoodItem} onClose={() => setShowFoodItem(false)}
        categories={foodCategories} initial={editFoodItem} onSave={saveFoodItem} />
    </div>
  )
}