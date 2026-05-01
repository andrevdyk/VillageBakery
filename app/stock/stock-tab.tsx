'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Check, AlertCircle, Loader2, ChevronDown, ChevronRight,
  Pencil, Trash2, Package, ShoppingBasket, Search, Upload,
  TrendingUp, RefreshCw, BarChart3, AlertTriangle,
  FileSpreadsheet, Calendar, ArrowUpRight, ArrowDownRight, Minus,
  ArrowUp, ArrowDown, ChevronsUpDown, Download,
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
  item_id: number; category_id: number; plu: string | null; description: string
  supplier_label: string | null; cost_price: number | null; qty_per_case: number | null
  cost_per_item: number | null; sell_price: number | null; is_active: boolean
  notes: string | null; category?: { name: string }
}

interface RetailCount {
  count_id: number; item_id: number; count_date: string
  opening_stock: number; new_received: number; closing_stock: number
  items_sold: number | null; revenue: number | null; notes: string | null
  description?: string; cost_per_item?: number; sell_price?: number
  plu?: string | null; supplier_label?: string | null; category_name?: string
  variance?: number; op_stock_value?: number; cl_stock_value?: number
  markup_pct?: number; profit_per_item?: number
}

interface FoodItem {
  item_id: number; category_id: number; plu: string | null; description: string
  unit_size: string | null; cost_price: number | null; qty_per_pack: number | null
  cost_per_unit: number | null; sell_price: number | null; is_active: boolean
  notes: string | null; category?: { name: string }
}

interface FoodCount {
  count_id: number; item_id: number; count_date: string
  opening_stock: number; new_received: number; closing_stock: number
  notes: string | null; description?: string; cost_per_unit?: number
  unit_size?: string | null; plu?: string | null; category_name?: string
  variance?: number; op_stock_value?: number; cl_stock_value?: number
}

interface MonthOption { label: string; value: string }
type SortDir = 'asc' | 'desc'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ZAR = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n)

const fmtDate  = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
const fmtMonth = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).toISOString().split('T')[0]
}

function getLastNMonths(n = 24): MonthOption[] {
  const opts: MonthOption[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d    = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const last = lastDayOfMonth(d.getFullYear(), d.getMonth() + 1)
    opts.push({ label: d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' }), value: last })
  }
  return opts
}

function varianceBadge(v: number | undefined) {
  if (v == null) return null
  if (v > 0) return <Badge className="text-xs bg-red-50 text-red-600 border border-red-200">+{v.toFixed(2)}</Badge>
  if (v < 0) return <Badge className="text-xs bg-blue-50 text-blue-600 border border-blue-200">{v.toFixed(2)}</Badge>
  return <Badge variant="secondary" className="text-xs">0</Badge>
}

// ─── Sort hook ────────────────────────────────────────────────────────────────

function useSort<T>(data: T[], defaultKey: keyof T, defaultDir: SortDir = 'desc') {
  const [key, setKey]   = useState<keyof T>(defaultKey)
  const [dir, setDir]   = useState<SortDir>(defaultDir)

  const toggle = (k: keyof T) => {
    if (k === key) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setKey(k); setDir('desc') }
  }

  const sorted = useMemo(() => [...data].sort((a, b) => {
    const av = a[key] as any
    const bv = b[key] as any
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
    return dir === 'asc' ? cmp : -cmp
  }), [data, key, dir])

  return { sorted, key, dir, toggle }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 ml-0.5 opacity-30" />
  return dir === 'asc'
    ? <ArrowUp   className="w-3 h-3 ml-0.5 text-foreground" />
    : <ArrowDown className="w-3 h-3 ml-0.5 text-foreground" />
}

function SortTh({ label, sortKey, currentKey, dir, onSort, className }: {
  label: string; sortKey: string; currentKey: string; dir: SortDir
  onSort: (k: any) => void; className?: string
}) {
  const active = sortKey === currentKey
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/60 transition-colors ${className ?? ''}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-0.5 justify-end">
        <span>{label}</span>
        <SortIcon active={active} dir={dir} />
      </div>
    </TableHead>
  )
}

function SortThLeft({ label, sortKey, currentKey, dir, onSort, className }: {
  label: string; sortKey: string; currentKey: string; dir: SortDir
  onSort: (k: any) => void; className?: string
}) {
  const active = sortKey === currentKey
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/60 transition-colors ${className ?? ''}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-0.5">
        <span>{label}</span>
        <SortIcon active={active} dir={dir} />
      </div>
    </TableHead>
  )
}

// ─── Excel template download ──────────────────────────────────────────────────

function downloadTemplate(mode: 'retail' | 'food') {
  const wb = XLSX.utils.book_new()
  if (mode === 'retail') {
    const headers = ['PLU', 'ITEM', 'COST', 'QUANTITY CASE', 'COST PER ITEM', 'NEW STOCK RECEIVED', 'O/STOCK', 'C/STOCK', 'Items Sold', 'Revenue']
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ['', 'COLD DRINKS', '', '', '', '', '', '', '', ''],
      [2, 'ICED TEA LIPTON LEMON', '', '', 9.08, 0, 20, 15, '', ''],
      [9, 'COKE ORIGINAL 440ML', 264.99, 24, 11.04, 0, 0, 13, 16, 240],
    ])
    ws['!cols'] = headers.map((_, i) => ({ wch: i === 1 ? 40 : 16 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Retail')
  } else {
    const headers = ['PLU', 'ITEM', 'COST PRICE', 'QTY PER BOX', 'COST PER ITEM', 'NEW STOCK RECEIVED', 'OPENING STOCK', 'c/stock']
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ['', 'PACKAGING', '', '', '', '', '', ''],
      ['', 'APRONS THICK, PLASTIC', 175, 100, 1.75, 0, 0, 0],
      ['', 'BB1/BB2 BREAD BAGS BALE 500', 469.9, 1000, 0.47, 0, 250, 250],
    ])
    ws['!cols'] = headers.map((_, i) => ({ wch: i === 1 ? 40 : 16 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Kitchen')
  }
  XLSX.writeFile(wb, mode === 'retail' ? 'retail_stock_template.xlsx' : 'kitchen_stock_template.xlsx')
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, trend, trendLabel, icon: Icon, accent }: {
  label: string; value: string; trend?: 'up' | 'down' | 'flat'; trendLabel?: string
  icon?: React.ElementType; accent?: string
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
        {Icon && <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent ?? 'bg-muted'}`}><Icon className="w-4 h-4" /></div>}
      </div>
      <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {trendLabel && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {trend === 'up'   && <ArrowUpRight   className="w-3.5 h-3.5 text-red-500" />}
          {trend === 'down' && <ArrowDownRight className="w-3.5 h-3.5 text-emerald-500" />}
          {trend === 'flat' && <Minus          className="w-3.5 h-3.5" />}
          <span>{trendLabel}</span>
        </div>
      )}
    </div>
  )
}

// ─── Low Stock Panel ──────────────────────────────────────────────────────────

// ─── Load Chart.js once ──────────────────────────────────────────────────────

function useChartJs() {
  useEffect(() => {
    if ((window as any).Chart) return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
    s.async = true
    document.head.appendChild(s)
  }, [])
}

function LowStockPanel({ counts }: { counts: RetailCount[] }) {
  const lowItems = useMemo(() =>
    counts
      .filter(c => c.opening_stock > 0 && c.closing_stock / c.opening_stock < 0.25)
      .sort((a, b) => (a.closing_stock / a.opening_stock) - (b.closing_stock / b.opening_stock))
  , [counts])

  if (!lowItems.length) return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3 text-muted-foreground">
      <Check className="w-5 h-5 text-emerald-500 shrink-0" />
      <p className="text-xs">No items below 25% of opening stock</p>
    </div>
  )

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b flex items-center gap-2 bg-amber-50">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-amber-700">{lowItems.length} items running low</span>
        <span className="text-[10px] text-amber-600 ml-auto">closing &lt; 25% of opening</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs py-2">Item</TableHead>
              <TableHead className="text-right text-xs py-2 w-16">Open</TableHead>
              <TableHead className="text-right text-xs py-2 w-16">Close</TableHead>
              <TableHead className="text-right text-xs py-2 w-16">% Left</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lowItems.map(c => {
              const pct   = c.opening_stock > 0 ? (c.closing_stock / c.opening_stock * 100) : 0
              const color = pct === 0 ? 'text-red-600 bg-red-50 border-red-200' : pct < 10 ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-amber-600 bg-amber-50 border-amber-200'
              return (
                <TableRow key={c.count_id}>
                  <TableCell className="text-xs font-medium max-w-[180px] truncate py-1.5">{c.description}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums py-1.5">{c.opening_stock}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-semibold py-1.5">{c.closing_stock}</TableCell>
                  <TableCell className="text-right py-1.5"><Badge className={`text-[10px] border ${color}`}>{pct.toFixed(0)}%</Badge></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ─── Retail Dashboard Insights ────────────────────────────────────────────────

function RetailDashboard({ counts }: { counts: RetailCount[] }) {
  useChartJs()
  const totals = useMemo(() => {
    const opValue  = counts.reduce((s, c) => s + (c.op_stock_value ?? 0), 0)
    const clValue  = counts.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0)
    const revenue  = counts.reduce((s, c) => s + (c.revenue ?? 0), 0)
    const tracked  = counts.filter(c => c.opening_stock > 0 || c.closing_stock > 0).length
    const lowCount = counts.filter(c => c.opening_stock > 0 && c.closing_stock / c.opening_stock < 0.25).length
    const change   = opValue > 0 ? ((clValue - opValue) / opValue * 100) : 0
    return { opValue, clValue, revenue, tracked, lowCount, change }
  }, [counts])

  // ── Category aggregates ──
  const categoryStats = useMemo(() => {
    const map = new Map<string, { opVal: number; clVal: number; revenue: number; items: number; sold: number }>()
    for (const c of counts) {
      const k = c.category_name ?? 'Uncategorised'
      const e = map.get(k) ?? { opVal: 0, clVal: 0, revenue: 0, items: 0, sold: 0 }
      e.opVal   += c.op_stock_value ?? 0
      e.clVal   += c.cl_stock_value ?? 0
      e.revenue += c.revenue ?? 0
      e.sold    += c.items_sold ?? 0
      e.items++
      map.set(k, e)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        ...v,
        turnover: v.opVal > 0 ? ((v.opVal - v.clVal) / v.opVal * 100) : 0,
      }))
      .sort((a, b) => b.clVal - a.clVal)
  }, [counts])

  // ── Top 10 by revenue ──
  const top10Revenue = useMemo(() =>
    [...counts]
      .filter(c => (c.revenue ?? 0) > 0)
      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
      .slice(0, 10)
  , [counts])

  // ── Not selling (had opening stock, zero sales, zero variance reduction) ──
  const notSelling = useMemo(() =>
    counts
      .filter(c => c.opening_stock > 0 && (c.items_sold ?? 0) === 0 && c.closing_stock >= c.opening_stock)
      .sort((a, b) => (b.op_stock_value ?? 0) - (a.op_stock_value ?? 0))
      .slice(0, 15)
  , [counts])

  // ── Worst performers: had opening stock, closing >= opening (not moving) OR very high variance ──
  const worstPerformers = useMemo(() =>
    [...counts]
      .filter(c => c.opening_stock > 0 && (c.revenue ?? 0) > 0)
      .map(c => ({
        ...c,
        revenuePerUnit: c.items_sold && c.items_sold > 0 ? (c.revenue ?? 0) / c.items_sold : 0,
        sellThrough: c.opening_stock > 0 ? ((c.items_sold ?? 0) / c.opening_stock * 100) : 0,
      }))
      .sort((a, b) => a.sellThrough - b.sellThrough)
      .slice(0, 10)
  , [counts])

  // ── Low markup items (<30%) ──
  const lowMarkup = useMemo(() =>
    counts
      .filter(c => c.markup_pct != null && c.markup_pct < 30 && c.markup_pct > 0)
      .sort((a, b) => (a.markup_pct ?? 0) - (b.markup_pct ?? 0))
      .slice(0, 20)
  , [counts])

  // ── Best category by revenue ──
  const bestRevCat    = [...categoryStats].sort((a, b) => b.revenue  - a.revenue)[0]
  const bestTurnCat   = [...categoryStats].sort((a, b) => b.turnover - a.turnover)[0]

  if (!counts.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <BarChart3 className="w-10 h-10 opacity-20" />
      <p className="text-sm">No stock count data for this month.</p>
      <p className="text-xs">Upload a monthly Excel file or enter counts manually.</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Opening Stock Value" value={ZAR(totals.opValue)} icon={Package} accent="bg-blue-50 text-blue-600" />
        <StatCard label="Closing Stock Value" value={ZAR(totals.clValue)}
          trend={totals.change < 0 ? 'down' : totals.change > 0 ? 'up' : 'flat'}
          trendLabel={`${totals.change > 0 ? '+' : ''}${totals.change.toFixed(1)}% vs opening`}
          icon={Package} accent="bg-emerald-50 text-emerald-600" />
        <StatCard label="Total Revenue" value={ZAR(totals.revenue)} icon={TrendingUp} accent="bg-purple-50 text-purple-600" />
        <StatCard label="Low Stock Items" value={String(totals.lowCount)}
          trendLabel={`of ${totals.tracked} tracked items`}
          icon={AlertTriangle} accent={totals.lowCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'} />
      </div>

      {/* ── Highlight cards row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {bestRevCat && (
          <div className="rounded-xl border bg-card p-4 flex gap-3 items-start">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Best selling category</p>
              <p className="text-sm font-semibold mt-0.5">{bestRevCat.name}</p>
              <p className="text-xs text-muted-foreground">{ZAR(bestRevCat.revenue)} revenue · {bestRevCat.sold} units sold</p>
            </div>
          </div>
        )}
        {bestTurnCat && (
          <div className="rounded-xl border bg-card p-4 flex gap-3 items-start">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <RefreshCw className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Best stock turnover</p>
              <p className="text-sm font-semibold mt-0.5">{bestTurnCat.name}</p>
              <p className="text-xs text-muted-foreground">{bestTurnCat.turnover.toFixed(1)}% of opening stock moved</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Charts row: pie + top 10 bar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashPieChart categoryStats={categoryStats} />
        <DashTop10Chart top10={top10Revenue} />
      </div>

      {/* ── Low stock + Not selling ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Low stock alerts</h3>
          <LowStockPanel counts={counts} />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Not selling ({notSelling.length})</h3>
          <NotSellingPanel items={notSelling} />
        </div>
      </div>

      {/* ── Worst performers + Low markup ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Worst sell-through</h3>
          <WorstPerformersPanel items={worstPerformers} />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Low markup (&lt;30%) — {lowMarkup.length} items</h3>
          <LowMarkupPanel items={lowMarkup} />
        </div>
      </div>

      {/* ── Category turnover table ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Category performance</h3>
        <CategoryPerfTable stats={categoryStats} />
      </div>

    </div>
  )
}

// ── Pie chart component ────────────────────────────────────────────────────────
const BRAND = {
  coffee:     '#5C3D2E',
  caramel:    '#C4874A',
  wheat:      '#D4A96A',
  sage:       '#7A9E7E',
  terracotta: '#C0614A',
}

const PIE_COLORS = [
  BRAND.caramel, BRAND.coffee, BRAND.terracotta, BRAND.sage,
  BRAND.wheat, '#8B5E3C', '#A8C5A0', '#E8B87A', '#6B8E6B', '#D4956A',
  '#4A2E1E', '#F0C896',
]

function DashPieChart({ categoryStats }: { categoryStats: { name: string; clVal: number }[] }) {
  const id = 'pie-chart-' + Math.random().toString(36).slice(2,7)
  const data = categoryStats.filter(c => c.clVal > 0)
  const total = data.reduce((s, c) => s + c.clVal, 0)

  useEffect(() => {
    if (!data.length) return
    const canvas = document.getElementById(id) as HTMLCanvasElement | null
    if (!canvas || !(window as any).Chart) return
    const chart = new (window as any).Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.name),
        datasets: [{
          data: data.map(d => d.clVal),
          backgroundColor: data.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: (ctx: any) => ` ${ctx.label}: R ${ctx.parsed.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${(ctx.parsed / total * 100).toFixed(1)}%)` }
        } },
        cutout: '60%',
      }
    })
    return () => chart.destroy()
  }, [data.map(d => d.name + d.clVal).join()])

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Closing stock by category</p>
      <div style={{ position: 'relative', height: '200px' }}>
        <canvas id={id} role="img" aria-label={`Doughnut chart of closing stock value by category. Total ${ZAR(total)}.`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            {d.name} · {(d.clVal / total * 100).toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Top 10 bar chart ──────────────────────────────────────────────────────────

function DashTop10Chart({ top10 }: { top10: RetailCount[] }) {
  const id = 'top10-chart-' + Math.random().toString(36).slice(2,7)

  useEffect(() => {
    if (!top10.length) return
    const canvas = document.getElementById(id) as HTMLCanvasElement | null
    if (!canvas || !(window as any).Chart) return
    const chart = new (window as any).Chart(canvas, {
      type: 'bar',
      data: {
        labels: top10.map(c => c.description && c.description.length > 22 ? c.description.slice(0,20) + '…' : c.description),
        datasets: [{
          label: 'Revenue',
          data: top10.map(c => c.revenue ?? 0),
          backgroundColor: BRAND.caramel,
          borderRadius: 4,
          borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y' as const,
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: (ctx: any) => ` R ${ctx.parsed.x.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
        }},
        scales: {
          x: { ticks: { callback: (v: any) => `R ${(v/1000).toFixed(0)}k`, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
          y: { ticks: { font: { size: 10 } }, grid: { display: false } }
        }
      }
    })
    return () => chart.destroy()
  }, [top10.map(c => c.count_id).join()])

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Top 10 products by revenue</p>
      <div style={{ position: 'relative', height: `${top10.length * 36 + 40}px` }}>
        <canvas id={id} role="img" aria-label={`Horizontal bar chart of top 10 retail products by revenue.`} />
      </div>
    </div>
  )
}

// ── Not selling panel ─────────────────────────────────────────────────────────

function NotSellingPanel({ items }: { items: RetailCount[] }) {
  if (!items.length) return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3 text-muted-foreground">
      <Check className="w-5 h-5 text-emerald-500 shrink-0" />
      <p className="text-xs">All stocked items recorded sales this period</p>
    </div>
  )
  return (
    <div className="rounded-xl border bg-card overflow-hidden max-h-64 overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-muted z-10">
          <TableRow>
            <TableHead className="text-xs py-2">Item</TableHead>
            <TableHead className="text-right text-xs py-2">Opening</TableHead>
            <TableHead className="text-right text-xs py-2">Op. Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(c => (
            <TableRow key={c.count_id}>
              <TableCell className="text-xs font-medium max-w-[180px] truncate py-1.5">{c.description}</TableCell>
              <TableCell className="text-xs text-right tabular-nums py-1.5">{c.opening_stock}</TableCell>
              <TableCell className="text-xs text-right tabular-nums py-1.5 text-muted-foreground">{ZAR(c.op_stock_value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Worst performers panel ────────────────────────────────────────────────────

function WorstPerformersPanel({ items }: { items: (RetailCount & { sellThrough: number })[] }) {
  if (!items.length) return <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">No sales data to analyse.</div>
  return (
    <div className="rounded-xl border bg-card overflow-hidden max-h-64 overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-muted z-10">
          <TableRow>
            <TableHead className="text-xs py-2">Item</TableHead>
            <TableHead className="text-right text-xs py-2">Sold</TableHead>
            <TableHead className="text-right text-xs py-2">Open</TableHead>
            <TableHead className="text-right text-xs py-2">Sell-through</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(c => (
            <TableRow key={c.count_id}>
              <TableCell className="text-xs font-medium max-w-[160px] truncate py-1.5">{c.description}</TableCell>
              <TableCell className="text-xs text-right tabular-nums py-1.5">{c.items_sold ?? 0}</TableCell>
              <TableCell className="text-xs text-right tabular-nums py-1.5">{c.opening_stock}</TableCell>
              <TableCell className="text-right py-1.5">
                <Badge className={`text-[10px] border ${c.sellThrough < 10 ? 'text-red-600 bg-red-50 border-red-200' : 'text-amber-600 bg-amber-50 border-amber-200'}`}>
                  {c.sellThrough.toFixed(0)}%
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Low markup panel ──────────────────────────────────────────────────────────

function LowMarkupPanel({ items }: { items: RetailCount[] }) {
  if (!items.length) return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3 text-muted-foreground">
      <Check className="w-5 h-5 text-emerald-500 shrink-0" />
      <p className="text-xs">All items have markup ≥ 30%</p>
    </div>
  )
  return (
    <div className="rounded-xl border bg-card overflow-hidden max-h-64 overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-muted z-10">
          <TableRow>
            <TableHead className="text-xs py-2">Item</TableHead>
            <TableHead className="text-right text-xs py-2">Cost</TableHead>
            <TableHead className="text-right text-xs py-2">Sell</TableHead>
            <TableHead className="text-right text-xs py-2">Markup</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(c => (
            <TableRow key={c.count_id}>
              <TableCell className="text-xs font-medium max-w-[160px] truncate py-1.5">{c.description}</TableCell>
              <TableCell className="text-xs text-right tabular-nums py-1.5 text-muted-foreground">{ZAR(c.cost_per_item)}</TableCell>
              <TableCell className="text-xs text-right tabular-nums py-1.5">{ZAR(c.sell_price)}</TableCell>
              <TableCell className="text-right py-1.5">
                <Badge className={`text-[10px] border ${(c.markup_pct ?? 0) < 15 ? 'text-red-600 bg-red-50 border-red-200' : 'text-orange-600 bg-orange-50 border-orange-200'}`}>
                  {(c.markup_pct ?? 0).toFixed(1)}%
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Category performance table ────────────────────────────────────────────────

function CategoryPerfTable({ stats }: { stats: { name: string; opVal: number; clVal: number; revenue: number; sold: number; turnover: number }[] }) {
  const { sorted, key, dir, toggle } = useSort(stats, 'revenue' as any, 'desc')
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortThLeft label="Category"     sortKey="name"     currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortTh     label="Op. Value"    sortKey="opVal"    currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortTh     label="Cl. Value"    sortKey="clVal"    currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortTh     label="Revenue"      sortKey="revenue"  currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortTh     label="Units Sold"   sortKey="sold"     currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortTh     label="Turnover %"   sortKey="turnover" currentKey={String(key)} dir={dir} onSort={toggle} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(s => (
              <TableRow key={s.name}>
                <TableCell className="text-xs font-medium">{s.name}</TableCell>
                <TableCell className="text-xs text-right tabular-nums text-muted-foreground">{ZAR(s.opVal)}</TableCell>
                <TableCell className="text-xs text-right tabular-nums">{ZAR(s.clVal)}</TableCell>
                <TableCell className="text-xs text-right tabular-nums font-medium">{ZAR(s.revenue)}</TableCell>
                <TableCell className="text-xs text-right tabular-nums">{s.sold > 0 ? s.sold.toFixed(0) : '—'}</TableCell>
                <TableCell className="text-right">
                  {s.turnover > 0
                    ? <Badge className={`text-[10px] border ${s.turnover > 50 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : s.turnover > 20 ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-muted-foreground bg-muted border-border'}`}>{s.turnover.toFixed(1)}%</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>
                  }
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ─── Excel Upload Modal ───────────────────────────────────────────────────────

function colLetter(idx: number): string {
  let s = ''; let n = idx + 1
  while (n > 0) { s = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + s; n = Math.floor((n - 1) / 26) }
  return s
}

type UnmatchedRow = {
  description: string; opening_stock: number; new_received: number
  closing_stock: number; items_sold: number | null; revenue: number | null
  category_id: number | null; include: boolean; rawRowIdx: number
}

function ExcelUploadModal({ open, onClose, items, onSave, countDate, mode, categories }: {
  open: boolean; onClose: () => void; items: (RetailItem | FoodItem)[]
  onSave: (rows: any[], date: string) => Promise<void>; countDate: string
  mode: 'retail' | 'food'; categories: StockCategory[]
}) {
  const [file, setFile]                 = useState<File | null>(null)
  const [rows, setRows]                 = useState<any[]>([])
  const [rawData, setRawData]           = useState<any[][]>([])
  const [headerRowIdx, setHeaderRowIdx] = useState(-1)
  const [error, setError]               = useState('')
  const [saving, setSaving]             = useState(false)
  const [unmatchedRows, setUnmatchedRows] = useState<UnmatchedRow[]>([])
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [catList, setCatList]           = useState<StockCategory[]>([])
  const [newCatName, setNewCatName]     = useState('')
  const [addingCat, setAddingCat]       = useState(false)
  const [savingCat, setSavingCat]       = useState(false)
  const [selectedDate, setSelectedDate]     = useState(countDate)
  const [showRaw, setShowRaw]               = useState(false)
  const [highlightedRawRow, setHighlightedRawRow] = useState<number | null>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const rawPanelRef = useRef<HTMLDivElement>(null)
  const monthOptions = useMemo(() => getLastNMonths(24), [])

  useEffect(() => {
    if (!open) {
      setFile(null); setRows([]); setRawData([]); setHeaderRowIdx(-1); setError('')
      setUnmatchedRows([]); setShowUnmatched(false); setShowRaw(false)
      setHighlightedRawRow(null); setAddingCat(false); setNewCatName('')
    } else {
      setSelectedDate(countDate); setCatList(categories)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDateChange(newDate: string) {
    setSelectedDate(newDate)
    setRows(r => r.map(row => ({ ...row, count_date: newDate })))
  }

  const idToCategory = useMemo(() => {
    const m = new Map<number, string>()
    for (const item of items) m.set(item.item_id, (item as any).category?.name ?? 'Uncategorised')
    return m
  }, [items])

  const priceMap = useMemo(() => {
    const m = new Map<number, { sell_price: number | null; cost_price: number | null; unit_cost: number | null }>()
    for (const item of items) m.set(item.item_id, {
      sell_price: (item as any).sell_price ?? null,
      cost_price: (item as any).cost_price ?? null,
      unit_cost:  (item as any).cost_per_item ?? (item as any).cost_per_unit ?? null,
    })
    return m
  }, [items])

  const categoryStats = useMemo(() => {
    const map = new Map<string, { opening: number; closing: number; received: number; revenue: number; opValue: number; clValue: number }>()
    for (const row of rows) {
      const cat   = idToCategory.get(row.item_id) ?? 'Uncategorised'
      const price = priceMap.get(row.item_id)?.unit_cost ?? 0
      const e = map.get(cat) ?? { opening: 0, closing: 0, received: 0, revenue: 0, opValue: 0, clValue: 0 }
      e.opening  += row.opening_stock ?? 0
      e.closing  += row.closing_stock ?? 0
      e.received += row.new_received  ?? 0
      e.revenue  += row.revenue       ?? 0
      e.opValue  += (row.opening_stock ?? 0) * price
      e.clValue  += (row.closing_stock  ?? 0) * price
      map.set(cat, e)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows, idToCategory, priceMap])

  const totals = useMemo(() => ({
    opening:  rows.reduce((s, r) => s + (r.opening_stock ?? 0), 0),
    closing:  rows.reduce((s, r) => s + (r.closing_stock  ?? 0), 0),
    received: rows.reduce((s, r) => s + (r.new_received   ?? 0), 0),
    revenue:  rows.reduce((s, r) => s + (r.revenue        ?? 0), 0),
  }), [rows])

  const valueStats = useMemo(() => {
    let opValue = 0, clValue = 0, revenue = 0
    for (const row of rows) {
      const price = priceMap.get(row.item_id)?.sell_price ?? 0
      opValue += (row.opening_stock ?? 0) * price
      clValue += (row.closing_stock  ?? 0) * price
      revenue += row.revenue ?? 0
    }
    return { opValue, clValue, revenue }
  }, [rows, priceMap])

  useEffect(() => {
    if (highlightedRawRow === null) return
    setShowRaw(true)
  }, [highlightedRawRow])

  useEffect(() => {
    if (highlightedRawRow === null || !showRaw || !rawPanelRef.current) return
    const el = rawPanelRef.current.querySelector(`[data-raw-row="${highlightedRawRow}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedRawRow, showRaw])

  function handleFile(f: File) {
    setFile(f); setError(''); setRows([]); setRawData([]); setHeaderRowIdx(-1); setUnmatchedRows([])
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const sheetName = mode === 'retail'
          ? (wb.SheetNames.find(n => n.toLowerCase().includes('retail')) ?? wb.SheetNames[0])
          : (wb.SheetNames.find(n => n.toLowerCase().includes('kitchen') || n.toLowerCase().includes('food')) ?? wb.SheetNames[0])
        const ws   = wb.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
        setRawData(data)
        const headerIdx = data.findIndex(r => r.some(c => typeof c === 'string' && c.toUpperCase().includes('ITEM')))
        if (headerIdx < 0) return setError('Could not find header row with "ITEM" column')
        setHeaderRowIdx(headerIdx)

        const headers = (data[headerIdx] as string[]).map(h => String(h ?? '').toUpperCase().trim())
        const itemCol  = headers.findIndex(h => h === 'ITEM')
        const openCol  = headers.findIndex(h => h.includes('O/STOCK') || h.includes('OPENING'))
        const recvCol  = headers.findIndex(h => h.includes('NEW STOCK') || h.includes('RECEIVED'))
        const closeCol = headers.findIndex(h => h.includes('C/STOCK') || h.includes('CLOSING'))
        const soldCol  = headers.findIndex(h => h.includes('ITEMS SOLD'))
        const revCol   = headers.findIndex(h => h.includes('REVENUE'))

        if (itemCol < 0 || openCol < 0 || closeCol < 0)
          return setError(`Missing required columns. Found: ${headers.filter(Boolean).join(', ')}`)

        const descMap = new Map<string, number>()
        for (const item of items) descMap.set(item.description.trim().toUpperCase(), item.item_id)

        const catNames = new Set(catList.map(c => c.name.trim().toUpperCase()))

        const parsed: any[] = []
        const unmatched_: UnmatchedRow[] = []
        for (let i = headerIdx + 1; i < data.length; i++) {
          const row  = data[i]
          const desc = String(row[itemCol] ?? '').trim()
          if (!desc || desc.toLowerCase() === 'total') continue
          // skip rows that match a known category name
          if (catNames.has(desc.toUpperCase())) continue
          // skip rows that look like section headers: all-caps text AND every numeric column is zero
          const numericVals = [row[openCol], row[closeCol],
            recvCol >= 0 ? row[recvCol] : null,
            soldCol >= 0 ? row[soldCol] : null,
            revCol  >= 0 ? row[revCol]  : null,
          ].filter(v => v != null).map(v => parseFloat(v) || 0)
          const isAllZero = numericVals.every(v => v === 0)
          const isAllCaps = desc === desc.toUpperCase() && /^[A-Z\s&\/\-]+$/.test(desc)
          if (isAllCaps && isAllZero) continue
          const itemId = descMap.get(desc.toUpperCase())
          // In this Excel format the "Items Sold" column holds new stock received (purchases).
          // Read it first; fall back to "NEW STOCK RECEIVED" if Items Sold is absent.
          const rowPurchases = (soldCol >= 0 && row[soldCol] != null ? parseFloat(row[soldCol]) || 0 : null)
                            ?? (recvCol >= 0 ? parseFloat(row[recvCol]) || 0 : 0)
          if (!itemId) {
            if (desc.length > 2) unmatched_.push({
              description: desc,
              opening_stock: parseFloat(row[openCol]) || 0,
              new_received:  rowPurchases,
              closing_stock: parseFloat(row[closeCol]) || 0,
              items_sold: null,
              revenue:    revCol >= 0 && row[revCol] != null ? (parseFloat(row[revCol]) || null) : null,
              category_id: null, include: false, rawRowIdx: i,
            })
            continue
          }
          const os = parseFloat(row[openCol])  || 0
          const cs = parseFloat(row[closeCol]) || 0
          // Received: if closing > opening, stock grew — include the increase on top of purchases
          const nr   = (os - cs < 0) ? (cs - os + rowPurchases) : rowPurchases
          // Sold: if opening > closing, stock shrank — include the decrease on top of purchases
          const sold = (os - cs > 0) ? (os - cs + rowPurchases) : rowPurchases
          const sellP   = priceMap.get(itemId)?.sell_price ?? 0
          const revenue = sold * sellP
          const base: any = {
            item_id: itemId, count_date: selectedDate,
            opening_stock: os, new_received: nr, closing_stock: cs, notes: null,
            _description: desc, _rawRowIdx: i,
          }
          if (mode === 'retail') {
            base.items_sold = sold
            base.revenue    = revenue
          }
          parsed.push(base)
        }
        setRows(parsed); setUnmatchedRows(unmatched_)
        if (unmatched_.length > 0) setShowUnmatched(true)
      } catch (err: any) { setError('Failed to parse file: ' + err.message) }
    }
    reader.readAsArrayBuffer(f)
  }

  function updateRow(idx: number, field: string, value: string) {
    setRows(r => r.map((row, i) => i === idx ? { ...row, [field]: value === '' ? null : (parseFloat(value) || 0) } : row))
  }

  function removeRow(idx: number) {
    setRows(r => r.filter((_, i) => i !== idx))
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return
    setSavingCat(true)
    const supabase = createClient()
    const table = mode === 'retail' ? 'vb_retail_stock_category' : 'vb_food_stock_category'
    const { data } = await supabase
      .from(table)
      .insert([{ name: newCatName.trim(), sort_order: catList.length + 1 }])
      .select().single()
    if (data) setCatList(prev => [...prev, data as StockCategory])
    setNewCatName(''); setAddingCat(false); setSavingCat(false)
  }

  async function handleSave() {
    const toCreate = unmatchedRows.filter(u => u.include && u.category_id)
    if (!rows.length && !toCreate.length) return
    setSaving(true)
    const supabase = createClient()
    const clean = rows.map(({ _description, _rawRowIdx, ...rest }) => rest)
    for (const ur of toCreate) {
      const table = mode === 'retail' ? 'vb_retail_stock_item' : 'vb_food_stock_item'
      const { data } = await supabase
        .from(table)
        .insert([{ description: ur.description, category_id: ur.category_id, is_active: true }])
        .select('item_id').single()
      if (data?.item_id) clean.push({
        item_id: data.item_id, count_date: selectedDate,
        opening_stock: ur.opening_stock, new_received: ur.new_received,
        closing_stock: ur.closing_stock, notes: null,
        ...(mode === 'retail' ? { items_sold: ur.items_sold, revenue: ur.revenue } : {}),
      })
    }
    await onSave(clean, selectedDate)
    setSaving(false); onClose()
  }

  const maxCols    = useMemo(() => rawData.reduce((m, r) => Math.max(m, r.length), 0), [rawData])
  const includedNew = unmatchedRows.filter(u => u.include && u.category_id).length

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-screen !max-w-none  h-screen p-0 !rounded-none overflow-hidden flex flex-col top-0 left-0 !translate-x-0 !translate-y-0">

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-3 border-b shrink-0 flex items-center gap-3 pr-14">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <FileSpreadsheet className="w-4 h-4" />Upload Monthly Stock Count
          </DialogTitle>
          {file && (
            <Button variant={showRaw ? 'secondary' : 'outline'} size="sm"
              className="gap-1.5 text-xs ml-auto" onClick={() => setShowRaw(v => !v)}>
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {showRaw ? 'Hide original' : 'Show original Excel'}
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showRaw ? 'rotate-180' : ''}`} />
            </Button>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left panel — own scroll so content can grow past viewport */}
          <div className={`flex flex-col overflow-y-auto p-5 gap-4 ${showRaw ? 'w-[58%]' : 'flex-1'} border-r`}>

            {/* Month selector */}
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-3 space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />Which month is this count for?
              </Label>
              <Select value={selectedDate} onValueChange={handleDateChange}>
                <SelectTrigger className="bg-background"><SelectValue placeholder="Select month…" /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Double-check this before importing — the count will be saved against this month.</p>
            </div>

            {/* Template hint */}
            <div className="rounded-xl border bg-muted/30 p-3 flex items-center gap-3">
              <p className="text-xs font-medium flex-1">Needs columns: <strong>ITEM</strong>, <strong>{mode === 'retail' ? 'O/STOCK' : 'OPENING STOCK'}</strong>, <strong>{mode === 'retail' ? 'C/STOCK' : 'c/stock'}</strong></p>
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => downloadTemplate(mode)}>
                <Download className="w-3.5 h-3.5" />Template
              </Button>
            </div>

            {/* Drop zone */}
            <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-5 text-center space-y-2 hover:border-muted-foreground/40 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
              <Upload className="w-6 h-6 mx-auto text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium">{file ? file.name : 'Drop your Excel file here'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{file ? `Parsed for ${fmtMonth(selectedDate)}` : '.xlsx or .xls'}</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              {!file && <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>Browse file</Button>}
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {(rows.length > 0 || unmatchedRows.length > 0) && (
              <>
                {/* Match banner */}
                <div className="rounded-xl border bg-muted/30 p-3 flex items-center gap-3 flex-wrap">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-sm font-medium text-emerald-700">{rows.length} items matched</span>
                  {unmatchedRows.length > 0 && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />{unmatchedRows.length} not found in item list
                    </span>
                  )}
                </div>

                {/* ── Unmatched items section ── */}
                {unmatchedRows.length > 0 && (
                  <div className="rounded-xl border">
                    <button
                      className="w-full px-3 py-2 bg-amber-50 border-b flex items-center gap-2 text-left hover:bg-amber-100 transition-colors rounded-t-xl"
                      onClick={() => setShowUnmatched(v => !v)}>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs font-semibold text-amber-700">
                        {unmatchedRows.length} items not found — assign a category below to create &amp; import them
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 ml-auto text-amber-600 transition-transform ${showUnmatched ? 'rotate-180' : ''}`} />
                    </button>

                    {showUnmatched && (
                      <>
                        <div className="overflow-x-auto overflow-y-auto h-[50vh]">
                          <Table>
                            <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                              <TableRow>
                                <TableHead className="w-8 text-xs text-center sticky left-0 bg-muted/80 z-20">Inc.</TableHead>
                                <TableHead className="text-xs">Item description</TableHead>
                                <TableHead className="text-right text-xs w-20">Open Qty</TableHead>
                                <TableHead className="text-right text-xs w-20">Close Qty</TableHead>
                                <TableHead className="text-right text-xs w-24">Purchased</TableHead>
                                <TableHead className="text-right text-xs w-20">Sold</TableHead>
                                <TableHead className="text-right text-xs w-28">Revenue</TableHead>
                                <TableHead className="text-xs w-44">Assign category</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {unmatchedRows.map((ur, i) => (
                                <TableRow key={i}
                                  className={`cursor-pointer ${!ur.include ? 'opacity-50' : ''} ${highlightedRawRow === ur.rawRowIdx ? 'bg-yellow-50' : ''}`}
                                  onClick={() => setHighlightedRawRow(ur.rawRowIdx)}>
                                  <TableCell className="py-1 w-8 text-center sticky left-0 bg-background z-10">
                                    <Checkbox checked={ur.include}
                                      onCheckedChange={v => setUnmatchedRows(r => r.map((row, j) => j === i ? { ...row, include: !!v } : row))} />
                                  </TableCell>
                                  <TableCell className="text-xs font-medium py-1 max-w-[220px] truncate" title={ur.description}>{ur.description}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums py-1">{ur.opening_stock}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums py-1">{ur.closing_stock}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums py-1">{ur.new_received}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums py-1">{ur.items_sold ?? '—'}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums py-1">{ur.revenue != null ? ZAR(ur.revenue) : '—'}</TableCell>
                                  <TableCell className="py-1" onClick={e => e.stopPropagation()}>
                                    <Select
                                      value={ur.category_id?.toString() ?? ''}
                                      onValueChange={v => setUnmatchedRows(r => r.map((row, j) => j === i ? { ...row, category_id: parseInt(v), include: true } : row))}>
                                      <SelectTrigger className="h-7 text-xs w-44">
                                        <SelectValue placeholder="Select category…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {catList.map(c => (
                                          <SelectItem key={c.category_id} value={c.category_id.toString()}>{c.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* New category inline form */}
                        <div className="border-t px-3 py-2 flex items-center gap-2 bg-muted/20">
                          {addingCat ? (
                            <>
                              <Input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                                placeholder="New category name…" className="h-7 text-xs flex-1 max-w-xs" autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') } }} />
                              <Button size="sm" className="h-7 text-xs px-3" onClick={handleAddCategory} disabled={!newCatName.trim() || savingCat}>
                                {savingCat && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingCat(false); setNewCatName('') }}>Cancel</Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setAddingCat(true)}>
                              <Plus className="w-3 h-3" />New category
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Totals + breakdown + editable items (only when matched rows exist) */}
                {rows.length > 0 && (
                  <>
                    <div className={`grid gap-3 ${mode === 'retail' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                      {[
                        { label: 'Total Opening',  value: totals.opening.toLocaleString('en-ZA') },
                        { label: 'Total Closing',  value: totals.closing.toLocaleString('en-ZA') },
                        { label: 'Total Purchases', value: totals.received.toLocaleString('en-ZA') },
                        ...(mode === 'retail' ? [{ label: 'Total Revenue', value: ZAR(totals.revenue) }] : []),
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-xl border bg-card p-3 text-center">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
                          <p className="font-bold text-sm tabular-nums">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border flex flex-col">
                      <div className="px-3 py-2 bg-muted/50 border-b shrink-0"><p className="text-xs font-semibold">Category Breakdown</p></div>
                      <div className="overflow-x-auto overflow-y-auto flex-1 min-h-full">
                        <Table className='h-[30vh]'>
                          <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                            <TableRow className="bg-muted/20">
                              <TableHead className="text-xs font-semibold">Category</TableHead>
                              <TableHead className="text-right text-xs font-semibold">Open Qty</TableHead>
                              <TableHead className="text-right text-xs font-semibold">Close Qty</TableHead>
                              <TableHead className="text-right text-xs font-semibold">Purchases</TableHead>
                              {mode === 'retail' && <TableHead className="text-right text-xs font-semibold">Open Value</TableHead>}
                              {mode === 'retail' && <TableHead className="text-right text-xs font-semibold">Close Value</TableHead>}
                              {mode === 'retail' && <TableHead className="text-right text-xs font-semibold">Revenue</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {categoryStats.map(([cat, s]) => (
                              <TableRow key={cat}>
                                <TableCell className="text-xs font-medium py-1.5">{cat}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums py-1.5">{s.opening.toLocaleString('en-ZA')}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums py-1.5">{s.closing.toLocaleString('en-ZA')}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums py-1.5">{s.received.toLocaleString('en-ZA')}</TableCell>
                                {mode === 'retail' && <TableCell className="text-right text-xs tabular-nums py-1.5">{ZAR(s.opValue)}</TableCell>}
                                {mode === 'retail' && <TableCell className="text-right text-xs tabular-nums py-1.5">{ZAR(s.clValue)}</TableCell>}
                                {mode === 'retail' && <TableCell className="text-right text-xs tabular-nums py-1.5">{ZAR(s.revenue)}</TableCell>}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <div className="rounded-xl border ">
                      <div className="px-3 py-2 bg-muted/50 border-b">
                        <p className="text-xs font-semibold">Review & Edit Item</p>
                      </div>
                      <div className="overflow-x-auto h-[50vh]">
                        <Table className='  overflow-y-scroll'>
                          <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                            <TableRow>
                              <TableHead className="text-xs">Item</TableHead>
                              <TableHead className="text-xs w-32">Category</TableHead>
                              <TableHead className="text-right text-xs w-24">Cost</TableHead>
                              <TableHead className="text-right text-xs w-24">Price</TableHead>
                              <TableHead className="text-right text-xs w-24">Open</TableHead>
                              <TableHead className="text-right text-xs w-24">Received</TableHead>
                              <TableHead className="text-right text-xs w-24">Close</TableHead>
                              {mode === 'retail' && <TableHead className="text-right text-xs w-24">Sold</TableHead>}
                              {mode === 'retail' && <TableHead className="text-right text-xs w-28">Revenue</TableHead>}
                              <TableHead className="w-8" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map((row, i) => (
                              <TableRow key={i}
                                className={`group cursor-pointer ${highlightedRawRow === row._rawRowIdx ? 'bg-yellow-50' : ''}`}
                                onClick={() => setHighlightedRawRow(row._rawRowIdx)}>
                                <TableCell className="text-xs font-medium truncate max-w-[180px] py-1" title={row._description}>{row._description}</TableCell>
                                <TableCell className="text-xs text-muted-foreground py-1 truncate max-w-[120px]">{idToCategory.get(row.item_id) ?? '—'}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums py-1">{ZAR(priceMap.get(row.item_id)?.unit_cost ?? null)}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums py-1">{ZAR(priceMap.get(row.item_id)?.sell_price ?? null)}</TableCell>
                                <TableCell className="py-0.5"><Input type="number" value={row.opening_stock ?? ''} onChange={e => updateRow(i, 'opening_stock', e.target.value)} className="h-7 text-xs text-right w-20 ml-auto" /></TableCell>
                                <TableCell className="py-0.5"><Input type="number" value={row.new_received ?? ''} onChange={e => updateRow(i, 'new_received', e.target.value)} className="h-7 text-xs text-right w-20 ml-auto" /></TableCell>
                                <TableCell className="py-0.5"><Input type="number" value={row.closing_stock ?? ''} onChange={e => updateRow(i, 'closing_stock', e.target.value)} className="h-7 text-xs text-right w-20 ml-auto" /></TableCell>
                                {mode === 'retail' && <TableCell className="py-0.5"><Input type="number" value={row.items_sold ?? ''} onChange={e => updateRow(i, 'items_sold', e.target.value)} className="h-7 text-xs text-right w-20 ml-auto" /></TableCell>}
                                {mode === 'retail' && <TableCell className="py-0.5"><Input type="number" value={row.revenue ?? ''} onChange={e => updateRow(i, 'revenue', e.target.value)} className="h-7 text-xs text-right w-24 ml-auto" /></TableCell>}
                                <TableCell className="py-0.5 w-8">
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeRow(i)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {mode === 'retail' && (
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Opening Stock Value', value: ZAR(valueStats.opValue) },
                          { label: 'Closing Stock Value',  value: ZAR(valueStats.clValue) },
                          { label: 'Total Revenue',        value: ZAR(valueStats.revenue) },
                        ].map(({ label, value }) => (
                          <div key={label} className="rounded-xl border bg-card p-3 text-center">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
                            <p className="font-bold text-sm tabular-nums">{value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* ── Right panel: raw Excel grid ── */}
          {showRaw && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="px-3 py-2 border-b bg-muted/50 shrink-0 flex items-center justify-between">
                <p className="text-xs font-semibold flex items-center gap-1.5"><FileSpreadsheet className="w-3.5 h-3.5" />Original File</p>
                <p className="text-[10px] text-muted-foreground">{rawData.length} rows · {maxCols} cols</p>
              </div>
              <div className="overflow-auto flex-1" ref={rawPanelRef}>
                {rawData.length > 0 ? (
                  <table className="text-[11px] border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className="bg-slate-200 border border-slate-300 px-2 py-0.5 text-center text-slate-500 font-medium min-w-[32px] sticky left-0 z-20" />
                        {Array.from({ length: maxCols }, (_, i) => (
                          <th key={i} className="bg-slate-200 border border-slate-300 px-3 py-0.5 text-center text-slate-600 font-semibold min-w-[80px]">{colLetter(i)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 300).map((row, ri) => {
                        const isHeader     = ri === headerRowIdx
                        const isHighlighted = ri === highlightedRawRow
                        return (
                          <tr key={ri} data-raw-row={ri}
                            className={isHighlighted ? 'bg-yellow-200' : isHeader ? 'bg-blue-50' : ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                            <td className={`border border-slate-200 px-2 py-0.5 text-center font-medium sticky left-0 z-10 text-[10px] min-w-[32px] ${isHighlighted ? 'bg-yellow-300 text-yellow-800' : isHeader ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{ri + 1}</td>
                            {Array.from({ length: maxCols }, (_, ci) => (
                              <td key={ci} className={`border border-slate-200 px-2 py-0.5 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis ${isHighlighted ? 'font-semibold text-yellow-900' : isHeader ? 'font-semibold text-blue-800' : 'text-slate-700'}`}>
                                {row[ci] != null ? String(row[ci]) : ''}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground p-8">
                    <p className="text-xs">Upload a file to see its contents here</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t px-5 py-3 flex justify-end gap-2 shrink-0 bg-background">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={(!rows.length && !includedNew) || saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Import {(rows.length + includedNew) > 0 ? `${rows.length + includedNew} items to ${fmtMonth(selectedDate)}` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Retail Count Results (sortable) ─────────────────────────────────────────

function RetailCountResultsView({ counts, onNewCount }: { counts: RetailCount[]; onNewCount: () => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const byCategory = useMemo(() => {
    const map = new Map<string, RetailCount[]>()
    for (const c of counts) {
      const k = c.category_name ?? 'Uncategorised'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(c)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [counts])

  const totals = useMemo(() => ({
    opValue: counts.reduce((s, c) => s + (c.op_stock_value ?? 0), 0),
    clValue: counts.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0),
    revenue: counts.reduce((s, c) => s + (c.revenue ?? 0), 0),
  }), [counts])

  if (!counts.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <Package className="w-10 h-10 opacity-30" />
      <p className="text-sm">No stock count for this month.</p>
      <Button size="sm" onClick={onNewCount}><Plus className="w-4 h-4 mr-1.5" />Enter count</Button>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[{ label: 'Opening Value', value: totals.opValue }, { label: 'Closing Value', value: totals.clValue }, { label: 'Revenue', value: totals.revenue }].map(({ label, value }) => (
          <div key={label} className="rounded-xl border bg-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            <p className="font-bold text-sm">{ZAR(value)}</p>
          </div>
        ))}
      </div>

      {byCategory.map(([catName, catItems]) => (
        <RetailCategorySection key={catName} catName={catName} items={catItems}
          collapsed={collapsed.has(catName)}
          onToggle={() => setCollapsed(s => { const n = new Set(s); collapsed.has(catName) ? n.delete(catName) : n.add(catName); return n })} />
      ))}
    </div>
  )
}

function RetailCategorySection({ catName, items, collapsed, onToggle }: {
  catName: string; items: RetailCount[]; collapsed: boolean; onToggle: () => void
}) {
  const { sorted, key, dir, toggle } = useSort<RetailCount>(items, 'variance', 'desc')
  const catRevenue = items.reduce((s, c) => s + (c.revenue ?? 0), 0)
  const catClValue = items.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0)

  return (
    <div className="rounded-xl border overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left" onClick={onToggle}>
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-xs font-semibold uppercase tracking-wide">{catName}</span>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {catRevenue > 0 && <span>Rev: <strong>{ZAR(catRevenue)}</strong></span>}
          <span>Stock: <strong>{ZAR(catClValue)}</strong></span>
        </div>
      </button>
      {!collapsed && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">PLU</TableHead>
                <SortThLeft label="Item"    sortKey="description"   currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Open"    sortKey="opening_stock" currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Rcvd"    sortKey="new_received"  currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Close"   sortKey="closing_stock" currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Var"     sortKey="variance"      currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Op Val"  sortKey="op_stock_value" currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Cl Val"  sortKey="cl_stock_value" currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Sell"    sortKey="sell_price"    currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Markup"  sortKey="markup_pct"    currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Sold"    sortKey="items_sold"    currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Revenue" sortKey="revenue"       currentKey={String(key)} dir={dir} onSort={toggle} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(c => (
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
}

// ─── Food Count Results (sortable) ────────────────────────────────────────────

function FoodCountResultsView({ counts, onNewCount }: { counts: FoodCount[]; onNewCount: () => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const byCategory = useMemo(() => {
    const map = new Map<string, FoodCount[]>()
    for (const c of counts) {
      const k = c.category_name ?? 'Uncategorised'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(c)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [counts])

  const totals = useMemo(() => ({
    opValue: counts.reduce((s, c) => s + (c.op_stock_value ?? 0), 0),
    clValue: counts.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0),
  }), [counts])

  if (!counts.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <ShoppingBasket className="w-10 h-10 opacity-30" />
      <p className="text-sm">No food stock count for this month.</p>
      <Button size="sm" onClick={onNewCount}><Plus className="w-4 h-4 mr-1.5" />Enter count</Button>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[{ label: 'Opening Value', value: totals.opValue }, { label: 'Closing Value', value: totals.clValue }].map(({ label, value }) => (
          <div key={label} className="rounded-xl border bg-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            <p className="font-bold text-sm">{ZAR(value)}</p>
          </div>
        ))}
      </div>
      {byCategory.map(([catName, catItems]) => (
        <FoodCategorySection key={catName} catName={catName} items={catItems}
          collapsed={collapsed.has(catName)}
          onToggle={() => setCollapsed(s => { const n = new Set(s); collapsed.has(catName) ? n.delete(catName) : n.add(catName); return n })} />
      ))}
    </div>
  )
}

function FoodCategorySection({ catName, items, collapsed, onToggle }: {
  catName: string; items: FoodCount[]; collapsed: boolean; onToggle: () => void
}) {
  const { sorted, key, dir, toggle } = useSort<FoodCount>(items, 'variance', 'desc')
  const catClValue = items.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0)

  return (
    <div className="rounded-xl border overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left" onClick={onToggle}>
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-xs font-semibold uppercase tracking-wide">{catName}</span>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">Stock: <strong>{ZAR(catClValue)}</strong></span>
      </button>
      {!collapsed && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortThLeft label="Item"     sortKey="description"    currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortThLeft label="Unit"     sortKey="unit_size"      currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Open"     sortKey="opening_stock"  currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Received" sortKey="new_received"   currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Close"    sortKey="closing_stock"  currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Variance" sortKey="variance"       currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Op Value" sortKey="op_stock_value" currentKey={String(key)} dir={dir} onSort={toggle} />
                <SortTh     label="Cl Value" sortKey="cl_stock_value" currentKey={String(key)} dir={dir} onSort={toggle} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(c => (
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
}

// ─── Items Panels (sortable) ──────────────────────────────────────────────────

function RetailItemsPanel({ items, categories, onAdd, onEdit, onDelete }: {
  items: RetailItem[]; categories: StockCategory[]
  onAdd: () => void; onEdit: (i: RetailItem) => void; onDelete: (id: number) => void
}) {
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<RetailItem | null>(null)

  const filtered = useMemo(() => items.filter(i =>
    (catFilter === 'all' || i.category_id === Number(catFilter)) &&
    i.description.toLowerCase().includes(search.toLowerCase())
  ), [items, search, catFilter])

  const withMarkup = useMemo(() => filtered.map(i => ({
    ...i,
    markup_pct: i.cost_per_item && i.sell_price ? ((i.sell_price - i.cost_per_item) / i.cost_per_item * 100) : null
  })), [filtered])

  const { sorted, key, dir, toggle } = useSort(withMarkup, 'description' as any, 'asc')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-xs" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c.category_id} value={String(c.category_id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} items</span>
        <Button size="sm" className="ml-auto gap-1.5" onClick={onAdd}><Plus className="w-4 h-4" />Add item</Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortThLeft label="PLU"         sortKey="plu"           currentKey={String(key)} dir={dir} onSort={toggle} className="w-16" />
              <SortThLeft label="Description" sortKey="description"   currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortThLeft label="Category"    sortKey="category_id"   currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortTh     label="Cost/item"   sortKey="cost_per_item" currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortTh     label="Sell"        sortKey="sell_price"    currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortTh     label="Markup"      sortKey="markup_pct"    currentKey={String(key)} dir={dir} onSort={toggle} />
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0
              ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No items found.</TableCell></TableRow>
              : sorted.map(item => (
                <TableRow key={item.item_id} className={!item.is_active ? 'opacity-40' : ''}>
                  <TableCell className="text-xs text-muted-foreground">{item.plu ?? '—'}</TableCell>
                  <TableCell className="text-sm font-medium max-w-[200px] truncate">{item.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.category?.name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{ZAR(item.cost_per_item)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{ZAR(item.sell_price)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {item.markup_pct != null ? `${(item.markup_pct as number).toFixed(1)}%` : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete item?</AlertDialogTitle><AlertDialogDescription>Permanently deletes <strong>{deleteTarget?.description}</strong> and all its stock counts.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { if (deleteTarget) { onDelete(deleteTarget.item_id); setDeleteTarget(null) } }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FoodItemsPanel({ items, categories, onAdd, onEdit, onDelete }: {
  items: FoodItem[]; categories: StockCategory[]
  onAdd: () => void; onEdit: (i: FoodItem) => void; onDelete: (id: number) => void
}) {
  const [search, setSearch]             = useState('')
  const [catFilter, setCatFilter]       = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<FoodItem | null>(null)

  const filtered = useMemo(() => items.filter(i =>
    (catFilter === 'all' || i.category_id === Number(catFilter)) &&
    i.description.toLowerCase().includes(search.toLowerCase())
  ), [items, search, catFilter])

  const { sorted, key, dir, toggle } = useSort(filtered, 'description' as any, 'asc')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-xs" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c.category_id} value={String(c.category_id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} items</span>
        <Button size="sm" className="ml-auto gap-1.5" onClick={onAdd}><Plus className="w-4 h-4" />Add item</Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortThLeft label="PLU"         sortKey="plu"           currentKey={String(key)} dir={dir} onSort={toggle} className="w-16" />
              <SortThLeft label="Description" sortKey="description"   currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortThLeft label="Category"    sortKey="category_id"   currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortThLeft label="Unit"        sortKey="unit_size"     currentKey={String(key)} dir={dir} onSort={toggle} />
              <SortTh     label="Cost/unit"   sortKey="cost_per_unit" currentKey={String(key)} dir={dir} onSort={toggle} />
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0
              ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No items found.</TableCell></TableRow>
              : sorted.map(item => (
                <TableRow key={item.item_id} className={!item.is_active ? 'opacity-40' : ''}>
                  <TableCell className="text-xs text-muted-foreground">{item.plu ?? '—'}</TableCell>
                  <TableCell className="text-sm font-medium max-w-[220px] truncate">{item.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.category?.name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.unit_size ?? '—'}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{ZAR(item.cost_per_unit)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete item?</AlertDialogTitle><AlertDialogDescription>Permanently deletes <strong>{deleteTarget?.description}</strong> and all its stock counts.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { if (deleteTarget) { onDelete(deleteTarget.item_id); setDeleteTarget(null) } }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Count Entry Modals (manual) ──────────────────────────────────────────────

function RetailCountModal({ open, onClose, items, existingCounts, onSave, countDate }: {
  open: boolean; onClose: () => void; items: RetailItem[]; existingCounts: RetailCount[]
  countDate: string; onSave: (rows: any[]) => Promise<void>
}) {
  type RS = { opening_stock: string; new_received: string; closing_stock: string; items_sold: string; revenue: string }
  const [rows, setRows] = useState<Record<number, RS>>({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    const init: Record<number, RS> = {}
    for (const item of items) {
      const ex = existingCounts.find(c => c.item_id === item.item_id)
      init[item.item_id] = { opening_stock: ex ? String(ex.opening_stock) : '0', new_received: ex ? String(ex.new_received) : '0', closing_stock: ex ? String(ex.closing_stock) : '0', items_sold: ex?.items_sold != null ? String(ex.items_sold) : '', revenue: ex?.revenue != null ? String(ex.revenue) : '' }
    }
    setRows(init); setSearch('')
  }, [open, items, existingCounts])

  const set = (id: number, k: keyof RS, v: string) => setRows(r => ({ ...r, [id]: { ...r[id], [k]: v } }))
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
              <TableRow><TableHead className="w-8">PLU</TableHead><TableHead>Item</TableHead><TableHead className="text-right w-24">Open</TableHead><TableHead className="text-right w-24">Received</TableHead><TableHead className="text-right w-24">Close</TableHead><TableHead className="text-right w-20">Variance</TableHead><TableHead className="text-right w-24">Sold</TableHead><TableHead className="text-right w-28">Revenue</TableHead></TableRow>
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
        <div className="px-4 sm:px-6 py-3 border-t flex justify-end gap-2 shrink-0"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save count</Button></div>
      </DialogContent>
    </Dialog>
  )
}

function FoodCountModal({ open, onClose, items, existingCounts, onSave, countDate }: {
  open: boolean; onClose: () => void; items: FoodItem[]; existingCounts: FoodCount[]
  countDate: string; onSave: (rows: any[]) => Promise<void>
}) {
  type RS = { opening_stock: string; new_received: string; closing_stock: string }
  const [rows, setRows] = useState<Record<number, RS>>({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    const init: Record<number, RS> = {}
    for (const item of items) {
      const ex = existingCounts.find(c => c.item_id === item.item_id)
      init[item.item_id] = { opening_stock: ex ? String(ex.opening_stock) : '0', new_received: ex ? String(ex.new_received) : '0', closing_stock: ex ? String(ex.closing_stock) : '0' }
    }
    setRows(init); setSearch('')
  }, [open, items, existingCounts])

  const set = (id: number, k: keyof RS, v: string) => setRows(r => ({ ...r, [id]: { ...r[id], [k]: v } }))
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
        <div className="px-4 sm:px-6 py-3 border-t flex justify-end gap-2 shrink-0"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save count</Button></div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Item Form Modals ─────────────────────────────────────────────────────────

interface ItemFormRetail { category_id: number; plu: string; description: string; supplier_label: string; cost_price: string; qty_per_case: string; cost_per_item: string; sell_price: string; is_active: boolean; notes: string }
interface ItemFormFood   { category_id: number; plu: string; description: string; unit_size: string; cost_price: string; qty_per_pack: string; cost_per_unit: string; sell_price: string; is_active: boolean; notes: string }

function RetailItemModal({ open, onClose, categories, initial, onSave }: { open: boolean; onClose: () => void; categories: StockCategory[]; initial?: RetailItem | null; onSave: (data: Partial<RetailItem>, id?: number) => Promise<void> }) {
  const EMPTY: ItemFormRetail = { category_id: categories[0]?.category_id ?? 0, plu: '', description: '', supplier_label: '', cost_price: '', qty_per_case: '', cost_per_item: '', sell_price: '', is_active: true, notes: '' }
  const [form, setForm] = useState<ItemFormRetail>(EMPTY)
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  useEffect(() => { if (open) { setForm(initial ? { category_id: initial.category_id, plu: initial.plu ?? '', description: initial.description, supplier_label: initial.supplier_label ?? '', cost_price: initial.cost_price?.toString() ?? '', qty_per_case: initial.qty_per_case?.toString() ?? '', cost_per_item: initial.cost_per_item?.toString() ?? '', sell_price: initial.sell_price?.toString() ?? '', is_active: initial.is_active, notes: initial.notes ?? '' } : { ...EMPTY, category_id: categories[0]?.category_id ?? 0 }); setError('') } }, [open, initial])
  const set = (k: keyof ItemFormRetail, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  async function handleSave() {
    if (!form.description.trim()) return setError('Description is required')
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

function FoodItemModal({ open, onClose, categories, initial, onSave }: { open: boolean; onClose: () => void; categories: StockCategory[]; initial?: FoodItem | null; onSave: (data: Partial<FoodItem>, id?: number) => Promise<void> }) {
  const EMPTY: ItemFormFood = { category_id: categories[0]?.category_id ?? 0, plu: '', description: '', unit_size: '', cost_price: '', qty_per_pack: '', cost_per_unit: '', sell_price: '', is_active: true, notes: '' }
  const [form, setForm] = useState<ItemFormFood>(EMPTY)
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  useEffect(() => { if (open) { setForm(initial ? { category_id: initial.category_id, plu: initial.plu ?? '', description: initial.description, unit_size: initial.unit_size ?? '', cost_price: initial.cost_price?.toString() ?? '', qty_per_pack: initial.qty_per_pack?.toString() ?? '', cost_per_unit: initial.cost_per_unit?.toString() ?? '', sell_price: initial.sell_price?.toString() ?? '', is_active: initial.is_active, notes: initial.notes ?? '' } : { ...EMPTY, category_id: categories[0]?.category_id ?? 0 }); setError('') } }, [open, initial])
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

// ─── Month Selector ───────────────────────────────────────────────────────────

function MonthSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const months = useMemo(() => getLastNMonths(24), [])
  // Ensure the current value is always in the list (e.g. 2026-02-28)
  const options = useMemo(() => {
    const inList = months.some(m => m.value === value)
    if (inList || !value) return months
    const extra: MonthOption = {
      label: fmtMonth(value),
      value,
    }
    return [extra, ...months].sort((a, b) => b.value.localeCompare(a.value))
  }, [months, value])

  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── Main StockTab ────────────────────────────────────────────────────────────

export function StockTab() {
  const supabase = createClient()
  const now = new Date()
  const currentMonthEnd = lastDayOfMonth(now.getFullYear(), now.getMonth() + 1)

  const [retailCategories, setRetailCategories] = useState<StockCategory[]>([])
  const [retailItems,      setRetailItems]      = useState<RetailItem[]>([])
  const [retailCounts,     setRetailCounts]     = useState<RetailCount[]>([])
  const [retailMonth,      setRetailMonth]      = useState(currentMonthEnd)

  const [showRetailCount,  setShowRetailCount]  = useState(false)
  const [showRetailUpload, setShowRetailUpload] = useState(false)
  const [showRetailItem,   setShowRetailItem]   = useState(false)
  const [editRetailItem,   setEditRetailItem]   = useState<RetailItem | null>(null)

  const [foodCategories, setFoodCategories] = useState<StockCategory[]>([])
  const [foodItems,      setFoodItems]      = useState<FoodItem[]>([])
  const [foodCounts,     setFoodCounts]     = useState<FoodCount[]>([])
  const [foodMonth,      setFoodMonth]      = useState(currentMonthEnd)

  const [showFoodCount,  setShowFoodCount]  = useState(false)
  const [showFoodUpload, setShowFoodUpload] = useState(false)
  const [showFoodItem,   setShowFoodItem]   = useState(false)
  const [editFoodItem,   setEditFoodItem]   = useState<FoodItem | null>(null)

  const [loading, setLoading] = useState(true)

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
    ]).then(([,, retailLatest, foodLatest]) => {
      if (retailLatest.data?.count_date) setRetailMonth(retailLatest.data.count_date)
      if (foodLatest.data?.count_date)   setFoodMonth(foodLatest.data.count_date)
      setLoading(false)
    })
  }, [])

  useEffect(() => { fetchRetailCounts(retailMonth) }, [retailMonth])
  useEffect(() => { fetchFoodCounts(foodMonth) },     [foodMonth])

  async function saveRetailCount(rows: any[], date?: string) {
    await supabase.from('vb_retail_stock_count').upsert(rows, { onConflict: 'item_id,count_date' })
    const target = date ?? retailMonth
    if (date && date !== retailMonth) setRetailMonth(date)
    await fetchRetailCounts(target)
  }
  async function saveRetailItem(data: Partial<RetailItem>, id?: number) {
    if (id) await supabase.from('vb_retail_stock_item').update(data).eq('item_id', id)
    else    await supabase.from('vb_retail_stock_item').insert([data])
    await fetchRetail()
  }
  async function deleteRetailItem(id: number) {
    await supabase.from('vb_retail_stock_item').delete().eq('item_id', id); await fetchRetail()
  }
  async function saveFoodCount(rows: any[], date?: string) {
    await supabase.from('vb_food_stock_count').upsert(rows, { onConflict: 'item_id,count_date' })
    const target = date ?? foodMonth
    if (date && date !== foodMonth) setFoodMonth(date)
    await fetchFoodCounts(target)
  }
  async function saveFoodItem(data: Partial<FoodItem>, id?: number) {
    if (id) await supabase.from('vb_food_stock_item').update(data).eq('item_id', id)
    else    await supabase.from('vb_food_stock_item').insert([data])
    await fetchFood()
  }
  async function deleteFoodItem(id: number) {
    await supabase.from('vb_food_stock_item').delete().eq('item_id', id); await fetchFood()
  }

  if (loading) return (
    <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin" /><p className="text-sm">Loading stock…</p>
    </div>
  )

  return (
    <div className="space-y-5 px-4 sm:px-8 lg:px-24 pt-8 pb-8">
      <Tabs defaultValue="retail-dashboard">
        <TabsList className="h-9 rounded-xl bg-muted p-1 flex-wrap gap-0.5">
          <TabsTrigger value="retail-dashboard" className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm"><BarChart3 className="w-3.5 h-3.5" /> Dashboard</TabsTrigger>
          <TabsTrigger value="retail"           className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Package className="w-3.5 h-3.5" /> Retail Counts</TabsTrigger>
          <TabsTrigger value="food"             className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm"><ShoppingBasket className="w-3.5 h-3.5" /> Food / Kitchen</TabsTrigger>
          <TabsTrigger value="retail-items"     className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Pencil className="w-3.5 h-3.5" /> Manage Retail</TabsTrigger>
          <TabsTrigger value="food-items"       className="rounded-lg text-xs gap-1.5 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Pencil className="w-3.5 h-3.5" /> Manage Food</TabsTrigger>
        </TabsList>

        <TabsContent value="retail-dashboard" className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold">Retail Stock Overview</h2>
              <p className="text-xs text-muted-foreground">{fmtMonth(retailMonth)} month-end count</p>
            </div>
            <MonthSelector value={retailMonth} onChange={v => { setRetailMonth(v); }} />
          </div>
          <RetailDashboard counts={retailCounts} />
        </TabsContent>

        <TabsContent value="retail" className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <MonthSelector value={retailMonth} onChange={setRetailMonth} />
            <div className="flex items-center gap-2 ml-auto">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowRetailUpload(true)}><FileSpreadsheet className="w-4 h-4" />Upload Excel</Button>
              <Button size="sm" className="gap-1.5" onClick={() => setShowRetailCount(true)}><RefreshCw className="w-4 h-4" />{retailCounts.length > 0 ? 'Update count' : 'Enter count'}</Button>
            </div>
          </div>
          <RetailCountResultsView counts={retailCounts} onNewCount={() => setShowRetailCount(true)} />
        </TabsContent>

        <TabsContent value="food" className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <MonthSelector value={foodMonth} onChange={setFoodMonth} />
            <div className="flex items-center gap-2 ml-auto">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowFoodUpload(true)}><FileSpreadsheet className="w-4 h-4" />Upload Excel</Button>
              <Button size="sm" className="gap-1.5" onClick={() => setShowFoodCount(true)}><RefreshCw className="w-4 h-4" />{foodCounts.length > 0 ? 'Update count' : 'Enter count'}</Button>
            </div>
          </div>
          <FoodCountResultsView counts={foodCounts} onNewCount={() => setShowFoodCount(true)} />
        </TabsContent>

        <TabsContent value="retail-items" className="mt-5">
          <RetailItemsPanel items={retailItems} categories={retailCategories}
            onAdd={() => { setEditRetailItem(null); setShowRetailItem(true) }}
            onEdit={i => { setEditRetailItem(i); setShowRetailItem(true) }}
            onDelete={deleteRetailItem} />
        </TabsContent>

        <TabsContent value="food-items" className="mt-5">
          <FoodItemsPanel items={foodItems} categories={foodCategories}
            onAdd={() => { setEditFoodItem(null); setShowFoodItem(true) }}
            onEdit={i => { setEditFoodItem(i); setShowFoodItem(true) }}
            onDelete={deleteFoodItem} />
        </TabsContent>
      </Tabs>

      <RetailCountModal open={showRetailCount} onClose={() => setShowRetailCount(false)} items={retailItems.filter(i => i.is_active)} existingCounts={retailCounts} countDate={retailMonth} onSave={saveRetailCount} />
      <FoodCountModal   open={showFoodCount}   onClose={() => setShowFoodCount(false)}   items={foodItems.filter(i => i.is_active)}   existingCounts={foodCounts}   countDate={foodMonth}   onSave={saveFoodCount} />
      <ExcelUploadModal open={showRetailUpload} onClose={() => setShowRetailUpload(false)} items={retailItems} onSave={saveRetailCount} countDate={retailMonth} mode="retail" categories={retailCategories} />
      <ExcelUploadModal open={showFoodUpload}   onClose={() => setShowFoodUpload(false)}   items={foodItems}   onSave={saveFoodCount}   countDate={foodMonth}   mode="food"   categories={foodCategories} />
      <RetailItemModal  open={showRetailItem}   onClose={() => setShowRetailItem(false)}  categories={retailCategories} initial={editRetailItem} onSave={saveRetailItem} />
      <FoodItemModal    open={showFoodItem}     onClose={() => setShowFoodItem(false)}    categories={foodCategories}   initial={editFoodItem}   onSave={saveFoodItem} />
    </div>
  )
}