'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2,
  XCircle, BarChart3, DollarSign, ShoppingCart, Receipt,
  Users, Package, ArrowUpRight, ArrowDownRight, RefreshCw,
  Calendar, ChevronDown, Info, Loader2, Scale,
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
  payslip_type: string | null
  pay_type: string | null
  rate: string | number | null
  regular_hours: string | number | null
  regular_days: string | number | null
  regular_pay: string | number | null
  overtime_pay: string | number | null
  public_holiday_pay: string | number | null
  leave_pay: string | number | null
  bonus: string | number | null
  total_earnings: number
  uif_employee: number
  paye: number | null
  uif_employer?: number | null
  other_deductions: string | number | null
  other_deductions_label: string | null
  total_deductions: number
  nett_pay: number
  payout: string | number | null
  notes: string | null
  vb_employee?: { full_name: string } | null
}

interface Employee {
  employee_id: number
  full_name: string
  id_number: string | null
  job_position: string | null
  is_active: boolean
}

// ─── PAYE Tax Table (SARS 2025/2026) ─────────────────────────────────────────
const PAYE_TABLE: Array<{ from: number; to: number; under65: number; age65to74: number; age75plus: number }> = [
  { from: 8111, to: 8211,  under65: 0,   age65to74: 0, age75plus: 0 },
  { from: 8212, to: 8312,  under65: 2,   age65to74: 0, age75plus: 0 },
  { from: 8313, to: 8413,  under65: 20,  age65to74: 0, age75plus: 0 },
  { from: 8414, to: 8514,  under65: 39,  age65to74: 0, age75plus: 0 },
  { from: 8515, to: 8615,  under65: 57,  age65to74: 0, age75plus: 0 },
  { from: 8616, to: 8716,  under65: 75,  age65to74: 0, age75plus: 0 },
  { from: 8717, to: 8817,  under65: 93,  age65to74: 0, age75plus: 0 },
  { from: 8818, to: 8918,  under65: 111, age65to74: 0, age75plus: 0 },
  { from: 8919, to: 9019,  under65: 129, age65to74: 0, age75plus: 0 },
  { from: 9020, to: 9120,  under65: 148, age65to74: 0, age75plus: 0 },
  { from: 9121, to: 9221,  under65: 166, age65to74: 0, age75plus: 0 },
  { from: 9222, to: 9322,  under65: 184, age65to74: 0, age75plus: 0 },
  { from: 9323, to: 9423,  under65: 202, age65to74: 0, age75plus: 0 },
  { from: 9424, to: 9524,  under65: 220, age65to74: 0, age75plus: 0 },
  { from: 9525, to: 9625,  under65: 238, age65to74: 0, age75plus: 0 },
  { from: 9626, to: 9726,  under65: 257, age65to74: 0, age75plus: 0 },
  { from: 9727, to: 9827,  under65: 275, age65to74: 0, age75plus: 0 },
  { from: 9828, to: 9928,  under65: 293, age65to74: 0, age75plus: 0 },
]

function birthDateFromId(idNumber: string | null): Date | null {
  if (!idNumber || idNumber.length < 6) return null
  const yy = parseInt(idNumber.slice(0, 2), 10)
  const mm = parseInt(idNumber.slice(2, 4), 10) - 1
  const dd = parseInt(idNumber.slice(4, 6), 10)
  if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return null
  const fullYear = yy <= 24 ? 2000 + yy : 1900 + yy
  const d = new Date(fullYear, mm, dd)
  return isNaN(d.getTime()) ? null : d
}

function ageAtDate(birthDate: Date, refDate: Date): number {
  let age = refDate.getFullYear() - birthDate.getFullYear()
  const m = refDate.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && refDate.getDate() < birthDate.getDate())) age--
  return age
}

function lookupPaye(monthlyRemuneration: number, ageYears: number): number {
  const row = PAYE_TABLE.find(r => monthlyRemuneration >= r.from && monthlyRemuneration <= r.to)
  if (!row) return 0
  if (ageYears >= 75) return row.age75plus
  if (ageYears >= 65) return row.age65to74
  return row.under65
}

function calcPayslipPaye(
  totalEarnings: number,
  payslipType: string | null,
  employeeBirthDate: Date | null,
  payDate: string | null,
): number {
  if (payslipType !== 'monthly') return 0
  if (!employeeBirthDate) return 0
  const ref = payDate ? new Date(payDate) : new Date()
  const age = ageAtDate(employeeBirthDate, ref)
  return lookupPaye(totalEarnings, age)
}

function daysUntilBirthday(birthDate: Date, today: Date): number {
  const thisYear = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())
  if (thisYear < today) thisYear.setFullYear(today.getFullYear() + 1)
  const diff = thisYear.getTime() - today.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const ZAR = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n)
const ZARk = (n: number) =>
  Math.abs(n) >= 1000 ? `R${(n / 1000).toFixed(1)}k` : `R${Math.round(n)}`
const pct = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toFixed(1)}%`

function parseNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return parseFloat(String(v).replace(/,/g, '')) || 0
}

// ─── Till float adjustment ────────────────────────────────────────────────────
// total_cash includes a R1,000 float each day. Deduct it unless cash = 0.
const TILL_FLOAT = 1000
function adjustedCash(rawCash: number): number {
  return rawCash === 0 ? 0 : rawCash - TILL_FLOAT
}

// ─── Variance helpers ─────────────────────────────────────────────────────────
// variance = z - actual
//   negative → actual > z → green  → show "+R xxx"
//   positive → actual < z → red    → show "-R xxx"
//   near zero → balanced  → green  → show "R 0"
function varianceColor(variance: number): string {
  if (Math.abs(variance) < 1) return '#16a34a'
  return variance < 0 ? '#16a34a' : BRAND.terracotta
}
function varianceLabel(variance: number): string {
  if (Math.abs(variance) < 1) return ZAR(0)
  if (variance < 0) return `+${ZAR(Math.abs(variance))}`
  return `-${ZAR(Math.abs(variance))}`
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

// ─── Variance Badge ───────────────────────────────────────────────────────────
// variance = z - actual
//   negative → actual > z → green  "Actual over Z by R xxx"
//   positive → actual < z → red    "Actual short of Z by R xxx"
//   near zero → balanced
function VarianceBadge({ variance }: { variance: number }) {
  const abs = Math.abs(variance)
  if (abs < 1) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      <CheckCircle2 className="w-3 h-3" />Balanced
    </span>
  )
  if (variance < 0) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      <ArrowUpRight className="w-3 h-3" />Actual over Z by {ZAR(abs)}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      <ArrowDownRight className="w-3 h-3" />Actual short of Z by {ZAR(abs)}
    </span>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function BusinessDashboard() {
  const supabase = createClient()

  const [cashUpSheets, setCashUpSheets] = useState<CashUpSheet[]>([])
  const [expenses,     setExpenses]     = useState<Expense[]>([])
  const [retailCounts, setRetailCounts] = useState<RetailCount[]>([])
  const [payslips,     setPayslips]     = useState<Payslip[]>([])
  const [employees,    setEmployees]    = useState<Employee[]>([])
  const [loading,      setLoading]      = useState(true)
  const [lastRefresh,  setLastRefresh]  = useState(new Date())

  const now = new Date()
  const [filterMode,      setFilterMode]      = useState<FilterMode>('month')
  const [filterYear,      setFilterYear]      = useState(now.getFullYear())
  const [filterMonth,     setFilterMonth]     = useState(now.getMonth())
  const [filterQuarter,   setFilterQuarter]   = useState(Math.ceil((now.getMonth() + 1) / 3))
  const [filterFY,        setFilterFY]        = useState(now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1)
  const [customFrom,      setCustomFrom]      = useState('')
  const [customTo,        setCustomTo]        = useState('')
  const [payslipDateMode, setPayslipDateMode] = useState<'pay_date' | 'period_to'>('pay_date')

  const range = useMemo(() =>
    getRange(filterMode, filterYear, filterMonth, filterQuarter, filterFY, customFrom, customTo),
    [filterMode, filterYear, filterMonth, filterQuarter, filterFY, customFrom, customTo]
  )

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [sheets, exps, counts, slips, emps] = await Promise.all([
      supabase.from('cash_up_sheets').select('*').order('sheet_date', { ascending: false }),
      supabase.from('vb_expense').select('*, vb_supplier(company_name)'),
      supabase.from('vb_retail_stock_count_enriched').select('*'),
      supabase.from('vb_payslip').select('*, vb_employee(full_name)'),
      supabase.from('vb_employee').select('employee_id, full_name, id_number, job_position, is_active'),
    ])
    setCashUpSheets((sheets.data as CashUpSheet[]) ?? [])
    setExpenses((exps.data as Expense[]) ?? [])
    setRetailCounts((counts.data as RetailCount[]) ?? [])
    setPayslips((slips.data as Payslip[]) ?? [])
    setEmployees((emps.data as Employee[]) ?? [])
    setLoading(false)
    setLastRefresh(new Date())
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

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
    payslips.filter(p => {
      const dateStr = payslipDateMode === 'pay_date' ? (p.pay_date ?? p.period_to) : p.period_to
      return inRange(dateStr, range)
    }),
    [payslips, range, payslipDateMode]
  )

  // ─── Core calculations ────────────────────────────────────────────────────
  const core = useMemo(() => {

    // 1. Revenue
    const zRevenue       = filteredSheets.reduce((s, r) => s + parseNum(r.till_total_z_print), 0)
    const revenueExclVat = zRevenue / 1.15
    const outputVat      = zRevenue - revenueExclVat

    // 2. Actual received — cash net of R1,000 float
    const cashTotal      = filteredSheets.reduce((s, r) => s + adjustedCash(parseNum(r.total_cash)), 0)
    const cardTotal      = filteredSheets.reduce((s, r) => s + parseNum(r.credit_card_yoco), 0)
    const accountsTotal  = filteredSheets.reduce((s, r) => s + parseNum(r.charged_sales_accounts), 0)
    const actualReceived = cashTotal + cardTotal + accountsTotal
    // variance = z - actual
    // negative → actual > z (good) · positive → actual < z (short)
    const zVariance      = zRevenue - actualReceived

    // 3. Expenses
    const totalExpensesIncl = filteredExpenses.reduce((s, e) => s + Number(e.amount_incl_vat), 0)
    const totalExpensesExcl = filteredExpenses.reduce((s, e) => s + Number(e.amount_excl_vat), 0)
    const inputVat          = filteredExpenses.reduce((s, e) => s + Number(e.vat_amount), 0)
    const unpaidExpenses    = filteredExpenses.filter(e => !e.date_paid).reduce((s, e) => s + Number(e.amount_incl_vat), 0)

    // 4. COGS
    const totalOpStockValue = filteredCounts.reduce((s, c) => s + (c.op_stock_value ?? 0), 0)
    const totalClStockValue = filteredCounts.reduce((s, c) => s + (c.cl_stock_value ?? 0), 0)
    const stockPurchases    = filteredCounts.reduce((s, c) => s + (c.new_received ?? 0) * (c.cost_per_item ?? 0), 0)
    const cogs              = Math.max(0, totalOpStockValue + stockPurchases - totalClStockValue)
    const stockRevenue      = filteredCounts.reduce((s, c) => s + (c.revenue ?? 0), 0)

    // 5. Labour
    const nettPayTotal       = filteredPayslips.reduce((s, p) => s + Number(p.nett_pay ?? 0), 0)
    const uifEmployeeTotal   = filteredPayslips.reduce((s, p) => s + Number(p.uif_employee ?? 0), 0)
    const uifEmployerTotal   = filteredPayslips.reduce((s, p) => s + Number(p.uif_employer ?? 0), 0)
    const grossEarningsTotal = filteredPayslips.reduce((s, p) => s + Number(p.total_earnings ?? 0), 0)
    const payeTotal          = filteredPayslips.reduce((s, p) => s + Number(p.paye ?? 0), 0)
    const totalLabourCost    = nettPayTotal + payeTotal + uifEmployeeTotal + uifEmployerTotal

    // 6. Profit
    const grossProfit        = revenueExclVat - cogs
    const grossMargin        = revenueExclVat > 0 ? grossProfit / revenueExclVat * 100 : 0
    const operatingExpenses  = totalExpensesExcl
    const netProfitBeforeTax = grossProfit - operatingExpenses - totalLabourCost
    const netMargin          = revenueExclVat > 0 ? netProfitBeforeTax / revenueExclVat * 100 : 0
    const vatPayable         = outputVat - inputVat

    return {
      zRevenue, revenueExclVat, outputVat,
      cashTotal, cardTotal, accountsTotal, actualReceived, zVariance,
      totalExpensesIncl, totalExpensesExcl, inputVat, unpaidExpenses,
      vatPayable,
      totalOpStockValue, totalClStockValue, stockPurchases, cogs, stockRevenue,
      nettPayTotal, payeTotal, uifEmployeeTotal, uifEmployerTotal,
      grossEarningsTotal, totalLabourCost,
      grossProfit, grossMargin, operatingExpenses,
      netProfitBeforeTax, netMargin,
      sheetCount: filteredSheets.length,
      avgDailyRevenue: filteredSheets.length > 0 ? zRevenue / filteredSheets.length : 0,
    }
  }, [filteredSheets, filteredExpenses, filteredCounts, filteredPayslips])

  // ─── Monthly trend ────────────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { revenue: number; expenses: number; wages: number; netProfit: number }>()
    for (const s of cashUpSheets) {
      const key = dateKey(sheetDate(s))
      const cur = map.get(key) ?? { revenue: 0, expenses: 0, wages: 0, netProfit: 0 }
      cur.revenue += parseNum(s.till_total_z_print) / 1.15
      map.set(key, cur)
    }
    for (const e of expenses) {
      const key = e.invoice_date.slice(0, 7)
      const cur = map.get(key) ?? { revenue: 0, expenses: 0, wages: 0, netProfit: 0 }
      cur.expenses += Number(e.amount_excl_vat)
      map.set(key, cur)
    }
    for (const p of payslips) {
      const key = (p.pay_date ?? p.period_to).slice(0, 7)
      const cur = map.get(key) ?? { revenue: 0, expenses: 0, wages: 0, netProfit: 0 }
      cur.wages += Number(p.nett_pay ?? 0) + Number(p.paye ?? 0) + Number(p.uif_employee ?? 0) + Number(p.uif_employer ?? 0)
      map.set(key, cur)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, vals]) => {
        const [yr, mo] = key.split('-')
        return {
          name:      `${MONTHS_SHORT[parseInt(mo) - 1]} ${yr.slice(2)}`,
          revenue:   Math.round(vals.revenue),
          expenses:  Math.round(vals.expenses),
          wages:     Math.round(vals.wages),
          netProfit: Math.round(vals.revenue - vals.expenses - vals.wages),
        }
      })
  }, [cashUpSheets, expenses, payslips])

  // ─── Daily revenue ────────────────────────────────────────────────────────
  const dailyRevenue = useMemo(() =>
    filteredSheets
      .map(s => {
        const z      = parseNum(s.till_total_z_print)
        const cash   = adjustedCash(parseNum(s.total_cash))
        const card   = parseNum(s.credit_card_yoco)
        const accs   = parseNum(s.charged_sales_accounts)
        const actual = cash + card + accs
        return { date: sheetDate(s).toISOString().split('T')[0], zTotal: z, actual, variance: z - actual }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        name:     d.date.slice(5),
        zTotal:   Math.round(d.zTotal),
        actual:   Math.round(d.actual),
        variance: Math.round(d.variance),
      }))
  , [filteredSheets])

  // ─── Z vs Actual per-day detail ───────────────────────────────────────────
  const zActualDetail = useMemo(() =>
    filteredSheets
      .map(s => {
        const z      = parseNum(s.till_total_z_print)
        const cash   = adjustedCash(parseNum(s.total_cash))
        const card   = parseNum(s.credit_card_yoco)
        const accs   = parseNum(s.charged_sales_accounts)
        const actual = cash + card + accs
        return {
          date: sheetDate(s).toISOString().split('T')[0],
          z, cash, card, accounts: accs, actual,
          variance: z - actual,
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  , [filteredSheets])

  // ─── Expense breakdown ────────────────────────────────────────────────────
  const expenseBySupplier = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of filteredExpenses) {
      const name = e.vb_supplier?.company_name ?? 'Other / Bank fees'
      map.set(name, (map.get(name) ?? 0) + Number(e.amount_excl_vat))
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name: name.length > 24 ? name.slice(0, 22) + '…' : name, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [filteredExpenses])

  // ─── Category analysis ────────────────────────────────────────────────────
  const categoryAnalysis = useMemo(() => {
    const map = new Map<string, { revenue: number; opVal: number; clVal: number; purchases: number }>()
    for (const c of filteredCounts) {
      const k = c.category_name ?? 'Uncategorised'
      const e = map.get(k) ?? { revenue: 0, opVal: 0, clVal: 0, purchases: 0 }
      e.revenue   += c.revenue ?? 0
      e.opVal     += c.op_stock_value ?? 0
      e.clVal     += c.cl_stock_value ?? 0
      e.purchases += (c.new_received ?? 0) * (c.cost_per_item ?? 0)
      map.set(k, e)
    }
    return Array.from(map.entries()).map(([name, v]) => {
      const cogs   = Math.max(0, v.opVal + v.purchases - v.clVal)
      const gp     = v.revenue - cogs
      const margin = v.revenue > 0 ? gp / v.revenue * 100 : 0
      return { name, revenue: Math.round(v.revenue), cogs: Math.round(cogs), grossProfit: Math.round(gp), margin: Math.round(margin) }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [filteredCounts])

  // ─── Birthdays ────────────────────────────────────────────────────────────
  const upcomingBirthdays = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return employees
      .filter(e => e.is_active && e.id_number)
      .map(e => {
        const bd = birthDateFromId(e.id_number)
        if (!bd) return null
        const days = daysUntilBirthday(bd, today)
        const age  = ageAtDate(bd, today) + (days === 0 ? 0 : 1)
        return { employee_id: e.employee_id, full_name: e.full_name, job_position: e.job_position, days, age }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.days <= 7)
      .sort((a, b) => a.days - b.days)
  }, [employees])

  // ─── Employee breakdown ───────────────────────────────────────────────────
  const employeeBreakdown = useMemo(() => {
    const empMap = new Map<number, { birthDate: Date | null; name: string; jobPosition: string | null }>()
    for (const e of employees) {
      empMap.set(e.employee_id, { birthDate: birthDateFromId(e.id_number), name: e.full_name, jobPosition: e.job_position })
    }
    const map = new Map<number, { name: string; jobPosition: string | null; nett: number; paye: number; uifEmp: number; uifEmr: number; gross: number; isMonthly: boolean }>()
    for (const p of filteredPayslips) {
      const empInfo   = empMap.get(p.employee_id)
      const name      = empInfo?.name ?? p.vb_employee?.full_name ?? `Employee #${p.employee_id}`
      const birthDate = empInfo?.birthDate ?? null
      const earnings  = Number(p.total_earnings ?? 0)
      const isMonthly = p.payslip_type === 'monthly'
      const computedPaye = isMonthly ? calcPayslipPaye(earnings, p.payslip_type, birthDate, p.pay_date ?? p.period_to) : 0
      const payeAmount   = Number(p.paye ?? 0) > 0 ? Number(p.paye) : computedPaye
      const cur = map.get(p.employee_id) ?? { name, jobPosition: empInfo?.jobPosition ?? null, nett: 0, paye: 0, uifEmp: 0, uifEmr: 0, gross: 0, isMonthly }
      cur.nett      += Number(p.nett_pay ?? 0)
      cur.paye      += payeAmount
      cur.uifEmp    += Number(p.uif_employee ?? 0)
      cur.uifEmr    += Number(p.uif_employer ?? 0)
      cur.gross     += earnings
      cur.isMonthly  = cur.isMonthly || isMonthly
      map.set(p.employee_id, cur)
    }
    return Array.from(map.entries()).map(([empId, v]) => {
      const bd     = empMap.get(empId)?.birthDate
      const ageNow = bd ? ageAtDate(bd, new Date()) : null
      return {
        name: v.name, jobPosition: v.jobPosition,
        nett: Math.round(v.nett), paye: Math.round(v.paye),
        uifEmp: Math.round(v.uifEmp), uifEmr: Math.round(v.uifEmr),
        gross: Math.round(v.gross),
        totalCost: Math.round(v.nett + v.paye + v.uifEmp + v.uifEmr),
        isMonthly: v.isMonthly, age: ageNow,
      }
    }).sort((a, b) => b.totalCost - a.totalCost)
  }, [filteredPayslips, employees])

  const vatData = useMemo(() => [
    { name: 'Output VAT (Sales)',    value: Math.round(core.outputVat), color: BRAND.caramel },
    { name: 'Input VAT (Expenses)',  value: Math.round(core.inputVat),  color: BRAND.sage },
  ], [core])

  const paymentSplit = useMemo(() => [
    { name: 'Cash (net of float)', value: Math.round(core.cashTotal),     color: BRAND.coffee },
    { name: 'Card / YOCO',         value: Math.round(core.cardTotal),     color: BRAND.caramel },
    { name: 'Accounts',            value: Math.round(core.accountsTotal), color: BRAND.wheat },
  ].filter(p => p.value > 0), [core])

  const healthIndicators = useMemo(() => [
    {
      label: 'Gross Margin', value: pct(core.grossMargin),
      status: (core.grossMargin > 40 ? 'good' : core.grossMargin > 20 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: 'Revenue (excl. VAT) minus COGS', benchmark: '>40% is healthy for retail/bakery',
    },
    {
      label: 'Net Profit Before Tax', value: pct(core.netMargin),
      status: (core.netMargin > 15 ? 'good' : core.netMargin > 0 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: 'After COGS, overheads and all labour', benchmark: '>15% is strong',
    },
    {
      label: 'Labour Cost Ratio',
      value: core.revenueExclVat > 0 ? pct(core.totalLabourCost / core.revenueExclVat * 100) : '—',
      status: (core.revenueExclVat > 0 && core.totalLabourCost / core.revenueExclVat < 0.30 ? 'good' : core.revenueExclVat > 0 && core.totalLabourCost / core.revenueExclVat < 0.45 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: 'Total labour cost (incl. PAYE & UIF) as % of revenue', benchmark: '<30% of revenue is healthy',
    },
    {
      label: 'Expense Ratio',
      value: core.revenueExclVat > 0 ? pct(core.totalExpensesExcl / core.revenueExclVat * 100) : '—',
      status: (core.revenueExclVat > 0 && core.totalExpensesExcl / core.revenueExclVat < 0.60 ? 'good' : core.revenueExclVat > 0 && core.totalExpensesExcl / core.revenueExclVat < 0.80 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: 'Operating expenses as % of revenue', benchmark: '<60% means profitable operation',
    },
    {
      label: 'Outstanding Payables', value: ZAR(core.unpaidExpenses),
      status: (core.unpaidExpenses < core.zRevenue * 0.1 ? 'good' : core.unpaidExpenses < core.zRevenue * 0.25 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: 'Unpaid supplier invoices', benchmark: 'Keep below 10% of monthly revenue',
    },
    {
      label: 'VAT Position', value: ZAR(Math.abs(core.vatPayable)),
      status: (core.vatPayable < 0 ? 'good' : core.vatPayable < core.zRevenue * 0.05 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: core.vatPayable >= 0 ? 'Payable to SARS' : 'Refund due from SARS',
      benchmark: core.vatPayable >= 0 ? 'Ensure funds are set aside' : 'Submit claim to SARS',
    },
    {
      label: 'Z vs Actual Variance', value: varianceLabel(core.zVariance),
      status: (Math.abs(core.zVariance) < 10 ? 'good' : Math.abs(core.zVariance) < 100 ? 'warning' : 'bad') as 'good' | 'warning' | 'bad',
      detail: core.zVariance < 0 ? 'Actual received more than Z-print' : core.zVariance > 0 ? 'Actual received less than Z-print' : 'Perfectly balanced',
      benchmark: 'Variance should be near zero',
    },
  ], [core])

  const bestCategories  = categoryAnalysis.filter(c => c.margin > 40).slice(0, 3)
  const worstCategories = categoryAnalysis.filter(c => c.revenue > 0 && c.margin < 20).slice(0, 3)

  const allYears = useMemo(() => {
    const years = new Set<number>()
    cashUpSheets.forEach(s => years.add(sheetDate(s).getFullYear()))
    expenses.forEach(e => years.add(new Date(e.invoice_date).getFullYear()))
    years.add(now.getFullYear())
    return Array.from(years).sort((a, b) => b - a)
  }, [cashUpSheets, expenses])

  const fyOptions = useMemo(() =>
    Array.from(new Set(allYears.flatMap(y => [y - 1, y]))).sort((a, b) => b - a).slice(0, 6),
    [allYears]
  )

  if (loading) return (
    <div className="flex flex-col items-center gap-3 py-32 text-muted-foreground">
      <Loader2 className="w-7 h-7 animate-spin" />
      <p className="text-sm">Loading business data…</p>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      <Header />

      {/* Page header */}
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

      {/* Birthday notices */}
      {upcomingBirthdays.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎂</span>
            <p className="text-sm font-semibold text-amber-800">Upcoming Birthdays</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcomingBirthdays.map(b => (
              <div key={b.employee_id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2 shadow-sm">
                <div>
                  <p className="text-xs font-semibold text-amber-900">{b.full_name}</p>
                  <p className="text-[10px] text-amber-700">
                    {b.job_position && <span>{b.job_position} · </span>}
                    {b.days === 0
                      ? <span className="font-bold text-amber-600">🎉 Today! Turning {b.age}</span>
                      : b.days === 1 ? <span>Tomorrow · Turning {b.age}</span>
                      : <span>In {b.days} days · Turning {b.age}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
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
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Wages date basis</Label>
            <div className="flex gap-1">
              {([
                { val: 'pay_date',  label: 'Pay Date'  },
                { val: 'period_to', label: 'Period End' },
              ] as const).map(opt => (
                <button key={opt.val} onClick={() => setPayslipDateMode(opt.val)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all ${payslipDateMode === opt.val ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="self-end text-xs text-muted-foreground pb-1.5 font-mono">
            {range.from} → {range.to} · {filteredPayslips.length} payslips
          </div>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Z-Print Revenue (incl. VAT)" value={ZAR(core.zRevenue)} sub={`${core.sheetCount} trading days`} accent={BRAND.caramel} icon={TrendingUp} size="lg" />
        <KpiCard label="Revenue Excl. VAT" value={ZAR(core.revenueExclVat)} trendLabel={`Avg ${ZAR(Math.round(core.avgDailyRevenue / 1.15))}/day excl. VAT`} accent={BRAND.coffee} icon={ShoppingCart} />
        <KpiCard label="Gross Profit" value={ZAR(core.grossProfit)} trendLabel={`${pct(core.grossMargin)} margin`} trend={core.grossMargin > 30 ? 'good-up' : 'bad-down'} accent={BRAND.sage} icon={DollarSign} />
        <KpiCard label="Net Profit Before Tax" value={ZAR(core.netProfitBeforeTax)} trendLabel={`${pct(core.netMargin)} margin`} trend={core.netProfitBeforeTax > 0 ? 'good-up' : 'bad-down'} accent={core.netProfitBeforeTax > 0 ? BRAND.sage : BRAND.terracotta} icon={BarChart3} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Expenses (excl. VAT)" value={ZAR(core.totalExpensesExcl)} sub="Operating overheads" accent={BRAND.terracotta} icon={Receipt} />
        <KpiCard label="Total Labour Cost" value={ZAR(core.totalLabourCost)}
          sub={`Nett + PAYE + UIF · ${filteredPayslips.length} payslips`}
          trendLabel={core.revenueExclVat > 0 ? `${pct(core.totalLabourCost / core.revenueExclVat * 100)} of revenue` : undefined}
          trend={core.revenueExclVat > 0 && core.totalLabourCost / core.revenueExclVat < 0.30 ? 'good-down' : 'bad-up'}
          accent={BRAND.wheat} icon={Users} />
        <KpiCard label="Closing Stock Value" value={ZAR(core.totalClStockValue)} sub={`Opening was ${ZAR(core.totalOpStockValue)}`} accent={BRAND.coffee} icon={Package} />
        {/* Z vs Actual variance card */}
        <div className="rounded-2xl border bg-card p-4 relative overflow-hidden flex flex-col gap-1.5">
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: Math.abs(core.zVariance) < 10 ? BRAND.sage : BRAND.terracotta }} />
          <div className="flex items-start justify-between">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mt-0.5">Z vs Actual Variance</p>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-muted shrink-0"><Scale className="w-3.5 h-3.5 text-muted-foreground" /></div>
          </div>
          <p className="font-bold tabular-nums text-xl leading-tight" style={{ color: varianceColor(core.zVariance) }}>
            {varianceLabel(core.zVariance)}
          </p>
          <VarianceBadge variance={core.zVariance} />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-9 rounded-xl bg-muted p-1 flex-wrap">
          <TabsTrigger value="overview"  className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Overview</TabsTrigger>
          <TabsTrigger value="revenue"   className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Revenue & Z</TabsTrigger>
          <TabsTrigger value="vat"       className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">VAT</TabsTrigger>
          <TabsTrigger value="expenses"  className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Expenses</TabsTrigger>
          <TabsTrigger value="stock"     className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Stock & COGS</TabsTrigger>
          <TabsTrigger value="staff"     className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Staff & PAYE</TabsTrigger>
          <TabsTrigger value="health"    className="rounded-lg text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">Health Check</TabsTrigger>
        </TabsList>

        {/* ══ OVERVIEW ══════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="mt-5 space-y-5">

          {/* P&L */}
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30">
              <p className="text-sm font-semibold">Profit & Loss Statement</p>
              <p className="text-xs text-muted-foreground">For the selected period · All figures excl. VAT unless stated</p>
            </div>
            <div className="divide-y">
              {[
                { label: 'Z-Print Revenue (incl. VAT)',            value: core.zRevenue,            indent: false, bold: false, note: 'From till Z-print totals' },
                { label: 'Less: Output VAT (÷ 1.15)',              value: -core.outputVat,          indent: true,  bold: false, note: '15% VAT on sales' },
                { label: 'REVENUE (excl. VAT)',                    value: core.revenueExclVat,      indent: false, bold: true,  note: 'Trading revenue',            color: BRAND.caramel },
                { label: 'Less: Cost of Goods Sold (COGS)',        value: -core.cogs,               indent: true,  bold: false, note: 'Opening stock + purchases − closing stock (excl. VAT)' },
                { label: 'GROSS PROFIT',                           value: core.grossProfit,         indent: false, bold: true,  note: `Margin: ${pct(core.grossMargin)}`, color: core.grossProfit > 0 ? BRAND.sage : BRAND.terracotta },
                { label: 'Less: Operating Expenses',               value: -core.totalExpensesExcl,  indent: true,  bold: false, note: 'Supplier invoices excl. VAT' },
                { label: 'Less: Labour Cost (Wages & PAYE + UIF)', value: -core.totalLabourCost,    indent: true,  bold: false, note: `Nett pay ${ZAR(core.nettPayTotal)} + PAYE ${ZAR(core.payeTotal)} + UIF ${ZAR(core.uifEmployeeTotal + core.uifEmployerTotal)}` },
                { label: 'NET PROFIT BEFORE TAX',                  value: core.netProfitBeforeTax,  indent: false, bold: true,  note: `Margin: ${pct(core.netMargin)}`, color: core.netProfitBeforeTax > 0 ? BRAND.sage : BRAND.terracotta },
              ].map((row, i) => (
                <div key={i} className={`flex items-start justify-between px-5 py-2.5 gap-4 ${row.bold ? 'bg-muted/20' : ''}`}>
                  <div>
                    <span className={`text-sm ${row.indent ? 'pl-4 text-muted-foreground' : 'font-semibold'}`}>{row.label}</span>
                    {row.note && <p className="text-[10px] text-muted-foreground/70 pl-4">{row.note}</p>}
                  </div>
                  <span className={`text-sm tabular-nums shrink-0 ${row.bold ? 'font-bold' : 'font-medium'}`}
                    style={{ color: row.bold && 'color' in row ? (row as any).color : undefined }}>
                    {ZAR(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 12-month trend */}
          <div className="rounded-2xl border bg-card p-5">
            <SectionHeader title="12-Month Financial Trend" sub="Revenue (excl. VAT) vs expenses vs net profit" accent={BRAND.caramel} />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyTrend} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={ZARk} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue"  name="Revenue (excl. VAT)" fill={BRAND.caramel}    radius={[3,3,0,0]} maxBarSize={28} />
                <Bar dataKey="expenses" name="Expenses"            fill={BRAND.terracotta} radius={[0,0,0,0]} maxBarSize={28} />
                <Bar dataKey="wages"    name="Labour Cost"         fill={BRAND.wheat}      radius={[0,0,0,0]} maxBarSize={28} />
                <Line type="monotone" dataKey="netProfit" name="Net Profit BT" stroke={BRAND.sage} strokeWidth={2.5} dot={{ r: 3, fill: BRAND.sage }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Payment split + Cost structure */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-card p-5">
              <SectionHeader title="Payment Method Split" sub="Cash shown net of R1,000 float" accent={BRAND.coffee} />
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
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[i] }} />
                      <span className="text-muted-foreground">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{ZAR(p.value)}</span>
                      <span className="text-muted-foreground">{core.actualReceived > 0 ? pct(p.value / core.actualReceived * 100) : '—'}</span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Z-Print Total</span><span>{ZAR(core.zRevenue)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Actual Received (net of floats)</span><span>{ZAR(core.actualReceived)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Variance (Z − Actual)</span>
                  <span style={{ color: varianceColor(core.zVariance) }}>{varianceLabel(core.zVariance)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <SectionHeader title="Cost Structure" sub="Where money is going (excl. VAT)" accent={BRAND.terracotta} />
              <div className="space-y-3 mt-1">
                {[
                  { label: 'Cost of Goods (COGS)', value: core.cogs,              color: BRAND.coffee },
                  { label: 'Operating Expenses',   value: core.totalExpensesExcl, color: BRAND.terracotta },
                  { label: 'Labour (Nett Pay)',     value: core.nettPayTotal,      color: BRAND.wheat },
                  { label: 'PAYE',                 value: core.payeTotal,         color: BRAND.caramel },
                  { label: 'UIF (Emp + Employer)',  value: core.uifEmployeeTotal + core.uifEmployerTotal, color: BRAND.sage },
                ].map(item => {
                  const p = core.revenueExclVat > 0 ? item.value / core.revenueExclVat * 100 : 0
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{item.label}</span>
                        <span className="tabular-nums">{ZAR(item.value)} <span className="text-muted-foreground">({pct(p)})</span></span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, p)}%`, background: item.color }} />
                      </div>
                    </div>
                  )
                })}
                <div className="rounded-xl bg-muted/30 p-3 mt-2 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total outflows</span><span>{ZAR(core.cogs + core.totalExpensesExcl + core.totalLabourCost)}</span></div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Net retained (before tax)</span>
                    <span style={{ color: core.netProfitBeforeTax > 0 ? BRAND.sage : BRAND.terracotta }}>{ZAR(core.netProfitBeforeTax)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ══ REVENUE & Z ═══════════════════════════════════════════════════ */}
        <TabsContent value="revenue" className="mt-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Z-Print Total (incl. VAT)" value={ZAR(core.zRevenue)} sub={`${core.sheetCount} days`} accent={BRAND.caramel} />
            <KpiCard label="Revenue Excl. VAT" value={ZAR(core.revenueExclVat)} sub="Trading revenue" accent={BRAND.coffee} />
            <KpiCard label="Actual Received" value={ZAR(core.actualReceived)} sub="Cash (net float) + Card + Accounts" accent={BRAND.wheat} />
            <div className="rounded-2xl border bg-card p-4 relative overflow-hidden flex flex-col gap-1.5">
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: Math.abs(core.zVariance) < 10 ? BRAND.sage : BRAND.terracotta }} />
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Period Z Variance</p>
              <p className="font-bold tabular-nums text-xl" style={{ color: varianceColor(core.zVariance) }}>
                {varianceLabel(core.zVariance)}
              </p>
              <p className="text-xs text-muted-foreground">
                {core.zVariance < 0 ? 'Actual over Z-print' : core.zVariance > 0 ? 'Actual short of Z-print' : 'Perfectly balanced'}
              </p>
            </div>
          </div>

          {/* Daily chart */}
          <div className="rounded-2xl border bg-card p-5">
            <SectionHeader title="Daily Z-Print vs Actual Received" sub="Z incl. VAT · Cash shown net of R1,000 float" accent={BRAND.caramel} />
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dailyRevenue} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={ZARk} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="zTotal"  name="Z-Print"                     fill={BRAND.caramel} radius={[3,3,0,0]} maxBarSize={24} />
                <Bar dataKey="actual"  name="Actual Received (net float)"  fill={BRAND.coffee}  radius={[3,3,0,0]} maxBarSize={24} />
                <Line type="monotone" dataKey="variance" name="Variance" stroke={BRAND.terracotta} strokeWidth={2} dot={{ r: 3 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-day table */}
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30">
              <p className="text-sm font-semibold">Daily Z vs Actual Breakdown</p>
              <p className="text-xs text-muted-foreground">Cash shown net of R1,000 till float · + means actual over Z · − means actual short of Z</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Z-Print</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Cash (net float)</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Card / YOCO</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Accounts</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actual Total</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Variance</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {zActualDetail.map(d => (
                    <tr key={d.date} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{d.date}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(d.z)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{ZAR(d.cash)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{ZAR(d.card)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{ZAR(d.accounts)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{ZAR(d.actual)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold"
                        style={{ color: varianceColor(d.variance) }}>
                        {varianceLabel(d.variance)}
                      </td>
                      <td className="px-4 py-2.5"><VarianceBadge variance={d.variance} /></td>
                    </tr>
                  ))}
                  {zActualDetail.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No cash-up data for this period.</td></tr>
                  )}
                </tbody>
                {zActualDetail.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/30 font-semibold border-t-2">
                      <td className="px-4 py-2.5">TOTALS</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.zRevenue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.cashTotal)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.cardTotal)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.accountsTotal)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.actualReceived)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: varianceColor(core.zVariance) }}>
                        {varianceLabel(core.zVariance)}
                      </td>
                      <td className="px-4 py-2.5"><VarianceBadge variance={core.zVariance} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ══ VAT ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="vat" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Output VAT (Charged on Sales)" value={ZAR(core.outputVat)} sub="VAT collected from customers" accent={BRAND.caramel} size="lg" />
            <KpiCard label="Input VAT (Paid on Expenses)"  value={ZAR(core.inputVat)}  sub="VAT paid to suppliers"       accent={BRAND.sage}    size="lg" />
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
              <div className="divide-y">
                {[
                  { label: 'Z-Print revenue (incl. VAT)', value: core.zRevenue,       note: 'From till Z-print' },
                  { label: 'Revenue excl. VAT (÷ 1.15)',  value: core.revenueExclVat, note: 'Tax base' },
                  { label: 'Output VAT (15%)',            value: core.outputVat,      note: 'Collected from customers' },
                  { label: 'Input VAT from expenses',     value: -core.inputVat,      note: 'Paid to VAT-registered suppliers' },
                  { label: 'VAT payable / (refundable)',  value: core.vatPayable,     note: core.vatPayable >= 0 ? 'Pay to SARS' : 'Claim from SARS', bold: true },
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
                <strong>Note:</strong> Output VAT assumes all Z-print sales are VAT-inclusive at 15%. Zero-rated items (e.g. brown bread) should be excluded. Consult your accountant for the precise VAT201 return.
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ══ EXPENSES ══════════════════════════════════════════════════════ */}
        <TabsContent value="expenses" className="mt-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total Expenses (excl. VAT)" value={ZAR(core.totalExpensesExcl)} accent={BRAND.terracotta} />
            <KpiCard label="Total Expenses (incl. VAT)" value={ZAR(core.totalExpensesIncl)} accent={BRAND.coffee} />
            <KpiCard label="Input VAT Recoverable"      value={ZAR(core.inputVat)}          accent={BRAND.sage} />
            <KpiCard label="Outstanding / Unpaid"       value={ZAR(core.unpaidExpenses)} trend={core.unpaidExpenses > 0 ? 'bad-up' : 'good-down'} accent={core.unpaidExpenses > 0 ? BRAND.terracotta : BRAND.sage} />
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
                  <span className="text-[10px] text-muted-foreground w-10 text-right">{core.totalExpensesExcl > 0 ? pct(s.total / core.totalExpensesExcl * 100) : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ══ STOCK & COGS ══════════════════════════════════════════════════ */}
        <TabsContent value="stock" className="mt-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Opening Stock Value"          value={ZAR(core.totalOpStockValue)} accent={BRAND.coffee} />
            <KpiCard label="Stock Purchases (excl. VAT)"  value={ZAR(core.stockPurchases)}    sub="New received × cost/item" accent={BRAND.wheat} />
            <KpiCard label="Closing Stock Value"          value={ZAR(core.totalClStockValue)} accent={BRAND.caramel} />
            <KpiCard label="COGS" value={ZAR(core.cogs)} sub="Opening + Purchases − Closing"
              trendLabel={core.revenueExclVat > 0 ? `${pct(core.cogs / core.revenueExclVat * 100)} of revenue` : undefined}
              accent={BRAND.terracotta} />
          </div>
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30">
              <p className="text-sm font-semibold">COGS Calculation</p>
              <p className="text-xs text-muted-foreground">Opening Stock + Purchases − Closing Stock = Cost of Goods Sold</p>
            </div>
            <div className="divide-y">
              {[
                { label: 'Opening Stock Value',       value: core.totalOpStockValue,  note: 'Stock on hand at start of period (excl. VAT)',      bold: false },
                { label: 'Plus: Stock Purchases',     value: core.stockPurchases,     note: 'New received × cost per item (excl. VAT)',           bold: false },
                { label: 'Less: Closing Stock Value', value: -core.totalClStockValue, note: 'Stock remaining at end of period (excl. VAT)',       bold: false },
                { label: 'COST OF GOODS SOLD',        value: core.cogs,               note: `= ${pct(core.revenueExclVat > 0 ? core.cogs / core.revenueExclVat * 100 : 0)} of revenue excl. VAT`, bold: true },
              ].map((row, i) => (
                <div key={i} className={`flex items-start justify-between px-5 py-2.5 gap-4 ${row.bold ? 'bg-muted/20' : ''}`}>
                  <div>
                    <p className={`text-sm ${row.bold ? 'font-bold' : 'text-muted-foreground pl-4'}`}>{row.label}</p>
                    <p className="text-[10px] text-muted-foreground/70 pl-4">{row.note}</p>
                  </div>
                  <span className={`text-sm tabular-nums shrink-0 ${row.bold ? 'font-bold' : 'font-medium'}`} style={{ color: row.bold ? BRAND.coffee : undefined }}>
                    {ZAR(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30">
              <p className="text-sm font-semibold">Category Gross Profit Analysis</p>
              <p className="text-xs text-muted-foreground">COGS = Opening + Purchases − Closing per category</p>
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

        {/* ══ STAFF & PAYE ══════════════════════════════════════════════════ */}
        <TabsContent value="staff" className="mt-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Gross Earnings"       value={ZAR(core.grossEarningsTotal)} sub="Total before deductions"  accent={BRAND.caramel} />
            <KpiCard label="Nett Pay (Take-home)" value={ZAR(core.nettPayTotal)}       sub={`${filteredPayslips.length} payslips`} accent={BRAND.wheat} />
            <KpiCard label="PAYE (Income Tax)"    value={ZAR(core.payeTotal)}          sub="Employee income tax"       accent={BRAND.terracotta} />
            <KpiCard label="UIF"                  value={ZAR(core.uifEmployeeTotal + core.uifEmployerTotal)} sub={`Emp: ${ZAR(core.uifEmployeeTotal)} · Emr: ${ZAR(core.uifEmployerTotal)}`} accent={BRAND.coffee} />
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30">
              <p className="text-sm font-semibold">Labour Cost Summary</p>
              <p className="text-xs text-muted-foreground">Full cost breakdown including PAYE and UIF</p>
            </div>
            <div className="divide-y">
              {[
                { label: 'Gross Earnings (before deductions)', value: core.grossEarningsTotal,  note: 'Total earnings per payslips',                    indent: false, bold: false },
                { label: 'Less: PAYE (employee income tax)',   value: -core.payeTotal,           note: 'Withheld by employer, paid to SARS',              indent: true,  bold: false },
                { label: 'Less: UIF (employee contribution)',  value: -core.uifEmployeeTotal,    note: '1% of earnings',                                 indent: true,  bold: false },
                { label: 'Nett Pay (employee take-home)',      value: core.nettPayTotal,         note: 'What employees receive',                         indent: false, bold: false },
                { label: 'Plus: UIF (employer contribution)',  value: core.uifEmployerTotal,     note: '1% matched by employer — additional cost',       indent: true,  bold: false },
                { label: 'TOTAL LABOUR COST TO COMPANY',      value: core.totalLabourCost,      note: 'Nett pay + PAYE + UIF (both sides)',              indent: false, bold: true  },
              ].map((row, i) => (
                <div key={i} className={`flex items-start justify-between px-5 py-2.5 gap-4 ${row.bold ? 'bg-muted/20' : ''}`}>
                  <div>
                    <p className={`text-sm ${row.indent ? 'pl-4 text-muted-foreground' : row.bold ? 'font-bold' : 'font-medium'}`}>{row.label}</p>
                    <p className="text-[10px] text-muted-foreground/70 pl-4">{row.note}</p>
                  </div>
                  <span className={`text-sm tabular-nums shrink-0 ${row.bold ? 'font-bold' : 'font-medium'}`}
                    style={{ color: row.bold ? BRAND.coffee : undefined }}>
                    {ZAR(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">PAYE Summary</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Total PAYE withheld</span><span className="font-semibold tabular-nums">{ZAR(core.payeTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">As % of gross earnings</span><span className="font-semibold">{core.grossEarningsTotal > 0 ? pct(core.payeTotal / core.grossEarningsTotal * 100) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payslips included</span><span className="font-semibold">{filteredPayslips.length}</span></div>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[10px] text-amber-800">
                PAYE must be paid to SARS by the 7th of the following month (EMP201).
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">UIF Summary</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Employee UIF (1%)</span><span className="font-semibold tabular-nums">{ZAR(core.uifEmployeeTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Employer UIF (1%)</span><span className="font-semibold tabular-nums">{ZAR(core.uifEmployerTotal)}</span></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Total UIF to pay</span><span className="tabular-nums">{ZAR(core.uifEmployeeTotal + core.uifEmployerTotal)}</span></div>
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">SARS Statutory Payments</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">PAYE</span><span className="font-semibold tabular-nums">{ZAR(core.payeTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">UIF (total)</span><span className="font-semibold tabular-nums">{ZAR(core.uifEmployeeTotal + core.uifEmployerTotal)}</span></div>
                <div className="flex justify-between border-t pt-2 font-bold" style={{ color: BRAND.terracotta }}>
                  <span>Total due to SARS</span>
                  <span className="tabular-nums">{ZAR(core.payeTotal + core.uifEmployeeTotal + core.uifEmployerTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {employeeBreakdown.length > 0 ? (
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b bg-muted/30">
                <p className="text-sm font-semibold">Per-Employee Breakdown</p>
                <p className="text-xs text-muted-foreground">Nett pay · PAYE · UIF · Total cost to company</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b bg-muted/20">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Age</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gross Earnings</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Nett Pay</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">PAYE</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">UIF (Emp)</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">UIF (Emr)</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total Cost</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">% of Labour</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {employeeBreakdown.map((e, i) => (
                      <tr key={e.name} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <div>
                              <span>{e.name}</span>
                              {e.jobPosition && <span className="ml-1 text-[10px] text-muted-foreground">({e.jobPosition})</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {e.age != null ? (
                            <span className={e.age >= 75 ? 'text-purple-600 font-semibold' : e.age >= 65 ? 'text-blue-600 font-semibold' : ''}>
                              {e.age}{e.age >= 75 ? ' (75+)' : e.age >= 65 ? ' (65–74)' : ''}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{ZAR(e.gross)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(e.nett)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {e.isMonthly
                            ? e.paye > 0
                              ? <span style={{ color: BRAND.terracotta }} className="font-semibold">{ZAR(e.paye)}</span>
                              : <span className="text-muted-foreground text-xs">R0 (below threshold)</span>
                            : <span className="text-muted-foreground text-xs">Weekly — n/a</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{ZAR(e.uifEmp)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{ZAR(e.uifEmr)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{ZAR(e.totalCost)}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{core.totalLabourCost > 0 ? pct(e.totalCost / core.totalLabourCost * 100) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 font-semibold border-t-2">
                      <td className="px-4 py-2.5">TOTALS</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">—</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.grossEarningsTotal)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.nettPayTotal)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.payeTotal)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.uifEmployeeTotal)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.uifEmployerTotal)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ZAR(core.totalLabourCost)}</td>
                      <td className="px-4 py-2.5 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="p-4">
                <ResponsiveContainer width="100%" height={employeeBreakdown.length * 40 + 30}>
                  <BarChart data={employeeBreakdown} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={ZARk} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis type="category" dataKey="name" width={130} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="nett"   name="Nett Pay"  stackId="a" fill={BRAND.wheat}      radius={[0,0,0,0]} maxBarSize={24} />
                    <Bar dataKey="paye"   name="PAYE"      stackId="a" fill={BRAND.terracotta} radius={[0,0,0,0]} maxBarSize={24} />
                    <Bar dataKey="uifEmp" name="UIF (Emp)" stackId="a" fill={BRAND.sage}       radius={[0,3,3,0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-8 flex flex-col items-center gap-2 text-muted-foreground">
              <Users className="w-10 h-10 opacity-20" />
              <p className="text-sm">No payslips recorded for this period.</p>
              <p className="text-xs opacity-70">Add payslips with PAYE and UIF values to see the full breakdown.</p>
            </div>
          )}
        </TabsContent>

        {/* ══ HEALTH CHECK ══════════════════════════════════════════════════ */}
        <TabsContent value="health" className="mt-5 space-y-5">
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
                  <p className="text-base font-bold tabular-nums shrink-0">{h.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-emerald-50 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">What's Working</p>
              </div>
              <div className="divide-y">
                {[
                  ...(bestCategories.length > 0
                    ? bestCategories.map(c => ({ title: c.name, detail: `${pct(c.margin)} gross margin · ${ZAR(c.revenue)} revenue`, tag: 'High margin' }))
                    : [{ title: 'No high-margin categories yet', detail: 'Stock counts needed for margin data', tag: '—' }]),
                  ...(core.grossMargin > 30       ? [{ title: 'Gross margin is healthy',        detail: `${pct(core.grossMargin)} — above the 30% benchmark`,                            tag: 'Margin'   }] : []),
                  ...(core.netProfitBeforeTax > 0  ? [{ title: 'Business is profitable',         detail: `Net profit before tax of ${ZAR(core.netProfitBeforeTax)} this period`,          tag: 'Profit'   }] : []),
                  ...(Math.abs(core.zVariance) < 10 ? [{ title: 'Z-print closely matches actual', detail: `Variance of only ${varianceLabel(core.zVariance)} — excellent cash-up accuracy`, tag: 'Z Balance' }] : []),
                  ...(core.cardTotal > core.cashTotal ? [{ title: 'Strong card payment adoption', detail: `${pct(core.cardTotal / core.actualReceived * 100)} of actual receipts via card/YOCO`, tag: 'Payments' }] : []),
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
                  ...(worstCategories.length > 0 ? worstCategories.map(c => ({ title: c.name, detail: `Only ${pct(c.margin)} gross margin — below 20% benchmark`, tag: 'Low margin', severity: 'bad' })) : []),
                  ...(core.netProfitBeforeTax < 0     ? [{ title: 'Business is running at a loss',    detail: `Net loss of ${ZAR(Math.abs(core.netProfitBeforeTax))} this period`,          tag: 'Loss',      severity: 'bad'     }] : []),
                  ...(Math.abs(core.zVariance) > 100  ? [{ title: 'Large Z vs actual variance',       detail: `${varianceLabel(core.zVariance)} difference — investigate cash-up`,           tag: 'Z Variance', severity: 'bad'    }] : []),
                  ...(core.unpaidExpenses > core.zRevenue * 0.15 ? [{ title: 'High unpaid supplier invoices', detail: `${ZAR(core.unpaidExpenses)} outstanding — above 15% of revenue`, tag: 'Payables', severity: 'warning' }] : []),
                  ...(core.revenueExclVat > 0 && core.totalLabourCost / core.revenueExclVat > 0.35 ? [{ title: 'Labour costs above 35% of revenue', detail: `Labour is ${pct(core.totalLabourCost / core.revenueExclVat * 100)} of revenue — consider review`, tag: 'Labour', severity: 'warning' }] : []),
                  ...(core.vatPayable > core.zRevenue * 0.05 ? [{ title: 'Significant VAT liability', detail: `${ZAR(core.vatPayable)} owed to SARS — ensure funds reserved`, tag: 'VAT', severity: 'warning' }] : []),
                  ...(filteredSheets.length === 0 ? [{ title: 'No cash-up data for this period', detail: 'Revenue figures require daily cash-up sheets', tag: 'Data', severity: 'warning' }] : []),
                ].slice(0, 6).map((item, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${item.severity === 'bad' ? 'border-red-300 text-red-600' : 'border-amber-300 text-amber-600'}`}>{item.tag}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                  </div>
                ))}
                {worstCategories.length === 0 && core.netProfitBeforeTax >= 0 && Math.abs(core.zVariance) <= 100 && (
                  <div className="px-4 py-8 text-center text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-60 mx-auto mb-2" />
                    <p className="text-sm">No critical issues found for this period.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Full financial summary */}
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30">
              <p className="text-sm font-semibold">Full Financial Summary</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y">
                  {[
                    { label: 'REVENUE',                             value: '',                            section: true },
                    { label: 'Z-Print Revenue (incl. VAT)',         value: ZAR(core.zRevenue) },
                    { label: 'Output VAT (÷ 1.15)',                 value: `(${ZAR(core.outputVat)})` },
                    { label: 'Revenue (excl. VAT)',                 value: ZAR(core.revenueExclVat),      bold: true },
                    { label: 'COST OF GOODS SOLD',                  value: '',                            section: true },
                    { label: 'Opening Stock Value',                 value: ZAR(core.totalOpStockValue) },
                    { label: 'Plus: Stock Purchases',               value: ZAR(core.stockPurchases) },
                    { label: 'Less: Closing Stock Value',           value: `(${ZAR(core.totalClStockValue)})` },
                    { label: 'COGS',                                value: ZAR(core.cogs),                bold: true },
                    { label: 'GROSS PROFIT',                        value: ZAR(core.grossProfit),         bold: true, color: core.grossProfit > 0 ? BRAND.sage : BRAND.terracotta },
                    { label: 'Gross Margin',                        value: pct(core.grossMargin) },
                    { label: 'OPERATING EXPENSES',                  value: '',                            section: true },
                    { label: 'Supplier Expenses (excl. VAT)',       value: ZAR(core.totalExpensesExcl) },
                    { label: 'LABOUR COSTS',                        value: '',                            section: true },
                    { label: 'Nett Pay',                            value: ZAR(core.nettPayTotal) },
                    { label: 'PAYE',                                value: ZAR(core.payeTotal) },
                    { label: 'UIF (Employee)',                      value: ZAR(core.uifEmployeeTotal) },
                    { label: 'UIF (Employer)',                      value: ZAR(core.uifEmployerTotal) },
                    { label: 'Total Labour Cost',                   value: ZAR(core.totalLabourCost),     bold: true },
                    { label: 'PROFIT',                              value: '',                            section: true },
                    { label: 'Net Profit Before Tax',               value: ZAR(core.netProfitBeforeTax),  bold: true, color: core.netProfitBeforeTax > 0 ? BRAND.sage : BRAND.terracotta },
                    { label: 'Net Margin',                          value: pct(core.netMargin) },
                    { label: 'VAT & STATUTORY',                     value: '',                            section: true },
                    { label: 'Output VAT',                          value: ZAR(core.outputVat) },
                    { label: 'Input VAT (recoverable)',             value: `(${ZAR(core.inputVat)})` },
                    { label: 'VAT Payable / (Refundable)',          value: ZAR(core.vatPayable),          bold: true, color: core.vatPayable >= 0 ? BRAND.terracotta : BRAND.sage },
                    { label: 'PAYE due to SARS',                    value: ZAR(core.payeTotal) },
                    { label: 'UIF due to SARS',                     value: ZAR(core.uifEmployeeTotal + core.uifEmployerTotal) },
                    { label: 'OTHER',                               value: '',                            section: true },
                    { label: 'Z vs Actual Variance',                value: varianceLabel(core.zVariance), color: varianceColor(core.zVariance) },
                    { label: 'Unpaid Supplier Invoices',            value: ZAR(core.unpaidExpenses) },
                    { label: 'Closing Stock Value',                 value: ZAR(core.totalClStockValue) },
                  ].map((row, i) => row.section
                    ? <tr key={i} className="bg-muted/30"><td colSpan={2} className="px-5 py-2 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{row.label}</td></tr>
                    : <tr key={i} className="hover:bg-muted/10">
                        <td className={`px-5 py-2 ${row.bold ? 'font-semibold' : 'text-muted-foreground pl-8'}`}>{row.label}</td>
                        <td className={`px-5 py-2 text-right tabular-nums ${row.bold ? 'font-semibold' : ''}`} style={{ color: (row as any).color }}>{row.value}</td>
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