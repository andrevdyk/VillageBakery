'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, ArrowLeft, AlertCircle, Loader2, Download } from 'lucide-react'
import { deleteCashUpSheet } from '@/lib/actions/invoices'
import { calcSheet } from '@/lib/calc'
import type { CashUpSheet } from '@/lib/schema'

type Tab = 'cashup' | 'curios'

export function InvoiceDetailClient({ sheet }: { sheet: CashUpSheet }) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [tab, setTab] = useState<Tab>('cashup')

  const calc = calcSheet(sheet)

  const curiosCash = (sheet.curios_sales ?? [])
    .filter((c) => c.payment_type === 'cash')
    .reduce((s, c) => s + (c.amount ?? 0), 0)
  const curiosCard = (sheet.curios_sales ?? [])
    .filter((c) => c.payment_type === 'card')
    .reduce((s, c) => s + (c.amount ?? 0), 0)

  const handleDelete = async () => {
    setIsDeleting(true)
    const result = await deleteCashUpSheet(sheet.id)
    if (result.error) {
      setError(result.error)
      setIsDeleting(false)
    } else {
      router.push('/sheets')
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await fetch('/api/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheets: [sheet] }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cashup-${sheet.sheet_date ?? sheet.id}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const Rv = (val: number | null | undefined) =>
    val != null ? `R${Number(val).toFixed(2)}` : '—'

  const Row = ({
    label,
    value,
    bold,
    colored,
  }: {
    label: string
    value: string
    bold?: boolean
    colored?: 'positive' | 'negative'
  }) => (
    <div
      className={`flex items-center justify-between py-2.5 border-b border-border/50 last:border-0 ${bold ? 'font-semibold' : ''}`}
    >
      <span className={`text-sm ${bold ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      <span
        className={`text-sm ${
          colored === 'positive'
            ? 'text-green-700 font-bold'
            : colored === 'negative'
            ? 'text-destructive font-bold'
            : bold
            ? 'text-primary'
            : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  )

  const CalcRow = ({ label, value, isVariance }: { label: string; value: number; isVariance?: boolean }) => (
    <div className={`flex items-center justify-between py-2.5 px-3 rounded-lg mb-1 ${
      isVariance
        ? value >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        : 'bg-primary/8 border border-primary/20'
    }`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${
        isVariance
          ? value >= 0 ? 'text-green-700' : 'text-destructive'
          : 'text-primary'
      }`}>
        {value >= 0 ? `R${value.toFixed(2)}` : `-R${Math.abs(value).toFixed(2)}`}
      </span>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 transition-colors disabled:opacity-60"
          >
            {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Export CSV
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-sm text-destructive hover:text-destructive/80 transition-colors"
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          <AlertCircle size={16} className="text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Delete this cash up sheet?</p>
          <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 border border-border rounded-lg py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 bg-destructive text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isDeleting && <Loader2 size={14} className="animate-spin" />}
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <section className="bg-primary rounded-xl px-5 py-5">
        <p className="text-xs text-accent/80 uppercase tracking-widest font-medium">Daily Cash Up</p>
        <h2 className="font-serif text-lg font-bold text-primary-foreground mt-0.5">
          {sheet.sheet_date ?? 'No date captured'}
        </h2>
        <p className="text-3xl font-bold text-primary-foreground mt-2">{Rv(calc.totalActual)}</p>
        <p className="text-xs text-accent/80 mt-0.5">Total Actual</p>
      </section>

      {/* Tabs */}
      <div className="flex bg-muted rounded-xl p-1 gap-1">
        {(['cashup', 'curios'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? 'bg-card text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'cashup' ? 'Daily Cash Up' : `Curios (${sheet.curios_sales?.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* ─── CASH UP TAB ─── */}
      {tab === 'cashup' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left column: cash, slips, sales summary */}
          <div className="space-y-4">
            <section className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <h3 className="font-serif text-xs font-semibold text-muted-foreground uppercase tracking-widest">Cash</h3>
              </div>
              <div className="px-4 py-2">
                <Row label="Total Cash" value={Rv(sheet.total_cash)} bold />
                <Row label="Less Float" value="R1,000.00" />
                <Row label="Total Cash to Take Out" value={`R${calc.totalCashToTakeOut.toFixed(2)}`} bold />
              </div>
            </section>

            {sheet.slips_paid_out && sheet.slips_paid_out.length > 0 && (
              <section className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <h3 className="font-serif text-xs font-semibold text-muted-foreground uppercase tracking-widest">Slips Paid Out</h3>
                </div>
                <div className="px-4 py-2">
                  {sheet.slips_paid_out.map((slip, i) => (
                    <Row key={i} label={slip.description || `Slip ${i + 1}`} value={Rv(slip.amount)} />
                  ))}
                  <Row label="Slips Total" value={`R${calc.slipsTotal.toFixed(2)}`} bold />
                </div>
              </section>
            )}

            <section className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <h3 className="font-serif text-xs font-semibold text-muted-foreground uppercase tracking-widest">Sales Summary</h3>
              </div>
              <div className="px-4 py-2">
                <Row label="Total Cash Received" value={`R${calc.totalCashReceived.toFixed(2)}`} bold />
                <Row label="Credit Card / Yoco" value={Rv(sheet.credit_card_yoco)} />
                <Row label="Accounts" value={Rv(sheet.charged_sales_accounts)} />
              </div>
              <div className="px-4 pb-3 pt-1">
                <CalcRow label="Total Actual (Cash + Card + Accounts)" value={calc.totalActual} />
              </div>
            </section>
          </div>

          {/* Right column: till reconciliation, notes, original image */}
          <div className="space-y-4">
            <section className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <h3 className="font-serif text-xs font-semibold text-muted-foreground uppercase tracking-widest">Till Reconciliation</h3>
              </div>
              <div className="px-4 py-2">
                <Row label="Till Total (Z Print Out)" value={Rv(sheet.till_total_z_print)} bold />
              </div>
              <div className="px-4 pb-3 pt-1">
                <CalcRow
                  label={`Over / Short Variance${calc.variance >= 0 ? ' (Over)' : ' (Short)'}`}
                  value={calc.variance}
                  isVariance
                />
              </div>
            </section>

            {sheet.notes && (
              <section className="bg-card border border-border rounded-xl p-4">
                <h3 className="font-serif text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Notes</h3>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{sheet.notes}</p>
              </section>
            )}

            {sheet.image_url && (
              <section className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <h3 className="font-serif text-xs font-semibold text-muted-foreground uppercase tracking-widest">Original Sheet</h3>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sheet.image_url} alt="Original cash up sheet" className="w-full object-contain max-h-[600px]" />
              </section>
            )}
          </div>
        </div>
      )}

      {/* ─── CURIOS TAB ─── */}
      {tab === 'curios' && (
        <div className="space-y-4">
          <section className="bg-card border border-border rounded-xl p-4 space-y-2">
            <h3 className="font-serif text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Curios Totals</h3>
            <CalcRow label="Cash Sales" value={curiosCash} />
            <CalcRow label="Card Sales" value={curiosCard} />
            <CalcRow label="Total Curios" value={curiosCash + curiosCard} />
          </section>

          {(sheet.curios_sales ?? []).length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <p className="text-muted-foreground text-sm">No curios sales recorded.</p>
            </div>
          ) : (
            <section className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <h3 className="font-serif text-xs font-semibold text-muted-foreground uppercase tracking-widest">Line Items</h3>
              </div>
              <div className="divide-y divide-border/50">
                {(sheet.curios_sales ?? []).map((c, i) => (
                  <div key={i} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{c.name || '—'}</p>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.payment_type === 'card' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {c.payment_type === 'card' ? 'Card' : 'Cash'}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{Rv(c.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
