'use client'

import { useState, useMemo } from 'react'
import { CuriosScanner } from '@/components/curios-scanner'
import { SellersManager } from '@/components/sellers-manager'
import { CuriosExportButton } from '@/components/curios-export-button'
import { SellerPaymentsPanel } from '@/components/seller-payments-panel'
import { SheetEditModal } from '@/components/sheet-edit-modal'
import Link from 'next/link'
import type { CuriosSheet, CurioEntry, Seller } from '@/lib/schema'
import { calcCuriosCommissions } from '@/lib/calc'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

type Tab = 'scan' | 'overview' | 'daily' | 'payments'
type Preset = 'all' | 'this_week' | 'this_month' | 'last_month' | 'custom'

interface Props {
  sellers: Seller[]
  sheets: CuriosSheet[]
  payments: Array<{
    id: string
    seller_id: string
    payment_date: string
    amount: number
    transaction_number: string | null
    notes: string | null
    period_start: string | null
    period_end: string | null
    curios_sellers?: { name: string; display_name: string | null }
  }>
  onUpdateSheet?: (
    id: string,
    data: { sheet_date?: string; entries?: CurioEntry[]; notes?: string }
  ) => Promise<{ error?: string; existingDate?: string } | void>
}

const R = (v: number) => `R${v.toFixed(2)}`

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Formats any stored date string as "14 April 2026".
 * Handles yyyy-mm-dd, dd/mm/yyyy, and ISO timestamps.
 */
function formatDisplayDate(raw: string | null | undefined): string {
  if (!raw) return 'Undated'
  let d: Date

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // Parse as local date to avoid UTC-offset shifting the day
    const [y, m, day] = raw.split('-').map(Number)
    d = new Date(y, m - 1, day)
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [day, m, y] = raw.split('/').map(Number)
    d = new Date(y, m - 1, day)
  } else {
    d = new Date(raw)
  }

  if (isNaN(d.getTime())) return raw

  return d.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function getPresetRange(preset: Preset): { from: Date | null; to: Date | null } {
  const now = new Date()
  if (preset === 'all') return { from: null, to: null }
  if (preset === 'this_week') {
    const day = now.getDay()
    const from = new Date(now)
    from.setDate(now.getDate() - day)
    from.setHours(0, 0, 0, 0)
    const to = new Date(now)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }
  if (preset === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }
  if (preset === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    return { from, to }
  }
  return { from: null, to: null }
}

function sheetDate(sheet: CuriosSheet): Date {
  if (sheet.sheet_date) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(sheet.sheet_date)) {
      const [y, m, d] = sheet.sheet_date.split('-').map(Number)
      return new Date(y, m - 1, d)
    }
    const parts = sheet.sheet_date.split('/')
    if (parts.length === 3) {
      return new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`)
    }
  }
  return new Date(sheet.created_at)
}

function EditButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      title="Edit sheet"
      className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
        <path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.226 12.25a2.751 2.751 0 0 1-.892.58l-2.18.818a.75.75 0 0 1-.965-.965l.818-2.18a2.75 2.75 0 0 1 .58-.892l7.426-7.098Z" />
      </svg>
      Edit
    </button>
  )
}

export function CuriosDashboard({ sellers, sheets, payments, onUpdateSheet }: Props) {
  const [tab, setTab] = useState<Tab>('scan')
  const [searchDate, setSearchDate] = useState('')
  const [editingSheet, setEditingSheet] = useState<CuriosSheet | null>(null)

  const [preset, setPreset] = useState<Preset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const activeDateRange = useMemo((): { from: Date | null; to: Date | null } => {
    if (preset === 'custom') {
      const from = customFrom ? new Date(customFrom + 'T00:00:00') : null
      const to = customTo ? new Date(customTo + 'T23:59:59') : null
      return { from, to }
    }
    return getPresetRange(preset)
  }, [preset, customFrom, customTo])

  const periodSheets = useMemo(() => {
    const { from, to } = activeDateRange
    if (!from && !to) return sheets
    return sheets.filter((s) => {
      const d = sheetDate(s)
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    })
  }, [sheets, activeDateRange])

  const periodPayments = useMemo(() => {
    const { from, to } = activeDateRange
    if (!from && !to) return payments
    return payments.filter((p) => {
      const d = new Date(p.payment_date)
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    })
  }, [payments, activeDateRange])

  const overallStats = useMemo(() => {
    let totalSales = 0
    let totalSellerPayout = 0
    let totalBakeryKeeps = 0
    const sellerTotals = new Map<string, { name: string; display_name: string | null; total: number; payout: number; bakery: number }>()

    for (const sheet of periodSheets) {
      const entries = sheet.entries ?? []
      const commissions = calcCuriosCommissions(entries, sellers)
      for (const c of commissions) {
        totalSales += c.total_sales
        totalSellerPayout += c.seller_payout
        totalBakeryKeeps += c.bakery_keeps
        const key = c.seller_name.toLowerCase().trim()
        const existing = sellerTotals.get(key)
        if (existing) {
          existing.total += c.total_sales
          existing.payout += c.seller_payout
          existing.bakery += c.bakery_keeps
        } else {
          sellerTotals.set(key, {
            name: c.seller_name,
            display_name: c.display_name,
            total: c.total_sales,
            payout: c.seller_payout,
            bakery: c.bakery_keeps,
          })
        }
      }
    }

    return {
      totalSales,
      totalSellerPayout,
      totalBakeryKeeps,
      sellerTotals: Array.from(sellerTotals.values()).sort((a, b) => b.total - a.total),
    }
  }, [periodSheets, sellers])

  const topProducts = useMemo(() => {
    const productMap = new Map<string, number>()
    for (const sheet of periodSheets) {
      for (const entry of (sheet.entries ?? [])) {
        const key = (entry.description || '').trim().toLowerCase()
        if (!key) continue
        productMap.set(key, (productMap.get(key) ?? 0) + (entry.amount ?? 0))
      }
    }
    return Array.from(productMap.entries())
      .map(([name, total]) => ({ name: name.slice(0, 22), total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [periodSheets])

  const CHART_COLORS = ['#8B6F4E', '#C4956A', '#D4A76A', '#E8C99A', '#F5E0C0', '#A0856B', '#6B5344', '#B8956A']

  const filteredSheets = useMemo(() => {
    let result = periodSheets
    if (searchDate) {
      result = result.filter((s) => {
        if (s.sheet_date && s.sheet_date.includes(searchDate)) return true
        const created = new Date(s.created_at).toLocaleDateString('en-ZA')
        return created.includes(searchDate)
      })
    }
    return result
  }, [periodSheets, searchDate])

  const presets: { key: Preset; label: string }[] = [
    { key: 'all', label: 'All time' },
    { key: 'this_week', label: 'This week' },
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'custom', label: 'Custom' },
  ]

  const tabs: { key: Tab; label: string }[] = [
    { key: 'scan', label: 'Scan' },
    { key: 'overview', label: 'Overview' },
    { key: 'daily', label: 'Daily' },
    { key: 'payments', label: 'Payments' },
  ]

  const isFiltered = preset !== 'all'

  const openEdit = (sheet: CuriosSheet, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEditingSheet(sheet)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-5 pb-12">

      {/* Edit modal */}
      {editingSheet && (
        <SheetEditModal
          sheet={editingSheet}
          sellers={sellers}
          open={!!editingSheet}
          onClose={() => setEditingSheet(null)}
          onSave={onUpdateSheet ?? (async () => {})}
        />
      )}

      {/* Sub-nav tabs */}
      <nav className="flex gap-1 bg-muted rounded-xl p-1 mb-4 max-w-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${
              tab === t.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── DATE FILTER BAR ── */}
      <div className="bg-card border border-border rounded-xl p-3 mb-6 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                preset === p.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
          {isFiltered && preset !== 'custom' && (
            <span className="ml-auto text-[10px] text-muted-foreground self-center">
              {periodSheets.length} of {sheets.length} sheets
            </span>
          )}
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="flex-1 min-w-0 bg-muted border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="flex-1 min-w-0 bg-muted border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {periodSheets.length} of {sheets.length} sheets
            </span>
          </div>
        )}
      </div>

      {/* ── SCAN TAB ── */}
      {tab === 'scan' && (
        <div className="space-y-6">
          <CuriosScanner sellers={sellers} />
          <div className="bg-card rounded-xl border border-border p-4">
            <SellersManager initialSellers={sellers} />
          </div>
        </div>
      )}

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div>
            <h2 className="font-serif text-xl font-bold text-foreground">Curios Overview</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{periodSheets.length} sheets {isFiltered ? 'in period' : 'on record'}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card rounded-xl border border-border p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Total Sales</p>
              <p className="font-bold text-primary text-sm">{R(overallStats.totalSales)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">To Sellers</p>
              <p className="font-bold text-destructive text-sm">{R(overallStats.totalSellerPayout)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Bakery Keeps</p>
              <p className="font-bold text-foreground text-sm">{R(overallStats.totalBakeryKeeps)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {overallStats.totalSales > 0 && (
              <section className="bg-card rounded-xl border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Revenue Split</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Bakery Keeps', value: overallStats.totalBakeryKeeps },
                        { name: 'Seller Payouts', value: overallStats.totalSellerPayout },
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={80}
                      paddingAngle={3} dataKey="value"
                    >
                      <Cell fill="#8B6F4E" />
                      <Cell fill="#C4956A" />
                    </Pie>
                    <Tooltip formatter={(v: number) => `R${v.toFixed(2)}`} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </section>
            )}

            {overallStats.sellerTotals.length > 0 && (
              <section className="bg-card rounded-xl border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Sales by Seller</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={overallStats.sellerTotals.map((s) => ({ name: s.display_name || s.name, total: s.total }))}
                    margin={{ top: 0, right: 4, left: -16, bottom: 0 }}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R${v}`} />
                    <Tooltip formatter={(v: number) => `R${v.toFixed(2)}`} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {overallStats.sellerTotals.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </section>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {topProducts.length > 0 && (
              <section className="bg-card rounded-xl border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Best Selling Products</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `R${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip formatter={(v: number) => `R${v.toFixed(2)}`} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {topProducts.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </section>
            )}

            {overallStats.sellerTotals.length > 0 && (
              <section className="bg-card rounded-xl border border-border divide-y divide-border">
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    By Seller — {isFiltered ? 'Period' : 'All Time'}
                  </p>
                </div>
                {overallStats.sellerTotals.map((s) => (
                  <div key={s.name} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{s.display_name || s.name}</p>
                      <p className="text-xs text-muted-foreground">Payout: {R(s.payout)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">{R(s.total)}</p>
                      <p className="text-[10px] text-muted-foreground">Bakery: {R(s.bakery)}</p>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>

          {periodSheets.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">All Sheets</p>
                <CuriosExportButton sheets={periodSheets} sellers={sellers} />
              </div>
              {periodSheets.map((sheet) => {
                const entries = sheet.entries ?? []
                const total = entries.reduce((s, e) => s + (e.amount ?? 0), 0)
                return (
                  <div
                    key={sheet.id}
                    className="flex items-center justify-between bg-card rounded-xl border border-border px-4 py-3 hover:border-accent/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatDisplayDate(sheet.sheet_date)}
                      </p>
                      <p className="text-xs text-muted-foreground">{entries.length} entries</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-sm font-bold text-primary">{R(total)}</p>
                      {onUpdateSheet && <EditButton onClick={(e) => openEdit(sheet, e)} />}
                      <Link
                        href={`/curios/${sheet.id}`}
                        className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg bg-muted hover:bg-muted/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          {periodSheets.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">
                {isFiltered ? 'No sheets found in this period.' : 'No sheets yet. Use the Scan tab to add one.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── DAILY TAB ── */}
      {tab === 'daily' && (
        <div className="space-y-5">
          <div>
            <h2 className="font-serif text-xl font-bold text-foreground">Daily View</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Search by date or sheet date</p>
          </div>

          <input
            type="text"
            placeholder="Narrow further — e.g. 31/3 or 2026-04-01"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          />

          {filteredSheets.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p className="text-sm">No sheets found for that date.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSheets.map((sheet) => {
                const entries = sheet.entries ?? []
                const total = entries.reduce((s, e) => s + (e.amount ?? 0), 0)
                const commissions = calcCuriosCommissions(entries, sellers)
                const totalPayout = commissions.reduce((s, c) => s + c.seller_payout, 0)
                const totalBakery = commissions.reduce((s, c) => s + c.bakery_keeps, 0)
                return (
                  <div
                    key={sheet.id}
                    className="bg-card rounded-xl border border-border p-4 hover:border-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-serif font-semibold text-foreground">
                          {formatDisplayDate(sheet.sheet_date)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} &middot;{' '}
                          {formatDisplayDate(sheet.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="font-bold text-primary text-sm">{R(total)}</p>
                        {onUpdateSheet && <EditButton onClick={(e) => openEdit(sheet, e)} />}
                        <Link
                          href={`/curios/${sheet.id}`}
                          className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg bg-muted hover:bg-muted/80"
                        >
                          View →
                        </Link>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-3 pt-3 border-t border-border/60">
                      <div className="flex-1 text-center">
                        <p className="text-[10px] text-muted-foreground">Seller Payout</p>
                        <p className="text-sm font-bold text-destructive">{R(totalPayout)}</p>
                      </div>
                      <div className="w-px bg-border" />
                      <div className="flex-1 text-center">
                        <p className="text-[10px] text-muted-foreground">Village Bakery</p>
                        <p className="text-sm font-bold text-primary">{R(totalBakery)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PAYMENTS TAB ── */}
      {tab === 'payments' && (
        <SellerPaymentsPanel sellers={sellers} sheets={periodSheets} payments={periodPayments} />
      )}
    </div>
  )
}