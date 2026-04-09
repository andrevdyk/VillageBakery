'use client'


import { useMemo, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react'
import type { CashUpSheet } from '@/lib/schema'
import { calcSheet } from '@/lib/calc'
import { SheetsExportButton } from '@/components/sheets-export-button'
import { InvoiceCard } from '@/components/invoice-card'

// ─── Bakery brand colours (resolved in JS so Recharts can use them) ────────────
const BRAND = {
  coffee:   '#5C3D2E', // deep espresso
  caramel:  '#C4874A', // warm caramel
  wheat:    '#D4A96A', // golden wheat
  cream:    '#F0E0C0', // cream
  sage:     '#7A9E7E', // soft sage green
  terracotta: '#C0614A', // terracotta
}

const MONTHS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS       = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ─── Formatters ───────────────────────────────────────────────────────────────

/** "R 12,345.00" */
const Rfull = (v: number) =>
  `R\u00a0${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "R 12.3k" for axis labels */
const Rk = (v: number) =>
  v >= 1000
    ? `R${(v / 1000).toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`
    : `R${v.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseSheetDate(raw: string | null, fallback: string): Date {
  if (raw) {
    const m = raw.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/)
    if (m) {
      let year = parseInt(m[3]); if (year < 100) year += 2000
      return new Date(year, parseInt(m[2]) - 1, parseInt(m[1]))
    }
    const iso = new Date(raw)
    if (!isNaN(iso.getTime())) return iso
  }
  return new Date(fallback)
}

/** Financial year label: FY starting 1 March */
function fyLabel(date: Date): string {
  const y = date.getFullYear()
  const m = date.getMonth()
  const fy = m >= 2 ? y : y - 1  // March = month 2
  return `FY ${fy}/${String(fy + 1).slice(-2)}`
}

function fyStart(fy: number): Date { return new Date(fy, 2, 1) }       // 1 Mar
function fyEnd  (fy: number): Date { return new Date(fy + 1, 1, 28) }  // 28 Feb

// ─── Seasonality forecast ─────────────────────────────────────────────────────

function computeForecast(sheets: CashUpSheet[]) {
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()

  const byMonth = new Map<string, number>()
  for (const s of sheets) {
    const d = parseSheetDate(s.sheet_date, s.created_at)
    if (isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    byMonth.set(key, (byMonth.get(key) ?? 0) + calcSheet(s).totalActual)
  }

  // Project current incomplete month to full month
  if (byMonth.has(currentMonthKey)) {
    const partialTotal = byMonth.get(currentMonthKey)!
    const projected = (partialTotal / dayOfMonth) * daysInCurrentMonth
    byMonth.set(currentMonthKey, Math.round(projected))
  }

  const sorted = Array.from(byMonth.entries())
    .map(([k, total]) => ({ key: k, total }))
    .sort((a, b) => a.key.localeCompare(b.key))

  if (sorted.length < 2) return []

  const rates: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].total > 0)
      rates.push((sorted[i].total - sorted[i - 1].total) / sorted[i - 1].total)
  }
  const avgGrowth = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0

  const mean = sorted.reduce((a, s) => a + s.total, 0) / sorted.length
  const seasonal = new Map<number, number>()
  for (const m of sorted) {
    const mo   = parseInt(m.key.split('-')[1]) - 1
    const prev = seasonal.get(mo) ?? 0
    seasonal.set(mo, prev === 0 ? m.total / mean : (prev + m.total / mean) / 2)
  }

  const last      = sorted[sorted.length - 1]
  const lastMo    = parseInt(last.key.split('-')[1]) - 1
  const lastYr    = parseInt(last.key.split('-')[0])
  const nextMo    = (lastMo + 1) % 12
  const nextYr    = nextMo === 0 ? lastYr + 1 : lastYr
  const predicted = Math.round(last.total * (1 + avgGrowth) * (seasonal.get(nextMo) ?? 1))

  return [
    ...sorted.slice(-6).map((m) => {
      const mo        = parseInt(m.key.split('-')[1]) - 1
      const yr        = parseInt(m.key.split('-')[0])
      const key       = m.key
      const isCurrent = key === currentMonthKey
      return {
        month:     `${MONTHS[mo]} ${yr}${isCurrent ? ' *' : ''}`,
        actual:    Math.round(m.total),
        predicted: null as number | null,
      }
    }),
    { month: `${MONTHS[nextMo]} ${nextYr}`, actual: null, predicted },
  ]
}

// ─── Chart configs ─────────────────────────────────────────────────────────────

const revenueConfig = {
  total: { label: 'Total Revenue', color: BRAND.caramel },
} as const

const dowConfig = {
  avg: { label: 'Avg Revenue', color: BRAND.coffee },
} as const

const forecastConfig = {
  actual:    { label: 'Actual',    color: BRAND.caramel },
  predicted: { label: 'Predicted', color: BRAND.terracotta },
} as const

// ─── Filter types ─────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'month' | 'quarter' | 'fy'

interface Filters {
  mode: FilterMode
  year: number
  month: number    // 0-based
  quarter: number  // 1-4
  fy: number       // e.g. 2025 means FY 2025/26
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CashUpDashboard({ sheets }: { sheets: CashUpSheet[] }) {
  const [view,    setView]    = useState<'weekly' | 'monthly'>('monthly')
  const [showAll, setShowAll] = useState(false)

  // derive available years/months from data
  const dateMeta = useMemo(() => {
    const years = new Set<number>()
    const fys   = new Set<number>()
    for (const s of sheets) {
      const d = parseSheetDate(s.sheet_date, s.created_at)
      if (isNaN(d.getTime())) continue
      years.add(d.getFullYear())
      fys.add(d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1)
    }
    return {
      years: Array.from(years).sort((a, b) => a - b),
      fys:   Array.from(fys).sort((a, b) => a - b),
    }
  }, [sheets])

  const now = new Date()
  const [filters, setFilters] = useState<Filters>({
    mode:    'all',
    year:    now.getFullYear(),
    month:   now.getMonth(),
    quarter: Math.ceil((now.getMonth() + 1) / 3),
    fy:      now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1,
  })

  const setFilter = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: val }))

  // Apply filters to get the working subset
  const filteredSheets = useMemo(() => {
    return sheets.filter((s) => {
      const d = parseSheetDate(s.sheet_date, s.created_at)
      if (isNaN(d.getTime())) return false
      if (filters.mode === 'month')   return d.getFullYear() === filters.year && d.getMonth() === filters.month
      if (filters.mode === 'quarter') {
        const q = Math.ceil((d.getMonth() + 1) / 3)
        return d.getFullYear() === filters.year && q === filters.quarter
      }
      if (filters.mode === 'fy') {
        const start = fyStart(filters.fy)
        const end   = fyEnd(filters.fy)
        return d >= start && d <= end
      }
      return true // 'all'
    })
  }, [sheets, filters])

  // Last 7 days for the sheet list
  const last7Cutoff = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d
  }, [])

  const sheetListItems = useMemo(() => {
    const sorted = [...filteredSheets].sort((a, b) => {
      const da = parseSheetDate(a.sheet_date, a.created_at)
      const db = parseSheetDate(b.sheet_date, b.created_at)
      return db.getTime() - da.getTime()
    })
    if (showAll) return sorted
    return sorted.filter((s) => parseSheetDate(s.sheet_date, s.created_at) >= last7Cutoff)
  }, [filteredSheets, showAll, last7Cutoff])

  // Stats from filtered sheets
  const stats = useMemo(() => {
    let totalRevenue = 0
    let bestDayRevenue = 0
    let bestDayDate = ''

    const weekMap  = new Map<string, { total: number; label: string }>()
    const monthMap = new Map<string, { total: number; label: string }>()
    const dowTotals = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }))

    for (const s of filteredSheets) {
      const calc     = calcSheet(s)
      const d        = parseSheetDate(s.sheet_date, s.created_at)
      if (isNaN(d.getTime())) continue
      const dayTotal = calc.totalActual
      totalRevenue  += dayTotal

      if (dayTotal > bestDayRevenue) {
        bestDayRevenue = dayTotal
        bestDayDate    = s.sheet_date ?? d.toLocaleDateString('en-ZA')
      }

      const dow = d.getDay()
      dowTotals[dow].sum   += dayTotal
      dowTotals[dow].count += 1

      const monday = new Date(d)
      monday.setDate(d.getDate() - ((dow + 6) % 7))
      const wk = monday.toISOString().slice(0, 10)
      if (!weekMap.has(wk)) weekMap.set(wk, { total: 0, label: `${monday.getDate()} ${MONTHS[monday.getMonth()]}` })
      weekMap.get(wk)!.total += dayTotal

      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap.has(mk)) monthMap.set(mk, { total: 0, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` })
      monthMap.get(mk)!.total += dayTotal
    }

    const weeklyData  = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([, v]) => ({ name: v.label, total: Math.round(v.total) }))
    const monthlyData = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => ({ name: v.label, total: Math.round(v.total) }))
    const dowData     = DAYS_SHORT.map((label, i) => ({
      name: label, fullName: DAYS[i],
      avg:   dowTotals[i].count > 0 ? Math.round(dowTotals[i].sum / dowTotals[i].count) : 0,
      count: dowTotals[i].count,
    }))

    // 30-day trend
    const t30 = new Date(); t30.setDate(t30.getDate() - 30)
    const t60 = new Date(); t60.setDate(t60.getDate() - 60)
    let prev30 = 0, curr30 = 0
    for (const s of sheets) {
      const d = parseSheetDate(s.sheet_date, s.created_at)
      const v = calcSheet(s).totalActual
      if (d >= t30) curr30 += v
      else if (d >= t60) prev30 += v
    }
    const trend = prev30 > 0 ? ((curr30 - prev30) / prev30) * 100 : 0

    const bestDay  = [...dowData].sort((a, b) => b.avg - a.avg)[0]
    const worstDay = [...dowData].filter((d) => d.count > 0).sort((a, b) => a.avg - b.avg)[0]

    return { totalRevenue, bestDayRevenue, bestDayDate, weeklyData, monthlyData, dowData, trend, bestDay, worstDay }
  }, [filteredSheets, sheets])

  const forecastData = useMemo(() => computeForecast(sheets), [sheets])
  const chartData    = view === 'weekly' ? stats.weeklyData : stats.monthlyData

  const filteredLabel = useMemo(() => {
    if (filters.mode === 'month')   return `${MONTHS[filters.month]} ${filters.year}`
    if (filters.mode === 'quarter') return `Q${filters.quarter} ${filters.year}`
    if (filters.mode === 'fy')      return fyLabel(fyStart(filters.fy))
    return 'All Time'
  }, [filters])

  return (
    <div className="space-y-6">

      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Mode pills */}
        <div className="flex bg-muted rounded-xl p-1 gap-0.5">
          {(['all', 'month', 'quarter', 'fy'] as FilterMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setFilter('mode', m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filters.mode === m
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'all' ? 'All Time' : m === 'month' ? 'Month' : m === 'quarter' ? 'Quarter' : 'Financial Year'}
            </button>
          ))}
        </div>

        {/* Year selector (for month / quarter) */}
        {(filters.mode === 'month' || filters.mode === 'quarter') && (
          <SelectPill
            value={String(filters.year)}
            onChange={(v) => setFilter('year', parseInt(v))}
            options={dateMeta.years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        )}

        {/* Month selector */}
        {filters.mode === 'month' && (
          <SelectPill
            value={String(filters.month)}
            onChange={(v) => setFilter('month', parseInt(v))}
            options={MONTHS.map((label, i) => ({ value: String(i), label }))}
          />
        )}

        {/* Quarter selector */}
        {filters.mode === 'quarter' && (
          <SelectPill
            value={String(filters.quarter)}
            onChange={(v) => setFilter('quarter', parseInt(v))}
            options={[1,2,3,4].map((q) => ({ value: String(q), label: `Q${q}` }))}
          />
        )}

        {/* Financial year selector */}
        {filters.mode === 'fy' && (
          <SelectPill
            value={String(filters.fy)}
            onChange={(v) => setFilter('fy', parseInt(v))}
            options={dateMeta.fys.map((y) => ({ value: String(y), label: `FY ${y}/${String(y + 1).slice(-2)}` }))}
          />
        )}

        {/* Active filter badge */}
        <span className="ml-auto text-xs font-semibold text-muted-foreground bg-muted rounded-full px-3 py-1.5">
          {filteredLabel} · {filteredSheets.length} sheets
        </span>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Revenue"
          value={Rfull(stats.totalRevenue)}
          sub={`${filteredSheets.length} sheets`}
          trend={stats.trend}
          accent={BRAND.caramel}
        />
        <KpiCard
          label="Best Single Day"
          value={Rfull(stats.bestDayRevenue)}
          sub={stats.bestDayDate || '—'}
          accent={BRAND.coffee}
        />
        <KpiCard
          label="Best Day of Week"
          value={stats.bestDay?.count > 0 ? stats.bestDay.fullName : '—'}
          sub={stats.bestDay?.count > 0 ? `Avg ${Rfull(stats.bestDay.avg)}` : undefined}
          accent={BRAND.wheat}
        />
        <KpiCard
          label="Quietest Day"
          value={stats.worstDay?.count > 0 ? stats.worstDay.fullName : '—'}
          sub={stats.worstDay?.count > 0 ? `Avg ${Rfull(stats.worstDay.avg)}` : undefined}
          accent={BRAND.sage}
        />
      </div>

      {/* ── Revenue + Day-of-week charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Revenue area chart */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-base font-bold text-foreground">
                {view === 'weekly' ? 'Weekly Revenue' : 'Monthly Revenue'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Total revenue per period</p>
            </div>
            <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
              {(['weekly', 'monthly'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    view === v
                      ? 'bg-card shadow-sm text-foreground border border-border/60'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <ChartContainer config={revenueConfig} className="h-[240px] w-full">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={BRAND.caramel} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={BRAND.caramel} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={Rk} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => Rfull(Number(v))} />} />
                <Area type="monotone" dataKey="total" stroke={BRAND.caramel} strokeWidth={2.5} fill="url(#revenueGrad)" dot={false} activeDot={{ r: 5, fill: BRAND.caramel, strokeWidth: 2, stroke: '#fff' }} />
              </AreaChart>
          </ChartContainer>
        </div>

        {/* Average revenue by day of week */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-foreground">Avg Revenue by Day of Week</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Helps plan staffing and resources per day</p>
          </div>

          <ChartContainer config={dowConfig} className="h-[240px] w-full">
            <BarChart data={stats.dowData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={Rk} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _, item) =>
                        `${Rfull(Number(value))} avg (${(item.payload as { count: number }).count} days)`
                      }
                      labelFormatter={(label, payload) =>
                        (payload?.[0]?.payload as { fullName: string })?.fullName ?? label
                      }
                    />
                  }
                />
                <Bar dataKey="avg" fill={BRAND.coffee} radius={[5, 5, 0, 0]} maxBarSize={52} />
              </BarChart>
          </ChartContainer>
        </div>
      </div>

      {/* ── Seasonality forecast ── */}
      {forecastData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-serif text-base font-bold text-foreground">Revenue Forecast</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Seasonality-adjusted prediction</p>
            </div>
            {forecastData[forecastData.length - 1]?.predicted != null && (
              <div className="text-right flex-shrink-0 ml-4 bg-primary/10 rounded-xl px-4 py-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Next Month Forecast</p>
                <p className="font-bold text-primary text-lg font-serif">
                  {Rfull(forecastData[forecastData.length - 1].predicted!)}
                </p>
              </div>
            )}
          </div>

          <ChartContainer config={forecastConfig} className="h-[260px] w-full">
            <LineChart data={forecastData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={Rk} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => Rfull(Number(v))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line type="monotone" dataKey="actual" stroke={BRAND.caramel} strokeWidth={2.5} dot={{ r: 4, fill: BRAND.caramel, stroke: '#fff', strokeWidth: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey="predicted" stroke={BRAND.terracotta} strokeWidth={2.5} strokeDasharray="7 3" dot={{ r: 5, fill: BRAND.terracotta, stroke: '#fff', strokeWidth: 2 }} connectNulls={false} />
                <ReferenceLine x={forecastData[forecastData.length - 1]?.month} stroke={BRAND.terracotta} strokeDasharray="4 2" strokeOpacity={0.35} />
              </LineChart>
          </ChartContainer>
        </div>
      )}

      {/* ── Sheet list ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {showAll ? 'All Sheets' : 'Last 7 Days'}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {sheetListItems.length} sheet{sheetListItems.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SheetsExportButton sheets={filteredSheets} />
            <button
              onClick={() => setShowAll((s) => !s)}
              className="flex items-center gap-1 text-xs font-semibold text-accent border border-accent/40 rounded-full px-3 py-1.5 hover:bg-accent/10 transition-colors"
            >
              {showAll ? 'Show Last 7 Days' : 'View All Sheets'}
              <ChevronDown size={12} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {sheetListItems.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No sheets in the last 7 days.{' '}
            <button onClick={() => setShowAll(true)} className="underline text-accent">View all sheets</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sheetListItems.map((sheet) => (
              <InvoiceCard key={sheet.id} sheet={sheet} />
            ))}
          </div>
        )}
      </section>

    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, trend, accent,
}: {
  label: string
  value: string
  sub?: string
  trend?: number
  accent?: string
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 relative overflow-hidden">
      {/* Colour accent bar */}
      {accent && (
        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: accent }} />
      )}
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-1">{label}</p>
      <p className="font-serif text-xl font-bold text-foreground mt-1 leading-tight">{value}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {trend != null && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trend >= 0 ? 'text-green-600' : 'text-destructive'}`}>
            {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

// ─── Select pill helper ────────────────────────────────────────────────────────

function SelectPill({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-card border border-border rounded-full pl-3 pr-7 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
    </div>
  )
}
