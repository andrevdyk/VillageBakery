'use client'

import { useState } from 'react'
import { Plus, Trash2, Save, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { calcCuriosCommissions } from '@/lib/calc'
import { matchSellerName } from '@/lib/seller-aliases'
import type { ExtractedCuriosData, CurioEntry, Seller } from '@/lib/schema'

interface CuriosFormProps {
  data: ExtractedCuriosData
  sellers: Seller[]
  onSave: (data: ExtractedCuriosData) => Promise<void>
  isSaving: boolean
}

type Tab = 'entries' | 'commissions'

const toNum = (val: string): number | null => {
  const parsed = parseFloat(val)
  return isNaN(parsed) ? null : parsed
}
const R = (val: number) => `R${val.toFixed(2)}`

export function CuriosForm({ data, sellers, onSave, isSaving }: CuriosFormProps) {
  const [form, setForm] = useState<ExtractedCuriosData>(data)
  const [tab, setTab] = useState<Tab>('entries')

  const set = <K extends keyof ExtractedCuriosData>(key: K, val: ExtractedCuriosData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const updateEntry = (i: number, field: keyof CurioEntry, val: string) => {
    const updated = [...(form.entries ?? [])]
    if (field === 'amount') {
      updated[i] = { ...updated[i], amount: toNum(val) }
    } else if (field === 'commission_pct') {
      updated[i] = { ...updated[i], commission_pct: val === '' ? null : toNum(val) }
    } else {
      updated[i] = { ...updated[i], [field]: val }
    }
    set('entries', updated)
  }

  const addEntry = () =>
    set('entries', [
      ...(form.entries ?? []),
      { name: '', description: '', amount: null, payment_type: 'cash', commission_pct: null },
    ])

  const removeEntry = (i: number) =>
    set('entries', (form.entries ?? []).filter((_, idx) => idx !== i))

  const entries = form.entries ?? []
  const cashTotal = entries.filter((e) => e.payment_type === 'cash').reduce((s, e) => s + (e.amount ?? 0), 0)
  const cardTotal = entries.filter((e) => e.payment_type === 'card').reduce((s, e) => s + (e.amount ?? 0), 0)
  const grandTotal = cashTotal + cardTotal

  const commissions = calcCuriosCommissions(entries, sellers)
  const totalBakeryKeeps = commissions.reduce((s, c) => s + c.bakery_keeps, 0)
  const totalSellerPayout = commissions.reduce((s, c) => s + c.seller_payout, 0)

  // Find entries whose name doesn't match any canonical seller
  const unmatchedIndices = entries.reduce<number[]>((acc, e, i) => {
    if (!e.name.trim()) return [...acc, i]
    const matched = matchSellerName(e.name)
    if (!matched) return [...acc, i]
    return acc
  }, [])
  const hasUnmatched = unmatchedIndices.length > 0

  // Auto-resolve seller name on blur
  const handleNameBlur = (i: number, raw: string) => {
    const matched = matchSellerName(raw)
    if (matched) {
      const seller = sellers.find((s) => s.name.toLowerCase() === matched)
      if (seller) {
        const updated = [...entries]
        updated[i] = { ...updated[i], name: seller.name }
        set('entries', updated)
      }
    }
  }

  // Seller name options
  const sellerNames = sellers.map((s) => s.name)

  const SectionHead = ({ title }: { title: string }) => (
    <h3 className="font-serif text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
      {title}
    </h3>
  )

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex bg-muted rounded-xl p-1 gap-1">
        {(['entries', 'commissions'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? 'bg-card text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'entries' ? 'Sales Entries' : 'Commissions'}
          </button>
        ))}
      </div>

      {/* ─── ENTRIES TAB ─── */}
      {tab === 'entries' && (
        <div className="space-y-4">
          {/* Date */}
          <section className="bg-card rounded-xl border border-border p-4">
            <SectionHead title="Sheet Date" />
            <Input
              value={form.sheet_date ?? ''}
              onChange={(e) => set('sheet_date', e.target.value || null)}
              placeholder="31/3/26"
              className="bg-background border-border"
            />
          </section>

          {/* Entries */}
          <section className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHead title="Sales Entries" />
              <button
                onClick={addEntry}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 font-medium -mt-3"
              >
                <Plus size={13} /> Add Row
              </button>
            </div>

            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No entries yet. Add a row or scan a sheet.
              </p>
            ) : (
                  <div className="space-y-2">
                {entries.map((entry, i) => (
                  <div key={i} className="bg-muted/40 rounded-lg p-3 border border-border/50 space-y-2 relative">
                    <button
                      onClick={() => removeEntry(i)}
                      className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={13} />
                    </button>

                    {/* Desktop: 4-col grid | Mobile: 2-col */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pr-6">
                      <div>
                        <Label className="text-xs text-muted-foreground">Seller Name</Label>
                        {unmatchedIndices.includes(i) ? (
                          <div className="mt-1 space-y-2">
                            <div className="flex items-center gap-1.5 p-1.5 bg-destructive/10 border border-destructive/40 rounded-lg">
                              <AlertTriangle size={11} className="text-destructive flex-shrink-0" />
                              <span className="text-[10px] text-destructive font-medium">Unrecognised — pick a seller:</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {sellers.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    const updated = [...(form.entries ?? [])]
                                    updated[i] = { ...updated[i], name: s.name }
                                    set('entries', updated)
                                  }}
                                  className="px-2.5 py-1 rounded-full text-xs font-semibold border border-accent/60 bg-accent/10 text-foreground hover:bg-accent/25 active:scale-95 transition-all"
                                >
                                  {s.name}
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              Current: <span className="text-destructive font-medium">&ldquo;{entry.name || 'blank'}&rdquo;</span>
                            </p>
                          </div>
                        ) : (
                          <Input
                            list="seller-names"
                            value={entry.name}
                            onChange={(e) => updateEntry(i, 'name', e.target.value)}
                            onBlur={(e) => handleNameBlur(i, e.target.value)}
                            placeholder="e.g. Linda"
                            className="mt-1 bg-background border-border text-sm"
                          />
                        )}
                        <datalist id="seller-names">
                          {sellerNames.map((n) => (
                            <option key={n} value={n} />
                          ))}
                        </datalist>
                      </div>{/* end seller col */}

                      {/* Description — col 2 on desktop */}
                      <div className="lg:col-span-2">
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <Input
                          value={entry.description}
                          onChange={(e) => updateEntry(i, 'description', e.target.value)}
                          placeholder="Item description"
                          className="mt-1 bg-background border-border text-sm"
                        />
                      </div>

                      {/* Amount — col 4 on desktop */}
                      <div>
                        <Label className="text-xs text-muted-foreground">Amount (R)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={entry.amount ?? ''}
                          onChange={(e) => updateEntry(i, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="mt-1 bg-background border-border text-sm text-right"
                        />
                      </div>
                    </div>{/* end 4-col grid */}

                    {/* Commission + payment — row below on all sizes */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      <div className="lg:col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          Bakery Commission %
                          <span className="ml-1 text-muted-foreground/60">
                            (default: {sellers.find(
                              (s) => s.name.toLowerCase() === entry.name.toLowerCase()
                            )?.commission_pct ?? 20}%)
                          </span>
                        </Label>
                        <div className="mt-1 relative">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={entry.commission_pct ?? ''}
                            onChange={(e) => updateEntry(i, 'commission_pct', e.target.value)}
                            placeholder="Leave blank to use default"
                            className="bg-background border-border text-sm pr-7"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Payment</Label>
                        <div className="mt-1 flex gap-2">
                          {(['cash', 'card'] as const).map((pt) => (
                            <button
                              key={pt}
                              onClick={() => updateEntry(i, 'payment_type', pt)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                entry.payment_type === pt
                                  ? 'bg-accent/20 border-accent text-foreground'
                                  : 'bg-background border-border text-muted-foreground hover:border-accent/50'
                              }`}
                            >
                              {pt.charAt(0).toUpperCase() + pt.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Totals */}
          {entries.length > 0 && (
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
          )}

          {/* Notes */}
          <section className="bg-card rounded-xl border border-border p-4 space-y-2">
            <SectionHead title="Notes" />
            <Textarea
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)}
              placeholder="Any additional notes..."
              rows={2}
              className="bg-background border-border resize-none"
            />
          </section>
        </div>
      )}

      {/* ─── COMMISSIONS TAB ─── */}
      {tab === 'commissions' && (
        <div className="space-y-4">
          {commissions.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No entries yet. Add sales in the Entries tab first.
              </p>
            </div>
          ) : (
            <>
              {commissions.map((c, i) => (
                <section key={i} className="bg-card rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-serif font-semibold text-foreground text-sm">
                        {c.display_name || c.seller_name}
                      </p>
                      {c.display_name && (
                        <p className="text-xs text-muted-foreground">{c.seller_name}</p>
                      )}
                    </div>
                    <span className="text-xs font-bold text-accent bg-accent/10 rounded-full px-2.5 py-1">
                      {c.commission_pct}% commission
                    </span>
                  </div>

                  {/* Entry breakdown */}
                  <div className="space-y-1">
                    {c.entries.map((entry, j) => (
                      <div key={j} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground truncate mr-2">
                          {entry.description || '—'}
                          <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            entry.payment_type === 'cash'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {entry.payment_type}
                          </span>
                        </span>
                        <span className="font-semibold flex-shrink-0">{R(entry.amount ?? 0)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Commission summary */}
                  <div className="space-y-1.5 pt-1 border-t border-border/60">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Total Sales</span>
                      <span className="font-semibold">{R(c.total_sales)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Village Bakery Keeps</span>
                      <span className="font-semibold text-primary">{R(c.bakery_keeps)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Seller Payout</span>
                      <span className="font-semibold text-destructive">{R(c.seller_payout)}</span>
                    </div>
                  </div>
                </section>
              ))}

              {/* Grand summary */}
              <section className="bg-primary/5 rounded-xl border border-primary/20 p-4 space-y-2">
                <SectionHead title="Summary" />
                <div className="flex justify-between py-2 px-3 bg-background rounded-lg border border-border">
                  <span className="text-xs text-muted-foreground">Total Curios Sales</span>
                  <span className="text-sm font-bold">{R(grandTotal)}</span>
                </div>
                <div className="flex justify-between py-2 px-3 bg-destructive/5 rounded-lg border border-destructive/20">
                  <span className="text-xs text-muted-foreground">Total Seller Payouts</span>
                  <span className="text-sm font-bold text-destructive">{R(totalSellerPayout)}</span>
                </div>
                <div className="flex justify-between py-2.5 px-3 bg-primary/8 rounded-lg border border-primary/20">
                  <span className="text-xs font-semibold text-foreground">Village Bakery Keeps</span>
                  <span className="text-sm font-bold text-primary">{R(totalBakeryKeeps)}</span>
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* Unmatched seller warning */}
      {hasUnmatched && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-xl p-3">
          <AlertTriangle size={15} className="text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-sm text-destructive font-medium">
            {unmatchedIndices.length} {unmatchedIndices.length === 1 ? 'entry has' : 'entries have'} an unrecognised seller name. Please select the correct seller for each highlighted row before saving.
          </p>
        </div>
      )}

      {/* Save */}
      <Button
        onClick={() => onSave(form)}
        disabled={isSaving || hasUnmatched}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base rounded-xl gap-2 disabled:opacity-50"
      >
        {isSaving ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save size={18} />
            Save Curios Sheet
          </>
        )}
      </Button>
    </div>
  )
}
