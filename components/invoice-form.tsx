'use client'

import { useState } from 'react'
import { Plus, Trash2, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { calcSheet } from '@/lib/calc'
import type { ExtractedCashUpData, SlipPaidOut, CurioEntry } from '@/lib/schema'

interface CashUpFormProps {
  data: ExtractedCashUpData
  onSave: (data: ExtractedCashUpData) => Promise<void>
  isSaving: boolean
}

const toNum = (val: string): number | null => {
  const parsed = parseFloat(val)
  return isNaN(parsed) ? null : parsed
}

const R = (val: number) => `R${val.toFixed(2)}`

type Tab = 'cashup' | 'curios'

export function CashUpForm({ data, onSave, isSaving }: CashUpFormProps) {
  const [form, setForm] = useState<ExtractedCashUpData>(data)
  const [tab, setTab] = useState<Tab>('cashup')

  const set = <K extends keyof ExtractedCashUpData>(key: K, val: ExtractedCashUpData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  // Live calculations
  const calc = calcSheet(form)

  // Slips
  const updateSlip = (i: number, field: keyof SlipPaidOut, val: string) => {
    const updated = [...(form.slips_paid_out ?? [])]
    updated[i] = { ...updated[i], [field]: field === 'amount' ? toNum(val) : val }
    set('slips_paid_out', updated)
  }
  const addSlip = () =>
    set('slips_paid_out', [...(form.slips_paid_out ?? []), { description: '', amount: null }])
  const removeSlip = (i: number) =>
    set('slips_paid_out', (form.slips_paid_out ?? []).filter((_, idx) => idx !== i))

  // Curios
  const updateCurio = (i: number, field: keyof CurioEntry, val: string) => {
    const updated = [...(form.curios_sales ?? [])]
    updated[i] = { ...updated[i], [field]: field === 'amount' ? toNum(val) : val }
    set('curios_sales', updated)
  }
  const addCurio = () =>
    set('curios_sales', [
      ...(form.curios_sales ?? []),
      { name: '', description: '', amount: null, payment_type: 'cash' },
    ])
  const removeCurio = (i: number) =>
    set('curios_sales', (form.curios_sales ?? []).filter((_, idx) => idx !== i))

  const curiosCash = (form.curios_sales ?? [])
    .filter((c) => c.payment_type === 'cash')
    .reduce((s, c) => s + (c.amount ?? 0), 0)
  const curiosCard = (form.curios_sales ?? [])
    .filter((c) => c.payment_type === 'card')
    .reduce((s, c) => s + (c.amount ?? 0), 0)
  const curiosTotal = curiosCash + curiosCard

  const SectionHead = ({ title }: { title: string }) => (
    <h3 className="font-serif text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
      {title}
    </h3>
  )

  const CalcRow = ({
    label,
    value,
    highlight,
    negative,
  }: {
    label: string
    value: number
    highlight?: boolean
    negative?: boolean
  }) => (
    <div
      className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
        highlight ? 'bg-primary/8 border border-primary/20' : 'bg-muted/50'
      }`}
    >
      <span className={`text-xs font-medium ${highlight ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <span
        className={`text-sm font-bold ${
          highlight
            ? negative
              ? 'text-destructive'
              : 'text-primary'
            : negative
            ? 'text-destructive'
            : 'text-foreground'
        }`}
      >
        {value >= 0 ? R(value) : `-R${Math.abs(value).toFixed(2)}`}
      </span>
    </div>
  )

  return (
    <div className="space-y-4">
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
            {t === 'cashup' ? 'Daily Cash Up' : 'Curios Sales'}
          </button>
        ))}
      </div>

      {/* ─── DAILY CASH UP TAB ─── */}
      {tab === 'cashup' && (
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

          {/* Cash */}
          <section className="bg-card rounded-xl border border-border p-4 space-y-3">
            <SectionHead title="Cash" />
            <div>
              <Label className="text-xs text-muted-foreground">Total Cash (from till)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.total_cash ?? ''}
                onChange={(e) => set('total_cash', toNum(e.target.value))}
                placeholder="0.00"
                className="mt-1 bg-background border-border text-right font-semibold"
              />
            </div>
            <div className="space-y-1.5 pt-1">
              <CalcRow label="Less Float (always R1000)" value={calc.FLOAT} />
              <CalcRow label="Total Cash to Take Out" value={calc.totalCashToTakeOut} highlight />
            </div>
          </section>

          {/* Slips */}
          <section className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHead title="Plus Slips Cash Paid Out" />
              <button
                onClick={addSlip}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 font-medium -mt-3"
              >
                <Plus size={13} /> Add
              </button>
            </div>
            {(form.slips_paid_out ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No slips added.</p>
            ) : (
              <div className="space-y-2">
                {(form.slips_paid_out ?? []).map((slip, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={slip.description}
                      onChange={(e) => updateSlip(i, 'description', e.target.value)}
                      placeholder="Description"
                      className="flex-1 bg-background border-border text-sm"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={slip.amount ?? ''}
                      onChange={(e) => updateSlip(i, 'amount', e.target.value)}
                      placeholder="0.00"
                      className="w-24 bg-background border-border text-sm text-right"
                    />
                    <button
                      onClick={() => removeSlip(i)}
                      className="text-muted-foreground hover:text-destructive flex-shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(form.slips_paid_out ?? []).length > 0 && (
              <div className="mt-3">
                <CalcRow label="Slips Total" value={calc.slipsTotal} />
              </div>
            )}
          </section>

          {/* Sales Summary */}
          <section className="bg-card rounded-xl border border-border p-4 space-y-3">
            <SectionHead title="Sales Summary" />

            {/* Calculated total cash received */}
            <CalcRow label="Total Cash Received (calculated)" value={calc.totalCashReceived} highlight />

            <div>
              <Label className="text-xs text-muted-foreground">Credit Card / Yoco (extracted)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.credit_card_yoco ?? ''}
                onChange={(e) => set('credit_card_yoco', toNum(e.target.value))}
                placeholder="0.00"
                className="mt-1 bg-background border-border text-right"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Accounts (Charged Sales)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.charged_sales_accounts ?? ''}
                onChange={(e) => set('charged_sales_accounts', toNum(e.target.value))}
                placeholder="0.00"
                className="mt-1 bg-background border-border text-right"
              />
            </div>

            {/* Total Actual — calculated, read-only */}
            <div className="pt-1">
              <CalcRow label="Total Actual (Cash + Card + Accounts)" value={calc.totalActual} highlight />
            </div>
          </section>

          {/* Till & Variance */}
          <section className="bg-card rounded-xl border border-border p-4 space-y-3">
            <SectionHead title="Till Reconciliation" />
            <div>
              <Label className="text-xs text-muted-foreground">Till Total (Z Print Out)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.till_total_z_print ?? ''}
                onChange={(e) => set('till_total_z_print', toNum(e.target.value))}
                placeholder="0.00"
                className="mt-1 bg-background border-border text-right"
              />
            </div>
            <div className="pt-1">
              <CalcRow
                label="Over / Short Variance (Actual − Till)"
                value={calc.variance}
                highlight
                negative={calc.variance < 0}
              />
            </div>
          </section>

          {/* Notes */}
          <section className="bg-card rounded-xl border border-border p-4 space-y-2">
            <SectionHead title="Notes" />
            <Textarea
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)}
              placeholder="e.g. Sold 6x brown breads. Paid foodpack R908.98"
              rows={3}
              className="bg-background border-border resize-none"
            />
          </section>
        </div>
      )}

      {/* ─── CURIOS SALES TAB ─── */}
      {tab === 'curios' && (
        <div className="space-y-4">
          <section className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHead title="Curios Sales Entries" />
              <button
                onClick={addCurio}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 font-medium -mt-3"
              >
                <Plus size={13} /> Add
              </button>
            </div>
            {(form.curios_sales ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No curios sales extracted.
              </p>
            ) : (
              <div className="space-y-2">
                {(form.curios_sales ?? []).map((curio, i) => (
                  <div
                    key={i}
                    className="bg-muted/40 rounded-lg p-3 border border-border/50 space-y-2 relative"
                  >
                    <button
                      onClick={() => removeCurio(i)}
                      className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={13} />
                    </button>
                    <div className="grid grid-cols-2 gap-2 pr-6">
                      <div>
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <Input
                          value={curio.name}
                          onChange={(e) => updateCurio(i, 'name', e.target.value)}
                          placeholder="e.g. Linda"
                          className="mt-1 bg-background border-border text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Amount (R)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={curio.amount ?? ''}
                          onChange={(e) => updateCurio(i, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="mt-1 bg-background border-border text-sm text-right"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <Input
                        value={curio.description}
                        onChange={(e) => updateCurio(i, 'description', e.target.value)}
                        placeholder="Item description"
                        className="mt-1 bg-background border-border text-sm"
                      />
                    </div>
                    {/* Payment type toggle */}
                    <div className="flex gap-2 pt-1">
                      {(['cash', 'card'] as const).map((pt) => (
                        <button
                          key={pt}
                          onClick={() => updateCurio(i, 'payment_type', pt)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            curio.payment_type === pt
                              ? 'bg-accent/20 border-accent text-foreground'
                              : 'bg-background border-border text-muted-foreground hover:border-accent/50'
                          }`}
                        >
                          {pt.charAt(0).toUpperCase() + pt.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Curios totals */}
          {(form.curios_sales ?? []).length > 0 && (
            <section className="bg-card rounded-xl border border-border p-4 space-y-2">
              <SectionHead title="Curios Totals" />
              <CalcRow label="Cash Sales" value={curiosCash} />
              <CalcRow label="Card Sales" value={curiosCard} />
              <CalcRow label="Total Curios" value={curiosTotal} highlight />
            </section>
          )}
        </div>
      )}

      {/* Save button — always visible */}
      <Button
        onClick={() => onSave(form)}
        disabled={isSaving}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base rounded-xl gap-2"
      >
        {isSaving ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Saving Sheet...
          </>
        ) : (
          <>
            <Save size={18} />
            Save Cash Up Sheet
          </>
        )}
      </Button>
    </div>
  )
}
