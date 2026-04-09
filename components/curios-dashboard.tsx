'use client'

import { useState, useMemo } from 'react'
import { CuriosScanner } from '@/components/curios-scanner'
import { SellersManager } from '@/components/sellers-manager'
import { CuriosExportButton } from '@/components/curios-export-button'
import { SellerPaymentsPanel } from '@/components/seller-payments-panel'
import Link from 'next/link'
import type { CuriosSheet, Seller } from '@/lib/schema'
import { calcCuriosCommissions } from '@/lib/calc'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

type Tab = 'scan' | 'overview' | 'daily' | 'payments'

interface Props {
  sellers: Seller[]
  sheets: CuriosSheet[]
  payments: Array<{ id: string; seller_id: string; payment_date: string; amount: number; transaction_number: string | null; notes: string | null; period_start: string | null; period_end: string | null; curios_sellers?: { name: string; display_name: string | null } }>
}

const R = (v: number) => `R${v.toFixed(2)}`

export function CuriosDashboard({ sellers, sheets, payments }: Props) {
  const [tab, setTab] = useState<Tab>('scan')
  const [searchDate, setSearchDate] = useState('')

  // ── Overview stats across all sheets ──
  const overallStats = useMemo(() => {
    let totalSales = 0
    let totalSellerPayout = 0
    let totalBakeryKeeps = 0
    const sellerTotals = new Map<string, { name: string; display_name: string | null; total: number; payout: number; bakery: number }>()

    for (const sheet of sheets) {
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
  }, [sheets, sellers])

  // ── Best selling products ──
  const topProducts = useMemo(() => {
    const productMap = new Map<string, number>()
    for (const sheet of sheets) {
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
  }, [sheets])

  const CHART_COLORS = ['#8B6F4E', '#C4956A', '#D4A76A', '#E8C99A', '#F5E0C0', '#A0856B', '#6B5344', '#B8956A']
  const filteredSheets = useMemo(() => {
    if (!searchDate) return sheets
    return sheets.filter((s) => {
      if (s.sheet_date && s.sheet_date.includes(searchDate)) return true
      const created = new Date(s.created_at).toLocaleDateString('en-ZA')
      return created.includes(searchDate)
    })
  }, [sheets, searchDate])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'scan', label: 'Scan' },
    { key: 'overview', label: 'Overview' },
    { key: 'daily', label: 'Daily' },
    { key: 'payments', label: 'Payments' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-5 pb-12">
      {/* Sub-nav tabs */}
      <nav className="flex gap-1 bg-muted rounded-xl p-1 mb-6 max-w-sm">
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

      {/* ── SCAN TAB ── */}
      {tab === 'scan' && (
        <div className="space-y-6">
          <CuriosScanner sellers={sellers} />
          <div className="bg-card rounded-xl border border-border p-4">
            <SellersManager initialSellers={sellers} />
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <div className="space-y-5">
          <div>
            <h2 className="font-serif text-xl font-bold text-foreground">Curios Overview</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{sheets.length} sheets on record</p>
          </div>

          {/* Summary cards */}
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

          {/* Revenue split + Sales by seller — side by side on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue split pie chart */}
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
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
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

          {/* Sales by seller bar chart */}
          {overallStats.sellerTotals.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Sales by Seller</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={overallStats.sellerTotals.map((s) => ({ name: s.display_name || s.name, total: s.total }))} margin={{ top: 0, right: 4, left: -16, bottom: 0 }}>
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
          </div>{/* end chart grid */}

          {/* Best selling products + Per-seller breakdown — side by side on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Best selling products */}
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

          {/* Per-seller breakdown table */}
          {overallStats.sellerTotals.length > 0 && (
            <section className="bg-card rounded-xl border border-border divide-y divide-border">
              <div className="px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">By Seller — All Time</p>
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
          </div>{/* end bottom grid */}

          {/* All sheets list */}
          {sheets.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">All Sheets</p>
                <CuriosExportButton sheets={sheets} sellers={sellers} />
              </div>
              {sheets.map((sheet) => {
                const entries = sheet.entries ?? []
                const total = entries.reduce((s, e) => s + (e.amount ?? 0), 0)
                return (
                  <Link
                    key={sheet.id}
                    href={`/curios/${sheet.id}`}
                    className="flex items-center justify-between bg-card rounded-xl border border-border px-4 py-3 hover:border-accent/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{sheet.sheet_date ?? 'Undated'}</p>
                      <p className="text-xs text-muted-foreground">{entries.length} entries</p>
                    </div>
                    <p className="text-sm font-bold text-primary">{R(total)}</p>
                  </Link>
                )
              })}
            </section>
          )}

          {sheets.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No sheets yet. Use the Scan tab to add one.</p>
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
            placeholder="Search date — e.g. 31/3 or 2026-04-01"
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
                  <Link
                    key={sheet.id}
                    href={`/curios/${sheet.id}`}
                    className="block bg-card rounded-xl border border-border p-4 hover:border-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-serif font-semibold text-foreground">{sheet.sheet_date ?? 'Undated'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} &middot;{' '}
                          {new Date(sheet.created_at).toLocaleDateString('en-ZA')}
                        </p>
                      </div>
                      <p className="font-bold text-primary text-sm">{R(total)}</p>
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
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PAYMENTS TAB ── */}
      {tab === 'payments' && (
        <SellerPaymentsPanel sellers={sellers} sheets={sheets} payments={payments} />
      )}
    </div>
  )
}
