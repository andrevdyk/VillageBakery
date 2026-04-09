'use client'

import { useState, useMemo } from 'react'
import { recordSellerPayment } from '@/lib/actions/curios'
import { calcCuriosCommissions } from '@/lib/calc'
import type { CuriosSheet, Seller } from '@/lib/schema'

interface Payment {
  id: string
  seller_id: string
  payment_date: string
  amount: number
  transaction_number: string | null
  notes: string | null
  period_start: string | null
  period_end: string | null
  curios_sellers?: { name: string; display_name: string | null }
}

interface Props {
  sellers: Seller[]
  sheets: CuriosSheet[]
  payments: Payment[]
}

const R = (v: number) => `R${v.toFixed(2)}`

export function SellerPaymentsPanel({ sellers, sheets, payments: initialPayments }: Props) {
  const [payments, setPayments] = useState(initialPayments)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
  const [txNumber, setTxNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Calculate per-seller totals from all sheets
  const sellerTotals = useMemo(() => {
    const totals = new Map<string, { seller: Seller; totalPayout: number }>()

    for (const seller of sellers) {
      totals.set(seller.id, { seller, totalPayout: 0 })
    }

    for (const sheet of sheets) {
      const entries = sheet.entries ?? []
      const commissions = calcCuriosCommissions(entries, sellers)
      for (const c of commissions) {
        const seller = sellers.find(
          (s) => s.name.toLowerCase().trim() === c.seller_name.toLowerCase().trim()
        )
        if (seller && totals.has(seller.id)) {
          totals.get(seller.id)!.totalPayout += c.seller_payout
        }
      }
    }

    return Array.from(totals.values()).sort((a, b) => b.totalPayout - a.totalPayout)
  }, [sellers, sheets])

  // Total paid per seller from payment records
  const totalPaidBySeller = useMemo(() => {
    const paid = new Map<string, number>()
    for (const p of payments) {
      paid.set(p.seller_id, (paid.get(p.seller_id) ?? 0) + p.amount)
    }
    return paid
  }, [payments])

  function openPayDialog(seller: Seller) {
    setSelectedSeller(seller)
    setTxNumber('')
    setNotes('')
    setPeriodStart('')
    setPeriodEnd('')
    setError('')
    setDialogOpen(true)
  }

  async function handlePay() {
    if (!selectedSeller) return
    const totalEarned = sellerTotals.find((s) => s.seller.id === selectedSeller.id)?.totalPayout ?? 0
    const alreadyPaid = totalPaidBySeller.get(selectedSeller.id) ?? 0
    const amountDue = Math.max(0, totalEarned - alreadyPaid)

    if (amountDue <= 0) {
      setError('No outstanding balance for this seller.')
      return
    }

    setSaving(true)
    setError('')
    const result = await recordSellerPayment({
      seller_id: selectedSeller.id,
      amount: amountDue,
      transaction_number: txNumber.trim() || null,
      notes: notes.trim() || null,
      period_start: periodStart || null,
      period_end: periodEnd || null,
    })
    setSaving(false)

    if (result.error) {
      setError(result.error)
      return
    }

    // Optimistic update
    const newPayment: Payment = {
      id: result.data?.id ?? Math.random().toString(),
      seller_id: selectedSeller.id,
      payment_date: new Date().toISOString(),
      amount: amountDue,
      transaction_number: txNumber.trim() || null,
      notes: notes.trim() || null,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      curios_sellers: { name: selectedSeller.name, display_name: selectedSeller.display_name },
    }
    setPayments((prev) => [newPayment, ...prev])
    setDialogOpen(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-foreground">Seller Payments</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Track weekly payouts to curios sellers</p>
      </div>

      {/* Seller balance cards */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Outstanding Balances</p>
        {sellerTotals.map(({ seller, totalPayout }) => {
          const paid = totalPaidBySeller.get(seller.id) ?? 0
          const outstanding = Math.max(0, totalPayout - paid)
          return (
            <div
              key={seller.id}
              className="bg-card rounded-xl border border-border p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-serif font-semibold text-foreground">
                    {seller.display_name || seller.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {seller.commission_pct}% commission
                  </p>
                </div>
                <button
                  onClick={() => openPayDialog(seller)}
                  disabled={outstanding <= 0}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    outstanding > 0
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  }`}
                >
                  {outstanding > 0 ? 'Mark Paid' : 'All Paid'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/60">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Total Earned</p>
                  <p className="text-xs font-bold text-foreground">{R(totalPayout)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Paid Out</p>
                  <p className="text-xs font-bold text-primary">{R(paid)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Outstanding</p>
                  <p className={`text-xs font-bold ${outstanding > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {R(outstanding)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Payment History</p>
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {payments.map((p) => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {p.curios_sellers?.display_name || p.curios_sellers?.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(p.payment_date).toLocaleDateString('en-ZA', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                      {p.period_start && p.period_end && (
                        <> &middot; {p.period_start} &rarr; {p.period_end}</>
                      )}
                    </p>
                    {p.transaction_number && (
                      <p className="text-xs text-accent mt-0.5 font-mono">
                        Ref: {p.transaction_number}
                      </p>
                    )}
                    {p.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">{p.notes}</p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-primary flex-shrink-0">{R(p.amount)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {payments.length === 0 && sellerTotals.every(({ totalPayout }) => totalPayout === 0) && (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-sm">No sales data yet. Scan some curios sheets first.</p>
        </div>
      )}

      {/* Payment dialog */}
      {dialogOpen && selectedSeller && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDialogOpen(false)} />
          <div className="relative bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <div>
              <h3 className="font-serif text-lg font-bold text-foreground">Record Payment</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedSeller.display_name || selectedSeller.name}
              </p>
            </div>

            {/* Amount due */}
            {(() => {
              const totalEarned = sellerTotals.find((s) => s.seller.id === selectedSeller.id)?.totalPayout ?? 0
              const alreadyPaid = totalPaidBySeller.get(selectedSeller.id) ?? 0
              const amountDue = Math.max(0, totalEarned - alreadyPaid)
              return (
                <div className="bg-muted rounded-xl px-4 py-3 flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Amount to pay</span>
                  <span className="text-lg font-bold text-primary">{R(amountDue)}</span>
                </div>
              )
            })()}

            {/* Transaction number */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Transaction / Reference Number
              </label>
              <input
                type="text"
                placeholder="e.g. EFT-20240401-001"
                value={txNumber}
                onChange={(e) => setTxNumber(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            {/* Period */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Period Start</label>
                <input
                  type="text"
                  placeholder="e.g. 25/3/26"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Period End</label>
                <input
                  type="text"
                  placeholder="e.g. 31/3/26"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Notes (optional)</label>
              <textarea
                placeholder="Any notes about this payment..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setDialogOpen(false)}
                className="flex-1 border border-border rounded-xl py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePay}
                disabled={saving}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
