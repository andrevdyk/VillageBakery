'use client'

/**
 * EmployeeDashboard
 * ─────────────────
 * Drop-in replacement for PayslipHistorySheet.
 *
 * Usage — in EmployeesTab replace:
 *   <PayslipHistorySheet ... />
 * with:
 *   <EmployeeDashboard ... />
 *
 * The prop signature is identical to PayslipHistorySheet so no other
 * changes are needed in EmployeesTab.
 */

import { useState, useMemo } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Printer, Pencil, Trash2, BanknoteIcon, Check, Loader2,
  FileText, Clock, TrendingUp, AlertCircle, Banknote, Sun,
  CalendarDays, X,
} from 'lucide-react'
import type { Employee, PayslipData } from './employees-tab'

// ─── Brand palette (matches employees-tab) ────────────────────────────────────
const C = {
  coffee:     '#5C3D2E',
  caramel:    '#C4874A',
  wheat:      '#D4A96A',
  sage:       '#7A9E7E',
  terracotta: '#C0614A',
  cream:      '#F5EFE6',
}

const ZAR = (n: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n)

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-ZA')
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color, icon,
}: {
  label: string; value: string; sub?: string; color: string; icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-card border p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: color }} />
      <div className="flex items-start justify-between mb-3 mt-1">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold leading-tight max-w-[80%]">{label}</p>
        <span style={{ color }} className="opacity-70 shrink-0">{icon}</span>
      </div>
      <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1 truncate">{sub}</p>}
    </div>
  )
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number; name: string; color?: string }>; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-muted-foreground">
          {p.color && <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />}
          {p.name}: <span className="font-semibold text-foreground ml-1">{ZAR(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function EmployeeDashboard({
  open, onClose, employee, payslips, onPrint, onDelete, onMarkPaid, onEdit,
}: {
  open: boolean
  onClose: () => void
  employee: Employee | null
  payslips: PayslipData[]
  onPrint: (p: PayslipData) => void
  onDelete: (id: number) => Promise<void>
  onMarkPaid: (id: number, datePaid: string) => Promise<void>
  onEdit: (p: PayslipData) => void
}) {
  const today = new Date().toISOString().split('T')[0]

  // ── Filters ─────────────────────────────────────────────────────────────
  const [filterPayType,   setFilterPayType]   = useState('all')
  const [filterSlipType,  setFilterSlipType]  = useState('all')
  const [dateFrom,        setDateFrom]        = useState('')
  const [dateTo,          setDateTo]          = useState('')

  // ── Modals ───────────────────────────────────────────────────────────────
  const [deleteTarget,   setDeleteTarget]   = useState<PayslipData | null>(null)
  const [markPaidTarget, setMarkPaidTarget] = useState<PayslipData | null>(null)
  const [markPaidDate,   setMarkPaidDate]   = useState('')
  const [working,        setWorking]        = useState(false)

  // ── Filtered payslips ────────────────────────────────────────────────────
  const filtered = useMemo(() => !employee ? [] : payslips.filter(p => {
    if (filterPayType  !== 'all' && p.pay_type      !== filterPayType)  return false
    if (filterSlipType !== 'all' && p.payslip_type  !== filterSlipType) return false
    if (dateFrom && p.pay_date < dateFrom) return false
    if (dateTo   && p.pay_date > dateTo)   return false
    return true
  }), [payslips, filterPayType, filterSlipType, dateFrom, dateTo])

  const hasFilters = filterPayType !== 'all' || filterSlipType !== 'all' || !!dateFrom || !!dateTo

  function clearFilters() {
    setFilterPayType('all'); setFilterSlipType('all'); setDateFrom(''); setDateTo('')
  }

  // ── Aggregates over filtered set ─────────────────────────────────────────
  const totals = useMemo(() => filtered.reduce((acc, p) => ({
    regular:    acc.regular    + Number(p.regular_pay        ?? 0),
    overtime:   acc.overtime   + Number(p.overtime_pay       ?? 0),
    pubHoliday: acc.pubHoliday + Number(p.public_holiday_pay ?? 0),
    leave:      acc.leave      + Number(p.leave_pay          ?? 0),
    bonus:      acc.bonus      + Number(p.bonus              ?? 0),
    earnings:   acc.earnings   + Number(p.total_earnings     ?? 0),
    deductions: acc.deductions + Number(p.total_deductions   ?? 0),
    nett:       acc.nett       + Number(p.nett_pay           ?? 0),
    uif:        acc.uif        + Number(p.uif_employee       ?? 0),
    other_ded:  acc.other_ded  + Number(p.other_deductions   ?? 0),
  }), { regular: 0, overtime: 0, pubHoliday: 0, leave: 0, bonus: 0,
        earnings: 0, deductions: 0, nett: 0, uif: 0, other_ded: 0 }), [filtered])

  // ── Monthly chart data ───────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const map = new Map<string, { regular: number; overtime: number; pubHoliday: number; nett: number }>()
    for (const p of filtered) {
      if (!p.pay_date) continue
      const key = p.pay_date.slice(0, 7) // YYYY-MM
      const cur = map.get(key) ?? { regular: 0, overtime: 0, pubHoliday: 0, nett: 0 }
      map.set(key, {
        regular:    cur.regular    + Number(p.regular_pay        ?? 0),
        overtime:   cur.overtime   + Number(p.overtime_pay       ?? 0),
        pubHoliday: cur.pubHoliday + Number(p.public_holiday_pay ?? 0),
        nett:       cur.nett       + Number(p.nett_pay           ?? 0),
      })
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => {
        const [yr, mo] = key.split('-')
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        return { name: `${months[parseInt(mo) - 1]} ${yr}`, ...v }
      })
  }, [filtered])

  // ── Earnings breakdown for bar chart ────────────────────────────────────
  const breakdownData = [
    { name: 'Regular',      value: Math.round(totals.regular),    color: C.caramel },
    { name: 'Overtime',     value: Math.round(totals.overtime),   color: C.terracotta },
    { name: 'Public hol.',  value: Math.round(totals.pubHoliday), color: C.sage },
    { name: 'Leave',        value: Math.round(totals.leave),      color: C.wheat },
    { name: 'Bonus/Extra',  value: Math.round(totals.bonus + (totals.earnings - totals.regular - totals.overtime - totals.pubHoliday - totals.leave - totals.bonus)), color: C.coffee },
  ].filter(d => d.value > 0)

  const payTypeLabel = { hourly: 'Hourly', daily: 'Daily', flat: 'Flat/Salary' }

  if (!employee) return null

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-4xl overflow-y-auto p-0"
        >
          {/* ── Header ── */}
          <div className="sticky top-0 z-10 bg-card border-b px-5 py-4">
            <SheetHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SheetTitle className="text-lg font-bold">{employee.full_name}</SheetTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {employee.job_position ?? 'No position'} ·{' '}
                    <span className="capitalize">{payTypeLabel[employee.pay_type]}</span>
                    {employee.hourly_rate ? ` · R${employee.hourly_rate}/hr` : ''}
                    {employee.daily_rate  ? ` · R${employee.daily_rate}/day` : ''}
                    {employee.flat_rate   ? ` · R${employee.flat_rate}/mo`  : ''}
                  </p>
                </div>
                <Badge
                  variant={employee.is_active ? 'secondary' : 'outline'}
                  className="text-xs shrink-0"
                >
                  {employee.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </SheetHeader>
          </div>

          <div className="p-5 space-y-6">

            {/* ── Filters ── */}
            <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filters</p>
                {hasFilters && (
                  <button className="text-xs text-muted-foreground hover:text-foreground underline" onClick={clearFilters}>
                    Clear all
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Select value={filterPayType} onValueChange={setFilterPayType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pay type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All pay types</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="flat">Flat</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterSlipType} onValueChange={setFilterSlipType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Period type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All periods</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">From</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">To</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {filtered.length} payslip{filtered.length !== 1 ? 's' : ''} shown
                {hasFilters && ` (filtered from ${payslips.length})`}
              </p>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <FileText className="w-8 h-8 opacity-30" />
                <p className="text-sm">No payslips match the current filters.</p>
              </div>
            ) : (
              <>
                {/* ── KPI cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Total Nett Pay" value={ZAR(totals.nett)} sub={`${filtered.length} payslips`} color={C.caramel} icon={<Banknote className="w-4 h-4" />} />
                  <StatCard label="Regular Pay"    value={ZAR(totals.regular)}    sub="Base earnings"    color={C.coffee}     icon={<Clock className="w-4 h-4" />} />
                  <StatCard label="Overtime Pay"   value={ZAR(totals.overtime)}   sub="OT hours"         color={C.terracotta} icon={<TrendingUp className="w-4 h-4" />} />
                  <StatCard label="Public Holiday" value={ZAR(totals.pubHoliday)} sub="Holiday worked"   color={C.sage}       icon={<Sun className="w-4 h-4" />} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Leave Pay"       value={ZAR(totals.leave)}      sub="Leave taken"     color={C.wheat}      icon={<CalendarDays className="w-4 h-4" />} />
                  <StatCard label="Total Earnings"  value={ZAR(totals.earnings)}   sub="Before deductions" color={C.caramel}  icon={<TrendingUp className="w-4 h-4" />} />
                  <StatCard label="UIF Deducted"    value={ZAR(totals.uif)}        sub="1% of earnings"  color={C.terracotta} icon={<AlertCircle className="w-4 h-4" />} />
                  <StatCard label="Total Deductions" value={ZAR(totals.deductions)} sub="All deductions" color={C.coffee}     icon={<BanknoteIcon className="w-4 h-4" />} />
                </div>

                {/* ── Charts row ── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                  {/* Nett pay trend */}
                  <div className="sm:col-span-2 rounded-xl border bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Nett Pay Over Time</p>
                    <p className="text-[10px] text-muted-foreground mb-3">Pay date grouping · R</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="empNettGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={C.caramel} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={C.caramel} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={n => `R${(n/1000).toFixed(0)}k`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="nett" name="Nett pay" stroke={C.caramel} strokeWidth={2} fill="url(#empNettGrad)" dot={false} activeDot={{ r: 4, fill: C.caramel }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Earnings breakdown */}
                  <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Earnings Breakdown</p>
                    <p className="text-[10px] text-muted-foreground mb-3">Total across filtered period</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={breakdownData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={n => `R${(n/1000).toFixed(0)}k`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="value" name="Amount" radius={[4, 4, 0, 0]} maxBarSize={32}>
                          {breakdownData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* ── Payments table ── */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/20">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment History</p>
                  </div>

                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Pay date</TableHead>
                          <TableHead className="text-xs">Period</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs text-right">Regular</TableHead>
                          <TableHead className="text-xs text-right">OT</TableHead>
                          <TableHead className="text-xs text-right">PH</TableHead>
                          <TableHead className="text-xs text-right">Leave</TableHead>
                          <TableHead className="text-xs text-right">Earnings</TableHead>
                          <TableHead className="text-xs text-right">Deductions</TableHead>
                          <TableHead className="text-xs text-right">Nett</TableHead>
                          <TableHead className="text-xs w-24" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map(p => {
                          const hasOt = Number(p.overtime_pay ?? 0) > 0
                          const hasPh = Number(p.public_holiday_pay ?? 0) > 0
                          const hasLeave = Number(p.leave_pay ?? 0) > 0
                          const hasOtherDed = Number(p.other_deductions ?? 0) > 0
                          return (
                            <TableRow key={p.payslip_id} className="text-xs">
                              <TableCell className="font-medium tabular-nums whitespace-nowrap">
                                {fmtDate(p.pay_date)}
                              </TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap">
                                {fmtDate(p.period_from)} – {fmtDate(p.period_to)}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{p.payslip_type}</Badge>
                                  {hasOt    && <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: C.terracotta, color: C.terracotta }}>OT</Badge>}
                                  {hasPh    && <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: C.sage, color: C.sage }}>PH</Badge>}
                                  {hasLeave && <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: C.wheat, color: '#8a6d30' }}>Leave</Badge>}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{ZAR(Number(p.regular_pay ?? 0))}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {hasOt ? <span style={{ color: C.terracotta }}>{ZAR(Number(p.overtime_pay))}</span> : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {hasPh ? <span style={{ color: C.sage }}>{ZAR(Number(p.public_holiday_pay))}</span> : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {hasLeave ? ZAR(Number(p.leave_pay)) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{ZAR(Number(p.total_earnings ?? 0))}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className="text-destructive">{ZAR(Number(p.total_deductions ?? 0))}</span>
                                {hasOtherDed && (
                                  <p className="text-[9px] text-muted-foreground truncate max-w-[80px]">{p.other_deductions_label}</p>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{ZAR(Number(p.nett_pay ?? 0))}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-0.5 justify-end">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onPrint(p)} title="Print">
                                    <Printer className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(p)} title="Edit">
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={() => setDeleteTarget(p)}
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3 h-3" />
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
                  <div className="sm:hidden divide-y">
                    {filtered.map(p => {
                      const hasOt    = Number(p.overtime_pay       ?? 0) > 0
                      const hasPh    = Number(p.public_holiday_pay  ?? 0) > 0
                      const hasLeave = Number(p.leave_pay           ?? 0) > 0
                      const hasOtherDed = Number(p.other_deductions ?? 0) > 0
                      return (
                        <div key={p.payslip_id} className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold tabular-nums">{fmtDate(p.pay_date)}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {fmtDate(p.period_from)} – {fmtDate(p.period_to)}
                              </p>
                            </div>
                            <div className="flex gap-1 flex-wrap justify-end">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{p.payslip_type}</Badge>
                              {hasOt    && <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: C.terracotta, color: C.terracotta }}>OT</Badge>}
                              {hasPh    && <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: C.sage, color: C.sage }}>PH</Badge>}
                              {hasLeave && <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: C.wheat, color: '#8a6d30' }}>Leave</Badge>}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Regular</span>
                              <span className="tabular-nums">{ZAR(Number(p.regular_pay ?? 0))}</span>
                            </div>
                            {hasOt && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Overtime</span>
                                <span className="tabular-nums" style={{ color: C.terracotta }}>{ZAR(Number(p.overtime_pay))}</span>
                              </div>
                            )}
                            {hasPh && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Public hol.</span>
                                <span className="tabular-nums" style={{ color: C.sage }}>{ZAR(Number(p.public_holiday_pay))}</span>
                              </div>
                            )}
                            {hasLeave && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Leave</span>
                                <span className="tabular-nums">{ZAR(Number(p.leave_pay))}</span>
                              </div>
                            )}
                            <div className="flex justify-between col-span-2 border-t pt-1 mt-0.5">
                              <span className="text-muted-foreground">Earnings</span>
                              <span className="tabular-nums font-medium">{ZAR(Number(p.total_earnings ?? 0))}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">UIF</span>
                              <span className="tabular-nums text-destructive">−{ZAR(Number(p.uif_employee ?? 0))}</span>
                            </div>
                            {hasOtherDed && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground truncate max-w-[100px]">{p.other_deductions_label ?? 'Other'}</span>
                                <span className="tabular-nums text-destructive">−{ZAR(Number(p.other_deductions))}</span>
                              </div>
                            )}
                            <div className="flex justify-between col-span-2 border-t pt-1 mt-0.5 font-semibold">
                              <span>Nett pay</span>
                              <span className="tabular-nums">{ZAR(Number(p.nett_pay ?? 0))}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 pt-1 border-t">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1" onClick={() => onPrint(p)}>
                              <Printer className="w-3 h-3" /> Print
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1" onClick={() => onEdit(p)}>
                              <Pencil className="w-3 h-3" /> Edit
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(p)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* ── Deductions summary ── */}
                {(totals.uif > 0 || totals.other_ded > 0) && (
                  <div className="rounded-xl border bg-card p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Deductions Summary</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">UIF (total)</p>
                        <p className="font-semibold tabular-nums text-destructive">{ZAR(totals.uif)}</p>
                      </div>
                      {totals.other_ded > 0 && (
                        <div className="rounded-lg bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">Other deductions</p>
                          <p className="font-semibold tabular-nums text-destructive">{ZAR(totals.other_ded)}</p>
                        </div>
                      )}
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">Total deducted</p>
                        <p className="font-semibold tabular-nums text-destructive">{ZAR(totals.deductions)}</p>
                      </div>
                    </div>
                  </div>
                )}

              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payslip?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the payslip for{' '}
              {deleteTarget && (
                <strong>{fmtDate(deleteTarget.period_from)} – {fmtDate(deleteTarget.period_to)}</strong>
              )}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={working}
              onClick={async () => {
                setWorking(true)
                await onDelete(deleteTarget!.payslip_id!)
                setWorking(false)
                setDeleteTarget(null)
              }}
            >
              {working && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark paid */}
      <AlertDialog open={!!markPaidTarget} onOpenChange={() => setMarkPaidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark payslip as paid</AlertDialogTitle>
            <AlertDialogDescription>
              {markPaidTarget && (
                <>
                  Period: <strong>{fmtDate(markPaidTarget.period_from)} – {fmtDate(markPaidTarget.period_to)}</strong>
                  <br />Nett pay: <strong>{ZAR(Number(markPaidTarget.nett_pay ?? 0))}</strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2 space-y-1.5">
            <Label className="text-sm">Date paid</Label>
            <Input type="date" value={markPaidDate} onChange={e => setMarkPaidDate(e.target.value)} className="h-9" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={working || !markPaidDate}
              className="gap-1.5"
              onClick={async () => {
                setWorking(true)
                await onMarkPaid(markPaidTarget!.payslip_id!, markPaidDate)
                setWorking(false)
                setMarkPaidTarget(null)
              }}
            >
              {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Confirm payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}