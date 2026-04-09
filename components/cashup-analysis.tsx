'use client'

import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, BarChart, Bar,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { TrendingUp, TrendingDown, BarChart2 } from 'lucide-react'
import type { CashUpSheet } from '@/lib/schema'
import { calcSheet } from '@/lib/calc'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const R  = (v: number) => `R${v.toFixed(2)}`
const Rk = (v: number) => v >= 1000 ? `R${(v / 1000).toFixed(1)}k` : `R${v.toFixed(0)}`

const forecastConfig = {
  actual:    { label: 'Actual',    color: 'hsl(var(--chart-1))' },
  predicted: { label: 'Predicted', color: 'hsl(var(--chart-4))' },
} as const

const varianceConfig = {
  variance: { label: 'Variance', color: 'hsl(var(--chart-3))' },
} as const

function parseSheetDate(raw: string | null, fallback: string): Date {
  if (!raw) return new Date(fallback)
  const m = raw.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/)
  if (m) {
    const day = parseInt(m[1])
    const month = parseInt(m[2]) - 1
    let year = parseInt(m[3])
    if (year < 100) year += 2000
    return new Date(year, month, day)
  }
  return new Date(raw)
}

function computeForecast(sheets: CashUpSheet[]) {
  const byMonth = new Map<string, number>()
  for (const sheet of sheets) {
    const d = parseSheetDate(sheet.sheet_date, sheet.created_at)
    if (isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    byMonth.set(key, (byMonth.get(key) ?? 0) + calcSheet(sheet).totalActual)
  }

  const sorted = Array.from(byMonth.entries())
    .map(([k, total]) => ({ key: k, total }))
    .sort((a, b) => a.key.localeCompare(b.key))

  if (sorted.length < 2) return { forecastData: [], predicted: null, growth: 0 }

  const rates: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].total > 0)
      rates.push((sorted[i].total - sorted[i - 1].total) / sorted[i - 1].total)
  }
  const avgGrowth = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0

  const overall = sorted.map((m) => m.total)
  const mean    = overall.reduce((a, b) => a + b, 0) / overall.length
  const seasonal = new Map<number, number>()
  for (const m of sorted) {
    const mo   = parseInt(m.key.split('-')[1]) - 1
    const prev = seasonal.get(mo) ?? 0
    seasonal.set(mo, prev === 0 ? m.total / mean : (prev + m.total / mean) / 2)
  }

  const last    = sorted[sorted.length - 1]
  const lastMo  = parseInt(last.key.split('-')[1]) - 1
  const lastYr  = parseInt(last.key.split('-')[0])
  const nextMo  = (lastMo + 1) % 12
  const nextYr  = nextMo === 0 ? lastYr + 1 : lastYr
  const predicted = Math.round(last.total * (1 + avgGrowth) * (seasonal.get(nextMo) ?? 1))

  const forecastData = [
    ...sorted.slice(-8).map((m) => {
      const mo = parseInt(m.key.split('-')[1]) - 1
      const yr = parseInt(m.key.split('-')[0])
      return { month: `${MONTHS[mo]} ${yr}`, actual: Math.round(m.total), predicted: null as number | null }
    }),
    { month: `${MONTHS[nextMo]} ${nextYr}`, actual: null, predicted },
  ]

  return { forecastData, predicted, growth: avgGrowth }
}

export function CashUpAnalysis({ sheets }: { sheets: CashUpSheet[] }) {
  const { forecastData, predicted, growth } = useMemo(() => computeForecast(sheets), [sheets])

  const varianceData = useMemo(() => {
    return sheets
      .map((s) => {
        const d = parseSheetDate(s.sheet_date, s.created_at)
        if (isNaN(d.getTime())) return null
        return {
          date:     `${d.getDate()} ${MONTHS[d.getMonth()]}`,
          variance: Math.round(calcSheet(s).variance),
        }
      })
      .filter(Boolean)
      .slice(-30) as { date: string; variance: number }[]
  }, [sheets])

  const totalSheets = sheets.length
  const overDays    = varianceData.filter((v) => v.variance >= 0).length
  const shortDays   = varianceData.filter((v) => v.variance < 0).length

  return (
    <div className="space-y-6">

      {/* Stat pills */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Avg Monthly Growth"    value={`${(growth * 100).toFixed(1)}%`}    trend={growth} />
        <StatCard label="Next Month Forecast"   value={predicted ? Rk(predicted) : '—'} />
        <StatCard label="Days Over"             value={String(overDays)}   sub="of last 30 entries" positive />
        <StatCard label="Days Short"            value={String(shortDays)}  sub="of last 30 entries" negative />
      </div>

      {/* Forecast line chart */}
      {forecastData.length > 1 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-serif text-base font-bold text-foreground">Revenue Forecast</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Trend growth × seasonal index — last 8 months + next month predicted
              </p>
            </div>
            {predicted && (
              <div className="text-right flex-shrink-0 ml-4">
                <p className="text-xs text-muted-foreground">Predicted next month</p>
                <p className="font-bold text-lg text-primary">{R(predicted)}</p>
              </div>
            )}
          </div>

          <ChartContainer config={forecastConfig} className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={Rk} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => R(Number(v))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="var(--color-actual)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: 'var(--color-actual)' }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="var(--color-predicted)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 5, fill: 'var(--color-predicted)' }}
                  connectNulls={false}
                />
                <ReferenceLine
                  x={forecastData[forecastData.length - 1]?.month}
                  stroke="var(--color-predicted)"
                  strokeDasharray="4 2"
                  strokeOpacity={0.4}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      )}

      {/* Daily variance chart */}
      {varianceData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-foreground">Daily Cash Variance</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Positive = over, negative = short — last 30 sheets
            </p>
          </div>

          <ChartContainer config={varianceConfig} className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={varianceData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R${v}`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => `R${Number(v).toFixed(2)}`} />} />
                <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
                <Bar
                  dataKey="variance"
                  fill="var(--color-variance)"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      )}

      {/* Best Selling Products — coming soon */}
      <div className="bg-card border border-border border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center">
          <BarChart2 size={22} className="text-accent" />
        </div>
        <div>
          <h3 className="font-serif text-base font-semibold text-foreground">Best Selling Products</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Coming soon — product-level sales breakdown will appear here once item data is captured from sheets.
          </p>
        </div>
      </div>

    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, trend, positive, negative,
}: {
  label: string
  value: string
  sub?: string
  trend?: number
  positive?: boolean
  negative?: boolean
}) {
  const accent = positive ? 'text-green-600' : negative ? 'text-destructive' : null

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</p>
      <p className={`font-serif text-xl font-bold mt-1 text-pretty ${accent ?? 'text-foreground'}`}>{value}</p>
      {trend != null && (
        <span className={`flex items-center gap-0.5 text-xs font-semibold mt-1 ${trend >= 0 ? 'text-green-600' : 'text-destructive'}`}>
          {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {Math.abs(trend * 100).toFixed(1)}% avg monthly
        </span>
      )}
      {sub && !trend && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}
