'use client'

import { Header } from '@/components/header'
import { getCuriosSheet, getSellers, createSeller } from '@/lib/actions/curios'
import { calcCuriosCommissions } from '@/lib/calc'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import type { CurioEntry, Seller, SellerSummary, UnknownSeller } from '@/lib/schema'

const R = (v: number | null | undefined) => `R${(Number(v) || 0).toFixed(2)}`

// ─── Add Seller inline widget ─────────────────────────────────────────────────

function AddSellerCard({
  unknown,
  onAdded,
}: {
  unknown: UnknownSeller
  onAdded: (seller: Seller) => void
}) {
  const [name, setName] = useState(unknown.suggested_name)
  const [displayName, setDisplayName] = useState('')
  const [commission, setCommission] = useState('20')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        <span className="text-green-600 text-sm">✓</span>
        <p className="text-xs font-medium text-green-800">{name} added as a seller.</p>
      </div>
    )
  }

  function handleAdd() {
    setError(null)
    if (!name.trim()) { setError('Name is required'); return }
    const pct = parseFloat(commission)
    if (isNaN(pct) || pct < 0 || pct > 100) { setError('Commission must be 0–100'); return }

    startTransition(async () => {
      try {
        const result = await createSeller({
          name: name.trim(),
          display_name: displayName.trim() || null,
          commission_pct: pct,
        })
        if (result.error) { setError(result.error); return }
        setDone(true)
        onAdded(result.data as Seller)
      } catch {
        setError('Failed to add seller. Please try again.')
      }
    })
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-orange-800">New seller detected</p>
          <p className="text-xs text-orange-700 mt-0.5">
            Seen on sheet as <span className="font-mono bg-orange-100 px-1 rounded">{unknown.raw_name}</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-[11px] font-medium text-orange-800 uppercase tracking-wide block mb-1">
            Seller name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Anna"
            className="w-full text-sm px-3 py-2 rounded-lg border border-orange-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 text-foreground"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-orange-800 uppercase tracking-wide block mb-1">
            Display name <span className="font-normal normal-case text-orange-600">(optional)</span>
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Anna van Wyk"
            className="w-full text-sm px-3 py-2 rounded-lg border border-orange-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 text-foreground"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-orange-800 uppercase tracking-wide block mb-1">
            Commission %
          </label>
          <input
            type="number"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            min="0"
            max="100"
            step="1"
            className="w-24 text-sm px-3 py-2 rounded-lg border border-orange-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 text-foreground"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <button
        onClick={handleAdd}
        disabled={isPending}
        className="w-full text-sm font-semibold py-2 px-4 rounded-lg bg-orange-500 text-white hover:bg-orange-600 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Adding…' : 'Add seller'}
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default async function CuriosDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [{ data: sheet }, { data: sellers }] = await Promise.all([
    getCuriosSheet(id),
    getSellers(),
  ])

  if (!sheet) notFound()

  const entries = sheet.entries ?? []
  const unknownSellers: UnknownSeller[] = (sheet as any).unknown_sellers ?? []

  const cashTotal = entries
    .filter((e: CurioEntry) => e.payment_type === 'cash')
    .reduce((s: number, e: CurioEntry) => s + (e.amount ?? 0), 0)
  const cardTotal = entries
    .filter((e: CurioEntry) => e.payment_type === 'card')
    .reduce((s: number, e: CurioEntry) => s + (e.amount ?? 0), 0)
  const grandTotal = cashTotal + cardTotal
  const commissions = calcCuriosCommissions(entries, sellers as Seller[])
  const totalSellerPayout = commissions.reduce((s: number, c: SellerSummary) => s + c.seller_payout, 0)
  const totalBakeryKeeps = commissions.reduce((s: number, c: SellerSummary) => s + c.bakery_keeps, 0)

  const carriedCount = entries.filter((e: CurioEntry) => e.carried_forward).length

  const SectionHead = ({ title }: { title: string }) => (
    <h3 className="font-serif text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
      {title}
    </h3>
  )

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6 pb-10 space-y-5">

        {/* Back */}
        <Link href="/curios" className="text-xs text-accent underline underline-offset-2">
          &larr; Back to Curios
        </Link>

        {/* Header */}
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">
            Curios — {sheet.sheet_date ?? 'Undated'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Saved{' '}
            {new Date(sheet.created_at).toLocaleDateString('en-ZA', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* Unknown sellers — inline add flow */}
        {unknownSellers.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">🆕</span>
              <h2 className="font-serif text-sm font-semibold text-foreground">
                {unknownSellers.length === 1
                  ? '1 new seller found on this sheet'
                  : `${unknownSellers.length} new sellers found on this sheet`}
              </h2>
            </div>
            {unknownSellers.map((u, i) => (
              <AddSellerCard
                key={i}
                unknown={u}
                onAdded={() => {
                  // Parent is a server component — a soft refresh will re-run
                  // commissions once the seller exists. The card itself shows
                  // a "done" state immediately so the user gets instant feedback.
                }}
              />
            ))}
          </section>
        )}

        {/* Carry-forward warning */}
        {carriedCount > 0 && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="text-base leading-none mt-0.5">⚠️</span>
            <div>
              <p className="text-xs font-semibold text-amber-800">
                {carriedCount} entr{carriedCount === 1 ? 'y' : 'ies'} with inferred seller name
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                The name cell was blank or a ditto mark — seller carried forward from the row above.
                Please verify these are correct.
              </p>
            </div>
          </div>
        )}

        {/* Image */}
        {sheet.image_url && (
          <div className="rounded-xl overflow-hidden border border-border/60 max-h-48">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sheet.image_url}
              alt="Curios sales sheet"
              className="w-full object-cover max-h-48"
            />
          </div>
        )}

        {/* Sales entries */}
        <section className="bg-card rounded-xl border border-border p-4">
          <SectionHead title="Sales Entries" />
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No entries recorded.</p>
          ) : (
            <div className="space-y-1">
              {entries.map((entry: CurioEntry, i: number) => (
                <div
                  key={i}
                  className={`flex items-center justify-between py-2 border-b border-border/40 last:border-0 gap-2 ${
                    entry.carried_forward ? 'bg-amber-50/60 -mx-1 px-1 rounded-lg' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {entry.name || '—'}
                      </p>
                      {entry.carried_forward && (
                        <span
                          title="Seller name was blank on the sheet — carried forward from row above"
                          className="text-amber-500 text-xs leading-none flex-shrink-0"
                        >
                          ⚠️
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.description || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        entry.payment_type === 'cash'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {entry.payment_type}
                    </span>
                    <span className="text-sm font-bold">{R(entry.amount ?? 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Totals */}
        <section className="bg-card rounded-xl border border-border p-4 space-y-2">
          <SectionHead title="Totals" />
          <div className="flex justify-between py-2 px-3 bg-muted/50 rounded-lg">
            <span className="text-xs text-muted-foreground">Cash</span>
            <span className="text-sm font-semibold">{R(cashTotal)}</span>
          </div>
          <div className="flex justify-between py-2 px-3 bg-muted/50 rounded-lg">
            <span className="text-xs text-muted-foreground">Card</span>
            <span className="text-sm font-semibold">{R(cardTotal)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-primary/8 border border-primary/20 rounded-lg">
            <span className="text-xs font-semibold text-foreground">Grand Total</span>
            <span className="text-sm font-bold text-primary">{R(grandTotal)}</span>
          </div>
        </section>

        {/* Commissions per seller */}
        {commissions.length > 0 && (
          <section className="space-y-3">
            <SectionHead title="Commissions by Seller" />
            {commissions.map((c, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <p className="font-serif font-semibold text-foreground text-sm">
                    {c.display_name || c.seller_name}
                  </p>
                  <span className="text-xs font-bold text-accent bg-accent/10 rounded-full px-2.5 py-1">
                    {c.commission_pct}%
                  </span>
                </div>
                <div className="space-y-1 pt-1 border-t border-border/60">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total Sales</span>
                    <span className="font-semibold">{R(c.total_sales)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Seller Payout</span>
                    <span className="font-semibold text-destructive">{R(c.seller_payout)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Village Bakery Keeps</span>
                    <span className="font-semibold text-primary">{R(c.bakery_keeps)}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Grand summary */}
            <div className="bg-primary/5 rounded-xl border border-primary/20 p-4 space-y-2">
              <div className="flex justify-between py-2 px-3 bg-background rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Total Curios Sales</span>
                <span className="text-sm font-bold">{R(grandTotal)}</span>
              </div>
              <div className="flex justify-between py-2 px-3 bg-destructive/5 rounded-lg border border-destructive/20">
                <span className="text-xs text-muted-foreground">Total Seller Payouts</span>
                <span className="text-sm font-bold text-destructive">{R(totalSellerPayout)}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-primary/8 rounded-lg border border-primary/20">
                <span className="text-xs font-semibold text-foreground">Village Bakery Total</span>
                <span className="text-sm font-bold text-primary">{R(totalBakeryKeeps)}</span>
              </div>
            </div>
          </section>
        )}

        {sheet.notes && (
          <section className="bg-card rounded-xl border border-border p-4">
            <SectionHead title="Notes" />
            <p className="text-sm text-foreground whitespace-pre-wrap">{sheet.notes}</p>
          </section>
        )}

      </div>
    </main>
  )
}