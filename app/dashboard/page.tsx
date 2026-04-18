'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2,
  XCircle, BarChart3, DollarSign, ShoppingCart, Receipt,
  Users, Package, ArrowUpRight, ArrowDownRight, RefreshCw,
  Calendar, ChevronDown, Info, Loader2,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
  LineChart, Line, ReferenceLine,
} from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/header'

// ─── Brand ───────────────────────────────────────────────────────────────────
const BRAND = {
  coffee:     '#5C3D2E',
  caramel:    '#C4874A',
  wheat:      '#D4A96A',
  sage:       '#7A9E7E',
  terracotta: '#C0614A',
  cream:      '#F5EDD8',
}
const PALETTE = [
  BRAND.caramel, BRAND.coffee, BRAND.terracotta, BRAND.sage,
  BRAND.wheat, '#8B5E3C', '#A8C5A0', '#E8B87A', '#6B8E6B', '#D4956A',
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface CashUpSheet {
  id: string
  sheet_date: string | null
  created_at: string
  total_cash: string | number | null
  credit_card_yoco: string | number | null
  charged_sales_accounts: string | number | null
  till_total_z_print: string | number | null
  slips_paid_out: string | null
  notes: string | null
}

interface Expense {
  expense_id: number
  invoice_date: string
  amount_excl_vat: number
  vat_rated: boolean
  vat_amount: number
  amount_incl_vat: number
  date_paid: string | null
  supplier_id: number | null
  product_description: string | null
  vb_supplier?: { company_name: string } | null
}

interface RetailCount {
  count_id: number
  count_date: string
  category_name: string
  opening_stock: number
  closing_stock: number
  new_received: number
  items_sold: number | null
  revenue: number | null
  op_stock_value: number | null
  cl_stock_value: number | null
  cost_per_item: number | null
  markup_pct: number | null
}

interface Payslip {
  payslip_id: number
  employee_id: number
  pay_date: string | null
  period_from: string
  period_to: string
  total_earnings: number
  nett_pay: number
  uif_employee: number
  total_deductions: number
  vb_employee?: { full_name: string } | null
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const ZAR = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n)
const ZARk = (n: number) =>
  Math.abs(n) >= 1000
    ? `R${(n / 1000).toFixed(1)}k`
    : `R${Math.round(n)}`
const pct = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toFixed(1)}%`

function parseNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return parseFloat(String(v)) || 0
}

function sheetDate(s: CashUpSheet): Date {
  if (s.sheet_date) {
    const d = new Date(s.sheet_date)
    if (!isNaN(d.getTime())) return d
    const parts = s.sheet_date.split('/')
    if (parts.length === 3) return new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`)
  }
  return new Date(s.created_at)
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ─── Filter helpers ───────────────────────────────────────────────────────────
type FilterMode = 'month' | 'quarter' | 'fy' | 'custom'

interface DateRange { from: string; to: string }

function getRange(mode: FilterMode, year: number, month: number, quarter: number, fy: number, customFrom: string, customTo: string): DateRange {
  if (mode === 'month') {
    const last = new Date(year, month + 1, 0).getDate()
    const m = String(month + 1).padStart(2, '0')
    return { from: `${year}-${m}-01`, to: `${year}-${m}-${last}` }
  }
  if (mode === 'quarter') {
    const startMonth = (quarter - 1) * 3
    const endMonth   = startMonth + 2
    const last = new Date(year, endMonth + 1, 0).getDate()
    return {
      from: `${year}-${String(startMonth+1).padStart(2,'0')}-01`,
      to:   `${year}-${String(endMonth+1).padStart(2,'0')}-${last}`,
    }
  }
  if (mode === 'fy') {
    return { from: `${fy}-03-01`, to: `${fy+1}-02-28` }
  }
  return { from: customFrom || '2024-01-01', to: customTo || new Date().toISOString().split('T')[0] }
}

function inRange(dateStr: string | null | undefined, range: DateRange): boolean {
  if (!dateStr) return false
  return dateStr >= range.from && dateStr <= range.to
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-semibold mb-1.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-foreground ml-1">{ZAR(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, trendLabel, accent, icon: Icon, size = 'md' }: {
  label: string; value: string; sub?: string
  trend?: 'up' | 'down' | 'flat' | 'good-up' | 'bad-up' | 'good-down' | 'bad-down'
  trendLabel?: string; accent?: string; icon?: React.ElementType; size?: 'sm' | 'md' | 'lg'
}) {
  const trendColor = trend === 'good-up' || trend === 'good-down' ? 'text-emerald-600' : trend === 'bad-up' || trend === 'bad-down' ? 'text-red-500' : 'text-muted-foreground'
  const TrendIcon  = (trend === 'up' || trend === 'good-up' || trend === 'bad-up') ? ArrowUpRight : (trend === 'down' || trend === 'good-down' || trend === 'bad-down') ? ArrowDownRight : Minus

  return (
    <div className="rounded-2xl border bg-card p-4 relative overflow-hidden flex flex-col gap-1.5">
      {accent && <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: accent }} />}
      <div className="flex items-start justify-between">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mt-0.5">{label}</p>
        {Icon && <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-muted shrink-0"><Icon className="w-3.5 h-3.5 text-muted-foreground" /></div>}
      </div>
      <p className={`font-bold tabular-nums ${size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-base' : 'text-xl'} leading-tight`}>{value}</p>
      {(sub || trendLabel) && (
        <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
          {trend && trend !== 'flat' && <TrendIcon className="w-3 h-3 shrink-0" />}
          <span className={trendLabel ? trendColor : 'text-muted-foreground'}>{trendLabel ?? sub}</span>
          {sub && trendLabel && <span className="text-muted-foreground">· {sub}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, sub, accent }: { title: string; sub?: string; accent?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      {accent && <div className="w-1 h-8 rounded-full shrink-0" style={{ background: accent }} />}
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Health Badge ─────────────────────────────────────────────────────────────
function HealthBadge({ status }: { status: 'good' | 'warning' | 'bad' }) {
  if (status === 'good')    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><CheckCircle2 className="w-3 h-3" />Good</span>
  if (status === 'warning') return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><AlertTriangle className="w-3 h-3" />Watch</span>
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5"><XCircle className="w-3 h-3" />Concern</span>
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function BusinessDashboard() {
  const supabase = createClient()

  // ── Data state ──
  const [cashUpSheets, setCashUpSheets] = useState<CashUpSheet[]>([])
  const [expenses,     setExpenses]     = useState<Expense[]>([])
  const [retailCounts, setRetailCounts] = useState<RetailCount[]>([])
  const [payslips,     setPayslips]     = useState<Payslip[]>([])
  const [loading,      setLoading]      = useState(true)
  const [lastRefresh,  setLastRefresh]  = useState(new Date())

  // ── Filter state ──
  const now       = new Date()
  const [filterMode,    setFilterMode]    = useState<FilterMode>('month')
  const [filterYear,    setFilterYear]    = useState(now.getFullYear())
  const [filterMonth,   setFilterMonth]   = useState(now.getMonth())
  const [filterQuarter, setFilterQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3))
  const [filterFY,      setFilterFY]      = useState(now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1)
  const [customFrom,    setCustomFrom]    = useState('')
  const [customTo,      setCustomTo]      = useState('')

  const range = useMemo(() =>
    getRange(filterMode, filterYear, filterMonth, filterQuarter, filterFY, customFrom, customTo),
    [filterMode, filterYear, filterMonth, filterQuarter, filterFY, customFrom, customTo]
  )

  // ── Fetch ──
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [sheets, exps, counts, slips] = await Promise.all([
      supabase.from('cash_up_sheets').select('*').order('sheet_date', { ascending: false }),
      supabase.from('vb_expense').select('*, vb_supplier(company_name)'),
      supabase.from('vb_retail_stock_count_enriched').select('*'),
      supabase.from('vb_payslip').select('*, vb_employee(full_name)'),
    ])
    setCashUpSheets((sheets.data as CashUpSheet[]) ?? [])
    setExpenses((exps.data as Expense[]) ?? [])
    setRetailCounts((counts.data as RetailCount[]) ?? [])
    setPayslips((slips.data as Payslip[]) ?? [])
    setLoading(false)
    setLastRefresh(new Date())
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Filtered data ──
  const filteredSheets = useMemo(() =>
    cashUpSheets.filter(s => inRange(sheetDate(s).toISOString().split('T')[0], range)),
    [cashUpSheets, range]
  )
  const filteredExpenses = useMemo(() =>
    expenses.filter(e => inRange(e.invoice_date, range)),
    [expenses, range]
  )
  const filteredCounts = useMemo(() =>
    retailCounts.filter(c => inRange(c.count_date, range)),
    [retailCounts, range]
  )
  const filteredPayslips = useMemo(() =>
    payslips.filter(p => inRange(p.pay_date ?? p.period_to, range)),
    [payslips, range]
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // ── CORE CALCULATIONS ─────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  const core = useMemo(() => {
    // ── Revenue ──
    const grossRevenue     = filteredSheets.reduce((s, r) => s + parseNum(r.till_total_z_print), 0)
    const revenueExclVat   = grossRevenue / 1.15
    const outputVat        = grossRevenue - revenueExclVat

    // ── Expenses ──
    const totalExpensesIncl = filteredExpenses.reduce((s, e) => s + Number(e.amount_incl_vat), 0)
    const totalExpensesExcl = filteredExpenses.reduce((s, e) => s + Number(e.amount_excl_vat), 0)
    const inputVat          = filteredExpenses.reduce((s, e) => s + Number(e.vat_amount), 0)
    const unpaidExpenses    = filteredExpenses.filter(e => !e.date_paid).reduce((s, e) => s + Number(e.amount_incl_vat), 0)

    // ── VAT ──
    const vatPayable = outputVat - inputVat  // positive = pay SARS, negative = claim back

    // ── Stock (COGS) ──
    // Cost of goods sold = opening stock value - closing stock value + received (net movement)
    // We use: sum of (op_stock_value) for the period's counts as proxy for COGS consumed
    const totalOpStockValue = filteredCounts.reduce((s, c) => s + (c.op_stock_value ?? 0), 0)
    const totalClStockValue = filteredCounts.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0)
    const stockRevenue      = filteredCounts.reduce((s, c) => s + (c.revenue ?? 0), 0)
    // COGS = opening + received - closing
    const received = filteredCounts.reduce((s, c) => {
      const rcv = (c.new_received ?? 0) * (c.cost_per_item ?? 0)
      return s + rcv
    }, 0)
    const cogs = Math.max(0, totalOpStockValue + received - totalClStockValue)

    // ── Employee costs ──
    const employeeCosts  = filteredPayslips.reduce((s, p) => s + Number(p.nett_pay ?? 0), 0)
    const uifTotal       = filteredPayslips.reduce((s, p) => s + Number(p.uif_employee ?? 0), 0)
    const totalWageCosts = employeeCosts  // nett pay = what employees receive

    // ── Profit ──
    const grossProfit     = revenueExclVat - cogs
    const grossMargin     = revenueExclVat > 0 ? (grossProfit / revenueExclVat * 100) : 0
    const operatingExpenses = totalExpensesExcl - cogs  // expenses beyond cost of goods
    const netProfit       = grossProfit - totalExpensesExcl - totalWageCosts
    const netMargin       = revenueExclVat > 0 ? (netProfit / revenueExclVat * 100) : 0

    // ── Payment breakdown ──
    const cashTotal   = filteredSheets.reduce((s, r) => s + parseNum(r.total_cash), 0)
    const cardTotal   = filteredSheets.reduce((s, r) => s + parseNum(r.credit_card_yoco), 0)
    const accountsTotal = filteredSheets.reduce((s, r) => s + parseNum(r.charged_sales_accounts), 0)

    // ── EBITDA proxy ──
    const ebitda = grossProfit - (totalExpensesExcl - cogs) - totalWageCosts

    return {
      grossRevenue, revenueExclVat, outputVat,
      totalExpensesIncl, totalExpensesExcl, inputVat, unpaidExpenses,
      vatPayable,
      totalOpStockValue, totalClStockValue, cogs, stockRevenue,
      employeeCosts, uifTotal, totalWageCosts,
      grossProfit, grossMargin,
      operatingExpenses, netProfit, netMargin,
      cashTotal, cardTotal, accountsTotal,
      ebitda,
      sheetCount: filteredSheets.length,
      avgDailyRevenue: filteredSheets.length > 0 ? grossRevenue / filteredSheets.length : 0,
    }
  }, [filteredSheets, filteredExpenses, filteredCounts, filteredPayslips])

  // ── Monthly trend data ──
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { revenue: number; expenses: number; wages: number; grossProfit: number }>()

    for (const s of cashUpSheets) {
      const key = dateKey(sheetDate(s))
      const cur = map.get(key) ?? { revenue: 0, expenses: 0, wages: 0, grossProfit: 0 }
      cur.revenue += parseNum(s.till_total_z_print) / 1.15
      map.set(key, cur)
    }
    for (const e of expenses) {
      const key = e.invoice_date.slice(0,7)
      const cur = map.get(key) ?? { revenue: 0, expenses: 0, wages: 0, grossProfit: 0 }
      cur.expenses += Number(e.amount_excl_vat)
      map.set(key, cur)
    }
    for (const p of payslips) {
      const key = (p.pay_date ?? p.period_to).slice(0,7)
      const cur = map.get(key) ?? { revenue: 0, expenses: 0, wages: 0, grossProfit: 0 }
      cur.wages += Number(p.nett_pay ?? 0)
      map.set(key, cur)
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, vals]) => {
        const [yr, mo] = key.split('-')
        const gp = vals.revenue - vals.expenses - vals.wages
        return {
          name:      `${MONTHS_SHORT[parseInt(mo)-1]} ${yr.slice(2)}`,
          revenue:   Math.round(vals.revenue),
          expenses:  Math.round(vals.expenses),
          wages:     Math.round(vals.wages),
          netProfit: Math.round(gp),
        }
      })
  }, [cashUpSheets, expenses, payslips])

  // ── Daily revenue for current period ──
  const dailyRevenue = useMemo(() =>
    filteredSheets
      .map(s => ({ date: sheetDate(s).toISOString().split('T')[0], total: parseNum(s.till_total_z_print) }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ name: d.date.slice(5), total: Math.round(d.total) }))
  , [filteredSheets])

  // ── Expense breakdown by supplier ──
  const expenseBySupplier = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of filteredExpenses) {
      const name = e.vb_supplier?.company_name ?? 'Other / Bank fees'
      map.set(name, (map.get(name) ?? 0) + Number(e.amount_excl_vat))
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name: name.length > 24 ? name.slice(0,22)+'…' : name, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [filteredExpenses])

  // ── Category profit analysis ──
  const categoryAnalysis = useMemo(() => {
    const map = new Map<string, { revenue: number; cogs: number; opVal: number; clVal: number; items: number }>()
    for (const c of filteredCounts) {
      const k = c.category_name ?? 'Uncategorised'
      const e = map.get(k) ?? { revenue: 0, cogs: 0, opVal: 0, clVal: 0, items: 0 }
      e.revenue += c.revenue ?? 0
      e.opVal   += c.op_stock_value ?? 0
      e.clVal   += c.cl_stock_value ?? 0
      e.items++
      map.set(k, e)
    }
    return Array.from(map.entries()).map(([name, v]) => {
      const cogs      = Math.max(0, v.opVal - v.clVal)
      const gp        = v.revenue - cogs
      const margin    = v.revenue > 0 ? gp / v.revenue * 100 : 0
      return { name, revenue: Math.round(v.revenue), cogs: Math.round(cogs), grossProfit: Math.round(gp), margin: Math.round(margin) }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [filteredCounts])

  // ── Employee cost breakdown ──
  const employeeBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of filteredPayslips) {
      const name = p.vb_employee?.full_name ?? `Employee #${p.employee_id}`
      map.set(name, (map.get(name) ?? 0) + Number(p.nett_pay ?? 0))
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
  }, [filteredPayslips])

  // ── VAT summary ──
  const vatData = useMemo(() => [
    { name: 'Output VAT (Sales)', value: Math.round(core.outputVat), color: BRAND.caramel },
    { name: 'Input VAT (Expenses)', value: Math.round(core.inputVat), color: BRAND.sage },
  ], [core])

  // ── Payment method split ──
  const paymentSplit = useMemo(() => [
    { name: 'Cash', value: Math.round(core.cashTotal), color: BRAND.coffee },
    { name: 'Card / YOCO', value: Math.round(core.cardTotal), color: BRAND.caramel },
    { name: 'Accounts', value: Math.round(core.accountsTotal), color: BRAND.wheat },
  ].filter(p => p.value > 0), [core])

  // ── Business health indicators ──
  const healthIndicators = useMemo(() => [
    {
      label: 'Gross Margin',
      value: pct(core.grossMargin),
      status: (core.grossMargin > 40 ? 'good' : core.grossMargin > 20 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: 'Revenue minus cost of goods sold',
      benchmark: '>40% is healthy for retail/bakery',
    },
    {
      label: 'Net Profit Margin',
      value: pct(core.netMargin),
      status: (core.netMargin > 15 ? 'good' : core.netMargin > 0 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: 'After all costs including wages',
      benchmark: '>15% is strong',
    },
    {
      label: 'Wage Cost Ratio',
      value: core.revenueExclVat > 0 ? pct(core.employeeCosts / core.revenueExclVat * 100) : '—',
      status: (core.revenueExclVat > 0 && core.employeeCosts / core.revenueExclVat < 0.30 ? 'good' : core.revenueExclVat > 0 && core.employeeCosts / core.revenueExclVat < 0.45 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: 'Wages as % of revenue',
      benchmark: '<30% revenue is healthy',
    },
    {
      label: 'Expense Ratio',
      value: core.revenueExclVat > 0 ? pct(core.totalExpensesExcl / core.revenueExclVat * 100) : '—',
      status: (core.revenueExclVat > 0 && core.totalExpensesExcl / core.revenueExclVat < 0.60 ? 'good' : core.revenueExclVat > 0 && core.totalExpensesExcl / core.revenueExclVat < 0.80 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: 'Total expenses as % of revenue',
      benchmark: '<60% means profitable operation',
    },
    {
      label: 'Outstanding Payables',
      value: ZAR(core.unpaidExpenses),
      status: (core.unpaidExpenses < core.grossRevenue * 0.1 ? 'good' : core.unpaidExpenses < core.grossRevenue * 0.25 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: 'Unpaid supplier invoices',
      benchmark: 'Keep below 10% of monthly revenue',
    },
    {
      label: 'VAT Position',
      value: ZAR(Math.abs(core.vatPayable)),
      status: (core.vatPayable < 0 ? 'good' : core.vatPayable < core.grossRevenue * 0.05 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: core.vatPayable >= 0 ? 'Payable to SARS' : 'Refund due from SARS',
      benchmark: core.vatPayable >= 0 ? 'Ensure funds are set aside' : 'Submit claim to SARS',
    },
  ], [core])

  // ── Best / worst categories ──
  const bestCategories  = categoryAnalysis.filter(c => c.margin > 40).slice(0, 3)
  const worstCategories = categoryAnalysis.filter(c => c.revenue > 0 && c.margin < 20).slice(0, 3)

  // ── Year + FY options ──
  const allYears = useMemo(() => {
    const years = new Set<number>()
    cashUpSheets.forEach(s => years.add(sheetDate(s).getFullYear()))
    expenses.forEach(e => years.add(new Date(e.invoice_date).getFullYear()))
    years.add(now.getFullYear())
    return Array.from(years).sort((a, b) => b - a)
  }, [cashUpSheets, expenses])

  const fyOptions = useMemo(() =>
    Array.from(new Set(allYears.flatMap(y => [y-1, y]))).sort((a,b) => b-a).slice(0, 6),
  [allYears])

  if (loading) return (
    <div className="flex flex-col items-center gap-3 py-32 text-muted-foreground">
      <Loader2 className="w-7 h-7 animate-spin" />
      <p className="text-sm">Loading business data…</p>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
        <Header />
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Business Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Revenue · Profit · Expenses · VAT · Staff costs
            <span className="ml-2 opacity-60">· Updated {lastRefresh.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchAll}>
          <RefreshCw className="w-3.5 h-3.5" />Refresh
        </Button>
      </div>

      {/* ── Filter Bar ── */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(['month','quarter','fy','custom'] as FilterMode[]).map(m => (
            <button key={m} onClick={() => setFilterMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterMode === m ? 'bg-foreground text-background shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {m === 'month' ? 'Month' : m === 'quarter' ? 'Quarter' : m === 'fy' ? 'Financial Year' : 'Custom'}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground self-center">
            {filteredSheets.length} trading days · {filteredExpenses.length} invoices
          </span>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          {(filterMode === 'month' || filterMode === 'quarter') && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Year</Label>
              <Select value={String(filterYear)} onValueChange={v => setFilterYear(Number(v))}>
                <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{allYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {filterMode === 'month' && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Month</Label>
              <Select value={String(filterMonth)} onValueChange={v => setFilterMonth(Number(v))}>
                <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS_FULL.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {filterMode === 'quarter' && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Quarter</Label>
              <Select value={String(filterQuarter)} onValueChange={v => setFilterQuarter(Number(v))}>
                <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4].map(q => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {filterMode === 'fy' && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Financial Year (Mar–Feb)</Label>
              <Select value={String(filterFY)} onValueChange={v => setFilterFY(Number(v))}>
                <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{fyOptions.map(y => <SelectItem key={y} value={String(y)}>FY {y}/{String(y+1).slice(-2)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {filterMode === 'custom' && (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">From</Label>
                <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-8 text-xs w-36" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">To</Label>
                <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-8 text-xs w-36" />
              </div>
            </>
          )}
          <div className="self-end text-xs text-muted-foreground pb-1.5 font-mono">
            {range.from} → {range.to}
          </div>
        </div>
      </div>

      {/* ── Top KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Gross Revenue (incl. VAT)" value={ZAR(core.grossRevenue)} sub={`${core.sheetCount} trading days`} accent={BRAND.caramel} icon={TrendingUp} size="lg" />
        <KpiCard label="Revenue Excl. VAT" value={ZAR(core.revenueExclVat)} trendLabel={`Avg ${ZAR(Math.round(core.avgDailyRevenue))}/day`} accent={BRAND.coffee} icon={ShoppingCart} />
        <KpiCard label="Gross Profit" value={ZAR(core.grossProfit)} trendLabel={`${pct(core.grossMargin)} margin`} trend={core.grossMargin > 30 ? 'good-up' : 'bad-down'} accent={BRAND.sage} icon={DollarSign} />
        <KpiCard label="Net Profit" value={ZAR(core.netProfit)} trendLabel={`${pct(core.netMargin)} margin`} trend={core.netProfit > 0 ? 'good-up' : 'bad-down'} accent={core.netProfit > 0 ? BRAND.sage : BRAND.terracotta} icon={BarChart3} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Expenses (excl. VAT)" value={ZAR(core.totalExpensesExcl)} sub="Supplier invoices" accent={BRAND.terracotta} icon={Receipt} />
        <KpiCard label="Employee Costs" value={ZAR(core.employeeCosts)} sub={`${filteredPayslips.length} payslips`} trendLabel={core.revenueExclVat > 0 ? `${pct(core.employeeCosts/core.revenueExclVat*100)} of revenue` : undefined} trend={core.revenueExclVat > 0 && core.employeeCosts/core.revenueExclVat < 0.30 ? 'good-down' : 'bad-up'} accent={BRAND.wheat} icon={Users} />
        <KpiCard label="Stock on Hand (Closing)" value={ZAR(core.totalClStockValue)} sub={`Was ${ZAR(core.totalOpStockValue)}`} accent={BRAND.coffee} icon={Package} />
        <KpiCard label="Outstanding Payables" value={ZAR(core.unpaidExpenses)} trendLabel="Unpaid supplier invoices" trend={core.unpaidExpenses > 0 ? 'bad-up' : 'good-down'} accent={core.unpaidExpenses > 0 ? BRAND.terracotta : BRAND.sage} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-9 rounded-xl bg-muted p-1 flex-wrap">
          <TabsTrigger value="overview"   className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Overview</TabsTrigger>
          <TabsTrigger value="vat"        className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">VAT</TabsTrigger>
          <TabsTrigger value="revenue"    className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Revenue</TabsTrigger>
          <TabsTrigger value="expenses"   className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Expenses</TabsTrigger>
          <TabsTrigger value="stock"      className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Stock & Margin</TabsTrigger>
          <TabsTrigger value="staff"      className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Staff Costs</TabsTrigger>
          <TabsTrigger value="health"     className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Health Check</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="mt-5 space-y-5">

          {/* P&L Summary */}
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30">
              <p className="text-sm font-semibold">Profit & Loss Summary</p>
              <p className="text-xs text-muted-foreground">For the selected period</p>
            </div>
            <div className="divide-y">
              {[
                { label: 'Gross Revenue (incl. VAT)',    value: core.grossRevenue,      indent: 0, bold: false, color: BRAND.caramel },
                { label: 'Less: Output VAT',             value: -core.outputVat,        indent: 1, bold: false, color: undefined },
                { label: 'Revenue (excl. VAT)',          value: core.revenueExclVat,    indent: 0, bold: true,  color: BRAND.coffee },
                { label: 'Less: Cost of Goods Sold',     value: -core.cogs,             indent: 1, bold: false, color: undefined },
                { label: 'GROSS PROFIT',                 value: core.grossProfit,       indent: 0, bold: true,  color: core.grossProfit > 0 ? BRAND.sage : BRAND.terracotta },
                { label: `  Gross Margin`,               value: null,                   indent: 1, bold: false, pctVal: core.grossMargin, color: undefined },
                { label: 'Less: Operating Expenses',     value: -core.totalExpensesExcl, indent: 1, bold: false, color: undefined },
                { label: 'Less: Employee Costs',         value: -core.employeeCosts,    indent: 1, bold: false, color: undefined },
                { label: 'NET PROFIT / (LOSS)',          value: core.netProfit,         indent: 0, bold: true,  color: core.netProfit > 0 ? BRAND.sage : BRAND.terracotta },
                { label: `  Net Margin`,                 value: null,                   indent: 1, bold: false, pctVal: core.netMargin, color: undefined },
              ].map((row, i) => (
                <div key={i} className={`flex items-center justify-between px-5 py-2.5 ${row.bold ? 'bg-muted/20' : ''}`}>
                  <span className={`text-sm ${row.indent ? 'pl-4 text-muted-foreground' : 'font-semibold'}`}>{row.label}</span>
                  <span className={`text-sm tabular-nums font-${row.bold ? 'bold' : 'medium'}`}
                    style={{ color: row.value != null && row.color ? row.color : undefined }}>
                    {'pctVal' in row && row.pctVal != null
                      ? pct(row.pctVal)
                      : row.value != null
                        ? ZAR(row.value)
                        : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 12-month trend */}
          <div className="rounded-2xl border bg-card p-5">
            <SectionHeader title="12-Month Financial Trend" sub="Revenue vs expenses vs net profit" accent={BRAND.caramel} />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyTrend} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={ZARk} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue"   name="Revenue"    fill={BRAND.caramel}    radius={[3,3,0,0]} maxBarSize={28} stackId="a" />
                <Bar dataKey="expenses"  name="Expenses"   fill={BRAND.terracotta} radius={[0,0,0,0]} maxBarSize={28} />
                <Bar dataKey="wages"     name="Wages"      fill={BRAND.wheat}      radius={[0,0,0,0]} maxBarSize={28} />
                <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke={BRAND.sage} strokeWidth={2.5} dot={{ r: 3, fill: BRAND.sage }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Payment split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-card p-5">
              <SectionHeader title="Payment Method Split" sub="How customers are paying" accent={BRAND.coffee} />
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={paymentSplit} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {paymentSplit.map((_, i) => <Cell key={i} fill={PALETTE[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => ZAR(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5">
                {paymentSplit.map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[i] }} /><span className="text-muted-foreground">{p.name}</span></div>
                    <div className="flex items-center gap-2">
                      <span>{ZAR(p.value)}</span>
                      <span className="text-muted-foreground">{core.grossRevenue > 0 ? pct(p.value/core.grossRevenue*100) : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <SectionHeader title="Cost Structure" sub="Where money is going" accent={BRAND.terracotta} />
              <div className="space-y-3 mt-1">
                {[
                  { label: 'Cost of Goods (COGS)', value: core.cogs, color: BRAND.coffee },
                  { label: 'Operating Expenses',   value: core.totalExpensesExcl, color: BRAND.terracotta },
                  { label: 'Employee Wages',        value: core.employeeCosts, color: BRAND.wheat },
                ].map(item => {
                  const pctOfRev = core.revenueExclVat > 0 ? item.value / core.revenueExclVat * 100 : 0
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{item.label}</span>
                        <span className="tabular-nums">{ZAR(item.value)} <span className="text-muted-foreground">({pct(pctOfRev)})</span></span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pctOfRev)}%`, background: item.color }} />
                      </div>
                    </div>
                  )
                })}
                <div className="rounded-xl bg-muted/30 p-3 mt-2 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total outflows</span><span>{ZAR(core.cogs + core.totalExpensesExcl + core.employeeCosts)}</span></div>
                  <div className="flex justify-between font-semibold border-t pt-1"><span>Net retained</span><span style={{ color: core.netProfit > 0 ? BRAND.sage : BRAND.terracotta }}>{ZAR(core.netProfit)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── VAT TAB ── */}
        <TabsContent value="vat" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Output VAT (Charged on Sales)" value={ZAR(core.outputVat)} sub="VAT collected from customers" accent={BRAND.caramel} size="lg" />
            <KpiCard label="Input VAT (Paid on Expenses)" value={ZAR(core.inputVat)} sub="VAT paid to suppliers" accent={BRAND.sage} size="lg" />
            <KpiCard
              label={core.vatPayable >= 0 ? 'VAT Payable to SARS' : 'VAT Refund Due'}
              value={ZAR(Math.abs(core.vatPayable))}
              sub={core.vatPayable >= 0 ? 'Amount due to SARS' : 'Claim back from SARS'}
              trend={core.vatPayable >= 0 ? 'bad-up' : 'good-down'}
              accent={core.vatPayable >= 0 ? BRAND.terracotta : BRAND.sage}
              size="lg"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl border bg-card p-5">
              <SectionHeader title="VAT Breakdown" sub="Output vs Input VAT" accent={BRAND.caramel} />
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={vatData} cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {vatData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => ZAR(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {vatData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} /><span className="text-muted-foreground">{d.name}</span></div>
                    <span className="font-semibold tabular-nums">{ZAR(d.value)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex items-center justify-between text-xs font-bold">
                  <span>{core.vatPayable >= 0 ? 'Net payable to SARS' : 'Net refund from SARS'}</span>
                  <span style={{ color: core.vatPayable >= 0 ? BRAND.terracotta : BRAND.sage }}>{ZAR(Math.abs(core.vatPayable))}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <SectionHeader title="VAT Calculation Detail" sub="VAT-inclusive revenue at 15%" accent={BRAND.sage} />
              <div className="space-y-0 divide-y">
                {[
                  { label: 'Gross revenue (incl. VAT)',    value: core.grossRevenue,    note: 'From till Z-print' },
                  { label: 'Revenue excl. VAT ÷ 1.15',    value: core.revenueExclVat,  note: 'Tax base' },
                  { label: 'Output VAT (15%)',             value: core.outputVat,       note: 'Collected from customers' },
                  { label: 'Input VAT from expenses',      value: -core.inputVat,       note: 'Paid to VAT-registered suppliers' },
                  { label: 'VAT payable / (refundable)',   value: core.vatPayable,      note: core.vatPayable >= 0 ? 'Pay to SARS' : 'Claim from SARS', bold: true },
                ].map((row, i) => (
                  <div key={i} className={`flex items-start justify-between py-2.5 ${row.bold ? 'mt-1 pt-3 border-t-2 border-foreground/20' : ''}`}>
                    <div>
                      <p className={`text-sm ${row.bold ? 'font-bold' : ''}`}>{row.label}</p>
                      <p className="text-[10px] text-muted-foreground">{row.note}</p>
                    </div>
                    <span className={`text-sm tabular-nums ${row.bold ? 'font-bold' : 'font-medium'}`}
                      style={{ color: row.bold ? (core.vatPayable >= 0 ? BRAND.terracotta : BRAND.sage) : undefined }}>
                      {ZAR(row.value)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <strong>Note:</strong> Output VAT assumes all sales are VAT-inclusive at 15%. Zero-rated items (like brown bread) should be excluded. Consult your accountant for the precise VAT201 return.
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── REVENUE TAB ── */}
        <TabsContent value="revenue" className="mt-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total Revenue" value={ZAR(core.grossRevenue)} sub={`${core.sheetCount} days`} accent={BRAND.caramel} />
            <KpiCard label="Avg Daily Revenue" value={ZAR(core.avgDailyRevenue)} sub="From till totals" accent={BRAND.coffee} />
            <KpiCard label="Card / YOCO" value={ZAR(core.cardTotal)} sub={pct(core.grossRevenue > 0 ? core.cardTotal/core.grossRevenue*100 : 0)} accent={BRAND.wheat} />
            <KpiCard label="Cash" value={ZAR(core.cashTotal)} sub={pct(core.grossRevenue > 0 ? core.cashTotal/core.grossRevenue*100 : 0)} accent={BRAND.sage} />
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <SectionHeader title="Daily Revenue" sub="Till total per trading day" accent={BRAND.caramel} />
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dailyRevenue} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={BRAND.caramel} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={BRAND.caramel} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={ZARk} />
                <Tooltip content={<ChartTooltip />} />
                {core.avgDailyRevenue > 0 && <ReferenceLine y={core.avgDailyRevenue} stroke={BRAND.coffee} strokeDasharray="4 2" label={{ value: 'Avg', fontSize: 9, fill: BRAND.coffee, position: 'right' }} />}
                <Area type="monotone" dataKey="total" name="Revenue" stroke={BRAND.caramel} strokeWidth={2.5} fill="url(#revGrad)" dot={{ r: 3, fill: BRAND.caramel, stroke: '#fff', strokeWidth: 1.5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        {/* ── EXPENSES TAB ── */}
        <TabsContent value="expenses" className="mt-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total Expenses (excl. VAT)" value={ZAR(core.totalExpensesExcl)} accent={BRAND.terracotta} />
            <KpiCard label="Total Expenses (incl. VAT)" value={ZAR(core.totalExpensesIncl)} accent={BRAND.coffee} />
            <KpiCard label="Input VAT Recoverable" value={ZAR(core.inputVat)} accent={BRAND.sage} />
            <KpiCard label="Outstanding / Unpaid" value={ZAR(core.unpaidExpenses)} trend={core.unpaidExpenses > 0 ? 'bad-up' : 'good-down'} accent={core.unpaidExpenses > 0 ? BRAND.terracotta : BRAND.sage} />
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <SectionHeader title="Top 10 Suppliers by Spend" sub="Excl. VAT" accent={BRAND.terracotta} />
            <ResponsiveContainer width="100%" height={expenseBySupplier.length * 36 + 30}>
              <BarChart data={expenseBySupplier} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={ZARk} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="name" width={160} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total" name="Total spend" radius={[0,5,5,0]} maxBarSize={24}>
                  {expenseBySupplier.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-1">
              {expenseBySupplier.map((s, i) => (
                <div key={s.name} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-[10px] font-bold text-muted-foreground w-5 text-right">#{i+1}</span>
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-xs">{s.name}</span>
                    <span className="text-xs font-semibold tabular-nums">{ZAR(s.total)}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground w-10 text-right">{core.totalExpensesExcl > 0 ? pct(s.total/core.totalExpensesExcl*100) : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── STOCK & MARGIN ── */}
        <TabsContent value="stock" className="mt-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Opening Stock Value" value={ZAR(core.totalOpStockValue)} accent={BRAND.coffee} />
            <KpiCard label="Closing Stock Value" value={ZAR(core.totalClStockValue)} accent={BRAND.wheat} />
            <KpiCard label="Retail Revenue (Stock)" value={ZAR(core.stockRevenue)} accent={BRAND.caramel} />
            <KpiCard label="Est. COGS" value={ZAR(core.cogs)} sub="Opening + received − closing" accent={BRAND.terracotta} />
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30">
              <p className="text-sm font-semibold">Category Gross Profit Analysis</p>
              <p className="text-xs text-muted-foreground">Revenue vs cost of goods by category</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b bg-muted/20">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Category</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">COGS</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gross Profit</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Margin</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Health</th>
                </tr></thead>
                <tbody className="divide-y">
                  {categoryAnalysis.map(c => (
                    <tr key={c.name} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{c.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(c.revenue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{ZAR(c.cogs)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: c.grossProfit > 0 ? BRAND.sage : BRAND.terracotta }}>{ZAR(c.grossProfit)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${c.margin > 40 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : c.margin > 20 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          {pct(c.margin)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5"><HealthBadge status={c.margin > 40 ? 'good' : c.margin > 20 ? 'warning' : 'bad'} /></td>
                    </tr>
                  ))}
                  {categoryAnalysis.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No stock count data for this period.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── STAFF COSTS ── */}
        <TabsContent value="staff" className="mt-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total Nett Pay" value={ZAR(core.employeeCosts)} sub={`${filteredPayslips.length} payslips`} accent={BRAND.caramel} />
            <KpiCard label="UIF (Employee)" value={ZAR(core.uifTotal)} sub="1% of earnings" accent={BRAND.wheat} />
            <KpiCard label="Wages as % of Revenue" value={core.revenueExclVat > 0 ? pct(core.employeeCosts/core.revenueExclVat*100) : '—'} trend={core.revenueExclVat > 0 && core.employeeCosts/core.revenueExclVat < 0.30 ? 'good-down' : 'bad-up'} trendLabel={core.revenueExclVat > 0 && core.employeeCosts/core.revenueExclVat < 0.30 ? 'Within target' : 'Above 30%'} accent={BRAND.coffee} />
            <KpiCard label="Avg Pay per Payslip" value={filteredPayslips.length > 0 ? ZAR(core.employeeCosts/filteredPayslips.length) : '—'} accent={BRAND.sage} />
          </div>

          {employeeBreakdown.length > 0 ? (
            <div className="rounded-2xl border bg-card p-5">
              <SectionHeader title="Cost by Employee" sub="Nett pay for period" accent={BRAND.wheat} />
              <ResponsiveContainer width="100%" height={employeeBreakdown.length * 40 + 30}>
                <BarChart data={employeeBreakdown} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={ZARk} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis type="category" dataKey="name" width={140} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="total" name="Nett pay" radius={[0,5,5,0]} maxBarSize={28}>
                    {employeeBreakdown.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-1.5">
                {employeeBreakdown.map((e, i) => (
                  <div key={e.name} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="flex-1 text-sm">{e.name}</span>
                    <span className="text-sm font-semibold tabular-nums">{ZAR(e.total)}</span>
                    <span className="text-xs text-muted-foreground w-12 text-right">{core.employeeCosts > 0 ? pct(e.total/core.employeeCosts*100) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-8 flex flex-col items-center gap-2 text-muted-foreground">
              <Users className="w-10 h-10 opacity-20" />
              <p className="text-sm">No payslips recorded for this period.</p>
            </div>
          )}
        </TabsContent>

        {/* ── HEALTH CHECK ── */}
        <TabsContent value="health" className="mt-5 space-y-5">

          {/* Health indicators */}
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30">
              <p className="text-sm font-semibold">Business Health Indicators</p>
              <p className="text-xs text-muted-foreground">Key ratios and benchmarks for a healthy bakery/retail operation</p>
            </div>
            <div className="divide-y">
              {healthIndicators.map((h, i) => (
                <div key={i} className="px-5 py-3.5 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{h.label}</p>
                      <HealthBadge status={h.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{h.detail}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">{h.benchmark}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold tabular-nums">{h.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What's working / not working */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-emerald-50 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">What's Working</p>
              </div>
              <div className="divide-y">
                {[
                  ...(bestCategories.length > 0 ? bestCategories.map(c => ({
                    title: c.name,
                    detail: `${pct(c.margin)} gross margin · ${ZAR(c.revenue)} revenue`,
                    tag: 'High margin',
                  })) : [{ title: 'No high-margin categories yet', detail: 'Stock counts needed for margin data', tag: '—' }]),
                  ...(core.grossMargin > 30 ? [{ title: 'Gross margin is healthy', detail: `${pct(core.grossMargin)} — above the 30% benchmark`, tag: 'Margin' }] : []),
                  ...(core.netProfit > 0 ? [{ title: 'Business is profitable', detail: `Net profit of ${ZAR(core.netProfit)} this period`, tag: 'Profit' }] : []),
                  ...(core.cardTotal > core.cashTotal ? [{ title: 'Strong card payment adoption', detail: `${pct(core.cardTotal/core.grossRevenue*100)} of sales via card/YOCO`, tag: 'Payments' }] : []),
                ].slice(0, 5).map((item, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{item.tag}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-red-50 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <p className="text-sm font-semibold text-red-800">Needs Attention</p>
              </div>
              <div className="divide-y">
                {[
                  ...(worstCategories.length > 0 ? worstCategories.map(c => ({
                    title: c.name,
                    detail: `Only ${pct(c.margin)} gross margin — below 20% benchmark`,
                    tag: 'Low margin',
                    severity: 'bad',
                  })) : []),
                  ...(core.netProfit < 0 ? [{ title: 'Business is running at a loss', detail: `Net loss of ${ZAR(Math.abs(core.netProfit))} this period`, tag: 'Loss', severity: 'bad' }] : []),
                  ...(core.unpaidExpenses > core.grossRevenue * 0.15 ? [{ title: 'High unpaid supplier invoices', detail: `${ZAR(core.unpaidExpenses)} outstanding — above 15% of revenue`, tag: 'Payables', severity: 'warning' }] : []),
                  ...(core.revenueExclVat > 0 && core.employeeCosts/core.revenueExclVat > 0.35 ? [{ title: 'Wage costs above 35% of revenue', detail: `Wages are ${pct(core.employeeCosts/core.revenueExclVat*100)} of revenue — consider staffing review`, tag: 'Wages', severity: 'warning' }] : []),
                  ...(core.vatPayable > core.grossRevenue * 0.05 ? [{ title: 'Significant VAT liability', detail: `${ZAR(core.vatPayable)} owed to SARS — ensure funds reserved`, tag: 'VAT', severity: 'warning' }] : []),
                  ...(filteredSheets.length === 0 ? [{ title: 'No cash-up data for this period', detail: 'Revenue figures require daily cash-up sheets', tag: 'Data', severity: 'warning' }] : []),
                ].slice(0, 5).map((item, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${item.severity === 'bad' ? 'border-red-300 text-red-600' : 'border-amber-300 text-amber-600'}`}>{item.tag}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                  </div>
                ))}
                {[
                  ...worstCategories,
                  ...(core.netProfit < 0 ? ['loss'] : []),
                  ...(core.unpaidExpenses > core.grossRevenue * 0.15 ? ['unpaid'] : []),
                  ...(core.revenueExclVat > 0 && core.employeeCosts/core.revenueExclVat > 0.35 ? ['wages'] : []),
                ].length === 0 && (
                  <div className="px-4 py-8 text-center text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-60 mx-auto mb-2" />
                    <p className="text-sm">No critical issues found for this period.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Full financial summary table */}
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30">
              <p className="text-sm font-semibold">Full Financial Summary</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y">
                  {[
                    { label: 'REVENUE', value: '', section: true },
                    { label: 'Gross Revenue (incl. VAT)',    value: ZAR(core.grossRevenue) },
                    { label: 'Output VAT (15%)',             value: `(${ZAR(core.outputVat)})` },
                    { label: 'Revenue (excl. VAT)',          value: ZAR(core.revenueExclVat), bold: true },
                    { label: 'COSTS', value: '', section: true },
                    { label: 'Cost of Goods Sold (est.)',    value: ZAR(core.cogs) },
                    { label: 'GROSS PROFIT',                 value: ZAR(core.grossProfit), bold: true },
                    { label: 'Gross Margin',                 value: pct(core.grossMargin) },
                    { label: 'OPERATING EXPENSES', value: '', section: true },
                    { label: 'Supplier Expenses (excl. VAT)', value: ZAR(core.totalExpensesExcl) },
                    { label: 'Employee Costs (nett pay)',    value: ZAR(core.employeeCosts) },
                    { label: 'Total Operating Costs',        value: ZAR(core.totalExpensesExcl + core.employeeCosts), bold: true },
                    { label: 'PROFIT', value: '', section: true },
                    { label: 'Net Profit / (Loss)',          value: ZAR(core.netProfit), bold: true, color: core.netProfit > 0 ? BRAND.sage : BRAND.terracotta },
                    { label: 'Net Margin',                   value: pct(core.netMargin) },
                    { label: 'VAT', value: '', section: true },
                    { label: 'Output VAT',                   value: ZAR(core.outputVat) },
                    { label: 'Input VAT (recoverable)',      value: `(${ZAR(core.inputVat)})` },
                    { label: 'VAT Payable / (Refundable)',   value: ZAR(core.vatPayable), bold: true, color: core.vatPayable >= 0 ? BRAND.terracotta : BRAND.sage },
                    { label: 'OTHER', value: '', section: true },
                    { label: 'Unpaid Supplier Invoices',     value: ZAR(core.unpaidExpenses) },
                    { label: 'Closing Stock Value',          value: ZAR(core.totalClStockValue) },
                    { label: 'UIF (Employee Contribution)',  value: ZAR(core.uifTotal) },
                  ].map((row, i) => row.section
                    ? <tr key={i} className="bg-muted/30"><td colSpan={2} className="px-5 py-2 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{row.label}</td></tr>
                    : <tr key={i} className="hover:bg-muted/10">
                        <td className={`px-5 py-2 ${row.bold ? 'font-semibold' : 'text-muted-foreground pl-8'}`}>{row.label}</td>
                        <td className={`px-5 py-2 text-right tabular-nums ${row.bold ? 'font-semibold' : ''}`} style={{ color: row.color }}>{row.value}</td>
                      </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}