'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine, ComposedChart,
} from 'recharts'
import {
  Users, TrendingUp, TrendingDown, AlertTriangle, Calendar,
  DollarSign, Zap, Sun, Clock, ChevronDown, Info, Sparkles,
  ArrowUpRight, ArrowDownRight, BarChart3, Activity,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Employee {
  employee_id: number
  full_name: string
  id_number: string | null
  job_position: string | null
  pay_type: 'hourly' | 'daily' | 'flat'
  hourly_rate: number | null
  daily_rate: number | null
  flat_rate: number | null
  is_active: boolean
}

export interface PayslipData {
  payslip_id?: number
  employee_id: number
  period_from: string
  period_to: string
  pay_date: string
  payslip_type: 'weekly' | 'monthly'
  pay_type: 'hourly' | 'daily' | 'flat'
  regular_hours: number
  regular_days: number
  overtime_hours: number
  public_holiday_hours: number
  public_holiday_days: number
  leave_days: number
  bonus: number
  extra_earnings: Array<{ label: string; amount: number }>
  regular_pay: number
  overtime_pay: number
  public_holiday_pay: number
  leave_pay: number
  total_earnings: number
  uif_employee: number
  paye: number
  other_deductions: number
  total_deductions: number
  nett_pay: number
  payout: number
  rate: number
  vb_employee?: { full_name: string; job_position: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ZAR = (n: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
const ZARd = (n: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(n)
const pct = (n: number) => `${n.toFixed(1)}%`
const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Brand palette ────────────────────────────────────────────────────────────
const C = {
  coffee:     '#5C3D2E',
  caramel:    '#C4874A',
  wheat:      '#D4A96A',
  sage:       '#7A9E7E',
  terracotta: '#C0614A',
  clay:       '#B8714E',
  cream:      '#F5EDD8',
  indigo:     '#5B6EAE',
  plum:       '#7C5C8A',
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card/95 backdrop-blur border border-border/60 rounded-2xl px-4 py-3 shadow-xl text-xs min-w-[160px]">
      {label && <p className="font-semibold text-foreground mb-2 text-[11px] uppercase tracking-wide">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums">{ZAR(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, accent, icon: Icon, trend, trendLabel, size = 'md',
}: {
  label: string; value: string; sub?: string
  accent: string; icon?: React.ElementType
  trend?: 'up' | 'down' | 'neutral'; trendLabel?: string; size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <div className="relative rounded-2xl bg-card border overflow-hidden flex flex-col gap-2 p-4">
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: accent }} />
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
        {Icon && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent + '18' }}>
            <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
          </div>
        )}
      </div>
      <p className={`font-bold tabular-nums leading-none ${size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-base' : 'text-xl'}`}>{value}</p>
      {(sub || trendLabel) && (
        <div className="flex items-center gap-1 text-xs">
          {trend === 'up' && <ArrowUpRight className="w-3 h-3 text-emerald-500 shrink-0" />}
          {trend === 'down' && <ArrowDownRight className="w-3 h-3 text-red-400 shrink-0" />}
          <span className={trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}>
            {trendLabel ?? sub}
          </span>
          {sub && trendLabel && <span className="text-muted-foreground">· {sub}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, sub, children, accent = C.caramel }: {
  title: string; sub?: string; children: React.ReactNode; accent?: string
}) {
  return (
    <div className="rounded-2xl bg-card border overflow-hidden">
      <div className="px-5 py-3.5 border-b flex items-center gap-3">
        <div className="w-1 h-6 rounded-full" style={{ background: accent }} />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function PayrollDashboard({
  payslips,
  employees,
}: {
  payslips: PayslipData[]
  employees: Employee[]
}) {
  // ── Date filter ──
  const now       = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [fromMonth, setFromMonth] = useState(() => {
    const d = new Date(now); d.setMonth(d.getMonth() - 2)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [toMonth, setToMonth] = useState(thisMonth)

  // ── Scenario state ──
  const [scenarioRevenue,  setScenarioRevenue]  = useState(80000)
  const [scenarioWageAdj,  setScenarioWageAdj]  = useState(0)    // % change to wages
  const [scenarioPHDays,   setScenarioPHDays]   = useState(0)    // extra PH days per week
  const [scenarioExpenses, setScenarioExpenses] = useState(35000) // operating expenses

  // ── Filtered payslips ──
  const filtered = useMemo(() => {
    const from = fromMonth + '-01'
    const to   = toMonth   + '-31'
    return payslips.filter(p => {
      const d = p.pay_date ?? p.period_to
      return d >= from && d <= to
    })
  }, [payslips, fromMonth, toMonth])

  // ── Monthly trend data ──
  const monthlyData = useMemo(() => {
    const map = new Map<string, {
      nettPay: number; paye: number; uif: number; overtime: number
      publicHoliday: number; regular: number; bonus: number; headcount: Set<number>
    }>()

    for (const p of payslips) {
      const d   = p.pay_date ?? p.period_to
      const key = d.slice(0, 7)
      const cur = map.get(key) ?? {
        nettPay: 0, paye: 0, uif: 0, overtime: 0, publicHoliday: 0,
        regular: 0, bonus: 0, headcount: new Set<number>(),
      }
      cur.nettPay      += num(p.nett_pay)
      cur.paye         += num(p.paye)
      cur.uif          += num(p.uif_employee)
      cur.overtime     += num(p.overtime_pay)
      cur.publicHoliday += num(p.public_holiday_pay)
      cur.regular      += num(p.regular_pay) + num(p.leave_pay)
      cur.bonus        += num(p.bonus)
      cur.headcount.add(p.employee_id)
      map.set(key, cur)
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, v]) => {
        const [yr, mo] = key.split('-')
        return {
          key,
          name:         `${MONTHS[parseInt(mo) - 1]} ${yr.slice(2)}`,
          nettPay:      Math.round(v.nettPay),
          paye:         Math.round(v.paye),
          uif:          Math.round(v.uif),
          statutory:    Math.round(v.paye + v.uif),
          overtime:     Math.round(v.overtime),
          publicHoliday: Math.round(v.publicHoliday),
          regular:      Math.round(v.regular),
          bonus:        Math.round(v.bonus),
          totalCost:    Math.round(v.nettPay + v.paye + v.uif),
          headcount:    v.headcount.size,
        }
      })
  }, [payslips])

  // ── Period aggregates ──
  const agg = useMemo(() => {
    const totalEarnings    = filtered.reduce((s, p) => s + num(p.total_earnings), 0)
    const totalNettPay     = filtered.reduce((s, p) => s + num(p.nett_pay), 0)
    const totalPaye        = filtered.reduce((s, p) => s + num(p.paye), 0)
    const totalUif         = filtered.reduce((s, p) => s + num(p.uif_employee), 0)
    const totalOvertime    = filtered.reduce((s, p) => s + num(p.overtime_pay), 0)
    const totalPH          = filtered.reduce((s, p) => s + num(p.public_holiday_pay), 0)
    const totalOtherDed    = filtered.reduce((s, p) => s + num(p.other_deductions), 0)
    const totalBonus       = filtered.reduce((s, p) => s + num(p.bonus), 0)
    const totalPHHours     = filtered.reduce((s, p) => s + num(p.public_holiday_hours), 0)
    const totalOTHours     = filtered.reduce((s, p) => s + num(p.overtime_hours), 0)
    const totalRegHours    = filtered.reduce((s, p) => s + num(p.regular_hours), 0)
    const totalCostToComp  = totalNettPay + totalPaye + totalUif
    const uniqueEmployees  = new Set(filtered.map(p => p.employee_id)).size
    const payslipCount     = filtered.length
    const monthlySlips     = filtered.filter(p => p.payslip_type === 'monthly')
    const weeklySlips      = filtered.filter(p => p.payslip_type === 'weekly')
    return {
      totalEarnings, totalNettPay, totalPaye, totalUif, totalOvertime,
      totalPH, totalOtherDed, totalBonus, totalPHHours, totalOTHours,
      totalRegHours, totalCostToComp, uniqueEmployees, payslipCount,
      monthlySlips: monthlySlips.length, weeklySlips: weeklySlips.length,
    }
  }, [filtered])

  // ── Per-employee breakdown ──
  const perEmployee = useMemo(() => {
    const map = new Map<number, {
      name: string; nett: number; paye: number; uif: number
      overtime: number; ph: number; earnings: number; payslips: number
    }>()
    for (const p of filtered) {
      const name = p.vb_employee?.full_name ?? employees.find(e => e.employee_id === p.employee_id)?.full_name ?? `#${p.employee_id}`
      const cur  = map.get(p.employee_id) ?? { name, nett: 0, paye: 0, uif: 0, overtime: 0, ph: 0, earnings: 0, payslips: 0 }
      cur.nett     += num(p.nett_pay)
      cur.paye     += num(p.paye)
      cur.uif      += num(p.uif_employee)
      cur.overtime += num(p.overtime_pay)
      cur.ph       += num(p.public_holiday_pay)
      cur.earnings += num(p.total_earnings)
      cur.payslips++
      map.set(p.employee_id, cur)
    }
    return Array.from(map.values())
      .map(v => ({ ...v, total: v.nett + v.paye + v.uif }))
      .sort((a, b) => b.total - a.total)
  }, [filtered, employees])

  // ── Public holiday analysis ──
  const phAnalysis = useMemo(() => {
    const byEmployee = new Map<number, { name: string; hours: number; pay: number; slips: number }>()
    for (const p of filtered) {
      const phH = num(p.public_holiday_hours) + num(p.public_holiday_days) * 8
      if (phH === 0 && num(p.public_holiday_pay) === 0) continue
      const name = p.vb_employee?.full_name ?? employees.find(e => e.employee_id === p.employee_id)?.full_name ?? `#${p.employee_id}`
      const cur  = byEmployee.get(p.employee_id) ?? { name, hours: 0, pay: 0, slips: 0 }
      cur.hours += phH
      cur.pay   += num(p.public_holiday_pay)
      cur.slips++
      byEmployee.set(p.employee_id, cur)
    }
    return Array.from(byEmployee.values()).sort((a, b) => b.pay - a.pay)
  }, [filtered, employees])

  // ── Scenario calculations ──
  const scenario = useMemo(() => {
    // Base: last month's actual wages as baseline
    const lastMonth = monthlyData[monthlyData.length - 1]
    const baseWages = lastMonth?.totalCost ?? agg.totalCostToComp
    const adjWages  = baseWages * (1 + scenarioWageAdj / 100)
    // PH cost: each extra PH day costs roughly avg hourly rate × 2 (double time) × avg workers
    const avgHourlyRate = 31  // approximate blended rate
    const phExtraCost   = scenarioPHDays * avgHourlyRate * 2 * 8 * 6  // 6 weekly workers
    const totalWageCost = adjWages + phExtraCost
    const grossProfit   = scenarioRevenue / 1.15 - (scenarioExpenses * 0.4)  // ~40% COGS of expenses
    const netProfit     = grossProfit - scenarioExpenses * 0.6 - totalWageCost
    const wageRatio     = scenarioRevenue > 0 ? totalWageCost / (scenarioRevenue / 1.15) * 100 : 0
    const isViable      = netProfit > 0 && wageRatio < 40

    // Generate curve: revenue from 40k to 160k
    const curve = Array.from({ length: 13 }, (_, i) => {
      const rev     = 40000 + i * 10000
      const revExcl = rev / 1.15
      const cogs    = scenarioExpenses * 0.4
      const opEx    = scenarioExpenses * 0.6
      const np      = revExcl - cogs - opEx - totalWageCost
      return {
        revenue: rev,
        label:   `R${Math.round(rev / 1000)}k`,
        profit:  Math.round(np),
        wages:   Math.round(totalWageCost),
        breakeven: 0,
      }
    })

    // Breakeven revenue
    const breakeven = totalWageCost + scenarioExpenses
    const breakevenRevIncl = breakeven * 1.15 / (1 - 0.4 * (scenarioExpenses / (scenarioExpenses || 1)))

    return { adjWages, phExtraCost, totalWageCost, grossProfit, netProfit, wageRatio, isViable, curve, breakeven, breakevenRevIncl }
  }, [monthlyData, agg, scenarioRevenue, scenarioWageAdj, scenarioPHDays, scenarioExpenses])

  // ── Wage trend line data for main chart ──
  const trendChartData = useMemo(() =>
    monthlyData.map(m => ({
      name: m.name,
      'Nett Pay':        m.nettPay,
      'PAYE':            m.paye,
      'UIF':             m.uif,
      'Overtime':        m.overtime,
      'Public Holidays': m.publicHoliday,
    }))
  , [monthlyData])

  const costStackData = useMemo(() =>
    monthlyData.map(m => ({
      name:           m.name,
      Regular:        m.regular,
      Overtime:       m.overtime,
      'Public Hols':  m.publicHoliday,
      Bonus:          m.bonus,
      Statutory:      m.statutory,
    }))
  , [monthlyData])

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Payroll Analytics</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Wages · Statutory payments · PH analysis · Scenario modelling
          </p>
        </div>
        {/* Date filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="space-y-0.5">
            <Label className="text-[9px] uppercase tracking-widest text-muted-foreground">From</Label>
            <Input type="month" value={fromMonth} onChange={e => setFromMonth(e.target.value)}
              className="h-8 text-xs w-36" />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[9px] uppercase tracking-widest text-muted-foreground">To</Label>
            <Input type="month" value={toMonth} onChange={e => setToMonth(e.target.value)}
              className="h-8 text-xs w-36" />
          </div>
        </div>
      </div>

      {/* ── Top stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Cost to Company" value={ZAR(agg.totalCostToComp)} sub={`${agg.payslipCount} payslips`} accent={C.caramel} icon={DollarSign} size="lg" />
        <StatCard label="Nett Pay (Take-home)" value={ZAR(agg.totalNettPay)} sub={`${agg.uniqueEmployees} employees`} accent={C.coffee} icon={Users} />
        <StatCard label="PAYE Due (SARS)" value={ZAR(agg.totalPaye)} sub={`${agg.monthlySlips} monthly payslips`} accent={C.terracotta} icon={TrendingUp} trendLabel={agg.totalPaye === 0 ? 'Below threshold' : 'Pay by 7th'} trend={agg.totalPaye === 0 ? 'neutral' : 'down'} />
        <StatCard label="UIF Due (SARS)" value={ZAR(agg.totalUif * 2)} sub={`Emp R${Math.round(agg.totalUif)} + Emr R${Math.round(agg.totalUif)}`} accent={C.sage} icon={Activity} trendLabel="Pay by 7th" trend="neutral" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Overtime Cost" value={ZAR(agg.totalOvertime)} sub={`${agg.totalOTHours.toFixed(1)} hrs`} accent={C.indigo} icon={Clock} />
        <StatCard label="Public Holiday Cost" value={ZAR(agg.totalPH)} sub={`${agg.totalPHHours.toFixed(1)} hrs`} accent={C.wheat} icon={Sun} />
        <StatCard label="Bonus Paid" value={ZAR(agg.totalBonus)} accent={C.plum} icon={Sparkles} />
        <StatCard label="Other Deductions" value={ZAR(agg.totalOtherDed)} sub="Loans · advances" accent={C.clay} icon={BarChart3} />
      </div>

      {/* ── SARS Statutory summary ── */}
      <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/20 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 rounded-full" style={{ background: C.terracotta }} />
            <div>
              <p className="text-sm font-semibold">SARS Statutory Payments</p>
              <p className="text-xs text-muted-foreground">EMP201 — due by the 7th of the following month</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total due</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: C.terracotta }}>
              {ZAR(agg.totalPaye + agg.totalUif * 2)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x">
          {[
            { label: 'PAYE', value: agg.totalPaye, note: 'Income tax withheld from employees', color: C.terracotta },
            { label: 'UIF — Employee side (1%)', value: agg.totalUif, note: 'Deducted from employee earnings', color: C.caramel },
            { label: 'UIF — Employer side (1%)', value: agg.totalUif, note: 'Matched contribution by bakery', color: C.sage },
          ].map(item => (
            <div key={item.label} className="px-5 py-4 space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{item.label}</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: item.color }}>{ZAR(item.value)}</p>
              <p className="text-xs text-muted-foreground">{item.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 6-month wage trend (line chart) ── */}
      <Section title="6-Month Wage Trend" sub="Monthly cost breakdown over time" accent={C.caramel}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trendChartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
              tickFormatter={v => `R${Math.round(v / 1000)}k`} />
            <Tooltip content={<Tip />} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
            <Line type="monotone" dataKey="Nett Pay"        stroke={C.caramel}    strokeWidth={2.5} dot={{ r: 4, fill: C.caramel, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="PAYE"            stroke={C.terracotta} strokeWidth={2} dot={{ r: 3, fill: C.terracotta }} strokeDasharray="5 3" />
            <Line type="monotone" dataKey="UIF"             stroke={C.sage}       strokeWidth={2} dot={{ r: 3, fill: C.sage }} strokeDasharray="5 3" />
            <Line type="monotone" dataKey="Overtime"        stroke={C.indigo}     strokeWidth={1.5} dot={{ r: 3, fill: C.indigo }} strokeDasharray="3 2" />
            <Line type="monotone" dataKey="Public Holidays" stroke={C.wheat}      strokeWidth={1.5} dot={{ r: 3, fill: C.wheat }} strokeDasharray="3 2" />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      {/* ── Wage composition stacked bar ── */}
      <Section title="Wage Composition" sub="What makes up the total wage bill each month" accent={C.coffee}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={costStackData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
              tickFormatter={v => `R${Math.round(v / 1000)}k`} />
            <Tooltip content={<Tip />} />
            <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="Regular"      stackId="a" fill={C.caramel}    radius={[0,0,0,0]} maxBarSize={40} />
            <Bar dataKey="Overtime"     stackId="a" fill={C.indigo}     radius={[0,0,0,0]} maxBarSize={40} />
            <Bar dataKey="Public Hols"  stackId="a" fill={C.wheat}      radius={[0,0,0,0]} maxBarSize={40} />
            <Bar dataKey="Bonus"        stackId="a" fill={C.plum}       radius={[0,0,0,0]} maxBarSize={40} />
            <Bar dataKey="Statutory"    stackId="a" fill={C.terracotta} radius={[3,3,0,0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* ── Per-employee breakdown ── */}
      <Section title="Per-Employee Cost Breakdown" sub="For the selected period" accent={C.sage}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left pb-2.5 font-semibold text-muted-foreground">Employee</th>
                <th className="text-right pb-2.5 font-semibold text-muted-foreground">Earnings</th>
                <th className="text-right pb-2.5 font-semibold text-muted-foreground">Nett Pay</th>
                <th className="text-right pb-2.5 font-semibold text-muted-foreground">PAYE</th>
                <th className="text-right pb-2.5 font-semibold text-muted-foreground">UIF</th>
                <th className="text-right pb-2.5 font-semibold text-muted-foreground">OT Pay</th>
                <th className="text-right pb-2.5 font-semibold text-muted-foreground">PH Pay</th>
                <th className="text-right pb-2.5 font-semibold text-muted-foreground">Total Cost</th>
                <th className="text-right pb-2.5 font-semibold text-muted-foreground">% Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {perEmployee.map((e, i) => {
                const colors = [C.caramel, C.coffee, C.terracotta, C.sage, C.wheat, C.indigo, C.plum, C.clay]
                return (
                  <tr key={e.name} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
                        <span>{e.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{ZAR(e.earnings)}</td>
                    <td className="py-2.5 text-right tabular-nums">{ZAR(e.nett)}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: e.paye > 0 ? C.terracotta : undefined }}>
                      {e.paye > 0 ? ZAR(e.paye) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{ZAR(e.uif)}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: e.overtime > 0 ? C.indigo : undefined }}>
                      {e.overtime > 0 ? ZAR(e.overtime) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: e.ph > 0 ? C.wheat : undefined }}>
                      {e.ph > 0 ? ZAR(e.ph) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-semibold">{ZAR(e.total)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {agg.totalCostToComp > 0 ? pct(e.total / agg.totalCostToComp * 100) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="pt-2.5">TOTALS</td>
                <td className="pt-2.5 text-right tabular-nums">{ZAR(agg.totalEarnings)}</td>
                <td className="pt-2.5 text-right tabular-nums">{ZAR(agg.totalNettPay)}</td>
                <td className="pt-2.5 text-right tabular-nums" style={{ color: C.terracotta }}>{ZAR(agg.totalPaye)}</td>
                <td className="pt-2.5 text-right tabular-nums">{ZAR(agg.totalUif)}</td>
                <td className="pt-2.5 text-right tabular-nums">{ZAR(agg.totalOvertime)}</td>
                <td className="pt-2.5 text-right tabular-nums">{ZAR(agg.totalPH)}</td>
                <td className="pt-2.5 text-right tabular-nums">{ZAR(agg.totalCostToComp)}</td>
                <td className="pt-2.5 text-right">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {/* ── Public Holiday analysis ── */}
      <Section title="Public Holiday Analysis" sub="Is it worth scheduling staff on public holidays?" accent={C.wheat}>
        {phAnalysis.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No public holiday pay recorded in this period.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-muted/30 p-4 space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Total PH Cost</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: C.wheat }}>{ZAR(agg.totalPH)}</p>
                <p className="text-xs text-muted-foreground">{agg.totalPHHours.toFixed(1)} hours worked</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-4 space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Avg PH Rate Paid</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: C.wheat }}>
                  {agg.totalPHHours > 0 ? ZARd(agg.totalPH / agg.totalPHHours) : '—'}/hr
                </p>
                <p className="text-xs text-muted-foreground">vs ~R32/hr regular</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-4 space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">PH as % of Wages</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: agg.totalPH / (agg.totalEarnings || 1) > 0.08 ? C.terracotta : C.sage }}>
                  {agg.totalEarnings > 0 ? pct(agg.totalPH / agg.totalEarnings * 100) : '—'}
                </p>
                <p className="text-xs text-muted-foreground">of total earnings</p>
              </div>
            </div>
            <div className="space-y-2">
              {phAnalysis.map((e, i) => (
                <div key={e.name} className="flex items-center gap-3">
                  <span className="text-xs w-32 truncate font-medium">{e.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, e.pay / (agg.totalPH || 1) * 100)}%`, background: C.wheat }} />
                  </div>
                  <span className="text-xs tabular-nums font-semibold w-20 text-right">{ZAR(e.pay)}</span>
                  <span className="text-[10px] text-muted-foreground w-16 text-right">{e.hours.toFixed(1)} hrs</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Public Holiday Profitability Check</p>
              <p>Each public holiday day costs approximately <strong>{ZAR(agg.totalPH / Math.max(1, Math.ceil(agg.totalPHHours / 8)))}</strong> in extra wages (double time). To break even on a public holiday, the bakery needs to generate at least that much in <em>additional</em> revenue above a normal trading day.</p>
            </div>
          </div>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SCENARIO MODELLER                                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: scenario.isViable ? '#7A9E7E40' : '#C0614A40' }}>
        <div className="px-5 py-4 border-b flex items-center justify-between"
          style={{ background: scenario.isViable ? '#7A9E7E08' : '#C0614A08' }}>
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 rounded-full" style={{ background: scenario.isViable ? C.sage : C.terracotta }} />
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                Scenario Modeller
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${scenario.isViable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {scenario.isViable ? '✓ Viable' : '✗ Not profitable'}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">Adjust levers to model different scenarios</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Projected net profit</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: scenario.netProfit > 0 ? C.sage : C.terracotta }}>
              {ZAR(scenario.netProfit)}
            </p>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Monthly Revenue (incl. VAT)</Label>
                <span className="text-sm font-bold tabular-nums" style={{ color: C.caramel }}>{ZAR(scenarioRevenue)}</span>
              </div>
              <Slider
                min={20000} max={200000} step={5000}
                value={[scenarioRevenue]}
                onValueChange={([v]) => setScenarioRevenue(v)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>R20k</span><span>R200k</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Operating Expenses (excl. wages)</Label>
                <span className="text-sm font-bold tabular-nums" style={{ color: C.coffee }}>{ZAR(scenarioExpenses)}</span>
              </div>
              <Slider
                min={10000} max={100000} step={1000}
                value={[scenarioExpenses]}
                onValueChange={([v]) => setScenarioExpenses(v)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>R10k</span><span>R100k</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Wage Adjustment</Label>
                <span className="text-sm font-bold tabular-nums" style={{ color: scenarioWageAdj > 0 ? C.terracotta : C.sage }}>
                  {scenarioWageAdj > 0 ? '+' : ''}{scenarioWageAdj}%
                </span>
              </div>
              <Slider
                min={-20} max={40} step={1}
                value={[scenarioWageAdj]}
                onValueChange={([v]) => setScenarioWageAdj(v)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>−20% (cuts)</span><span>+40% (increases)</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Extra PH days/week</Label>
                <span className="text-sm font-bold tabular-nums" style={{ color: scenarioPHDays > 0 ? C.wheat : 'hsl(var(--muted-foreground))' }}>
                  {scenarioPHDays} day{scenarioPHDays !== 1 ? 's' : ''}
                  {scenarioPHDays > 0 && <span className="text-xs ml-1 text-muted-foreground">(+{ZAR(scenario.phExtraCost)}/mo)</span>}
                </span>
              </div>
              <Slider
                min={0} max={5} step={1}
                value={[scenarioPHDays]}
                onValueChange={([v]) => setScenarioPHDays(v)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>None</span><span>5 days/wk</span>
              </div>
            </div>
          </div>

          {/* Scenario summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Revenue (excl. VAT)', value: ZAR(scenarioRevenue / 1.15), color: C.caramel },
              { label: 'Total Wage Cost', value: ZAR(scenario.totalWageCost), color: C.coffee },
              { label: 'Wage / Revenue %', value: pct(scenario.wageRatio), color: scenario.wageRatio > 40 ? C.terracotta : C.sage },
              { label: 'Net Profit Before Tax', value: ZAR(scenario.netProfit), color: scenario.netProfit > 0 ? C.sage : C.terracotta },
            ].map(item => (
              <div key={item.label} className="rounded-xl bg-muted/30 p-3 space-y-0.5">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">{item.label}</p>
                <p className="text-base font-bold tabular-nums" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Profit curve line chart */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Profit vs Revenue Curve</p>
            <p className="text-xs text-muted-foreground">
              With current settings, breakeven ≈ <strong style={{ color: C.caramel }}>{ZAR(scenario.breakeven)}</strong> in total costs.
              The chart shows net profit at each revenue level — the point where the line crosses zero is your breakeven revenue.
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={scenario.curve} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 0 ? `R${Math.round(v / 1000)}k` : `-R${Math.round(Math.abs(v) / 1000)}k`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const profit = payload.find(p => p.dataKey === 'profit')?.value as number ?? 0
                    return (
                      <div className="bg-card border rounded-2xl px-4 py-3 shadow-xl text-xs">
                        <p className="font-semibold mb-2">{label}</p>
                        <p className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Net Profit</span>
                          <span className="font-bold" style={{ color: profit >= 0 ? C.sage : C.terracotta }}>{ZAR(profit)}</span>
                        </p>
                        <p className="flex items-center justify-between gap-4 mt-1">
                          <span className="text-muted-foreground">Wage Cost</span>
                          <span className="font-semibold">{ZAR(payload.find(p => p.dataKey === 'wages')?.value as number ?? 0)}</span>
                        </p>
                      </div>
                    )
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1.5} strokeDasharray="4 2"
                  label={{ value: 'Break-even', position: 'right', fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                {/* Shade loss zone */}
                <Area type="monotone" dataKey="profit" fill={C.terracotta} fillOpacity={0.06}
                  stroke="none" baseValue={0} />
                <Bar dataKey="wages" name="Wage Cost" fill={C.caramel} fillOpacity={0.15} radius={[3,3,0,0]} maxBarSize={32} />
                <Line type="monotone" dataKey="profit" name="Net Profit" stroke={C.sage} strokeWidth={3}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props
                    const isBreakeven = Math.abs(payload.profit) < 3000
                    const color = payload.profit >= 0 ? C.sage : C.terracotta
                    return <circle key={cx} cx={cx} cy={cy} r={isBreakeven ? 6 : 4} fill={color} stroke="#fff" strokeWidth={2} />
                  }}
                  activeDot={{ r: 7 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: C.sage, display: 'inline-block' }} /> Net Profit</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm opacity-20" style={{ background: C.caramel, display: 'inline-block' }} /> Wage Cost (bar)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded border-t-2 border-dashed" style={{ borderColor: 'hsl(var(--foreground))', display: 'inline-block' }} /> Break-even line</span>
            </div>
          </div>

          {/* Verdict */}
          <div className={`rounded-2xl p-4 border text-sm space-y-2 ${scenario.isViable ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
            <p className="font-semibold flex items-center gap-2">
              {scenario.isViable ? '✓ Scenario is profitable' : '✗ Scenario is loss-making'}
            </p>
            <ul className="space-y-1 text-xs">
              <li>• Wage cost is <strong>{pct(scenario.wageRatio)}</strong> of revenue — target is below 40%</li>
              <li>• Net profit before tax: <strong>{ZAR(scenario.netProfit)}</strong></li>
              {scenarioPHDays > 0 && <li>• Extra public holidays add <strong>{ZAR(scenario.phExtraCost)}/month</strong> to wage bill</li>}
              {scenarioWageAdj !== 0 && <li>• {scenarioWageAdj > 0 ? 'Wage increase' : 'Wage reduction'} of {Math.abs(scenarioWageAdj)}% costs {scenarioWageAdj > 0 ? 'an extra' : 'saves'} <strong>{ZAR(Math.abs(scenario.adjWages - (monthlyData[monthlyData.length - 1]?.totalCost ?? 0)))}</strong>/month</li>}
              <li>• To break even, the bakery needs at least <strong>{ZAR(Math.max(0, -scenario.curve[0].profit > 0 ? scenario.breakeven * 1.3 : scenario.breakeven))}</strong> in total revenue</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  )
}