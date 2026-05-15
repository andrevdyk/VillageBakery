'use client'

import { useState, useEffect } from 'react'
import { Edit2, Check, X, ChevronDown, ChevronUp, Expand, Image as ImageIcon, Loader2, Download } from 'lucide-react'
import { updateCashUpSheet } from '@/lib/actions/invoices'
import { calcSheet } from '@/lib/calc'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CashUpForm } from '@/components/invoice-form'
import type { CashUpSheet, ExtractedCashUpData } from '@/lib/schema'

const Rfull = (v: number) =>
  `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const Rshort = (v: number) => `R${v.toFixed(2)}`

interface HoverState {
  id: string
  rect: DOMRect
}

interface EditBB {
  new_bb_sold: string
  old_bb_sold: string
  new_bb_price: string
  old_bb_price: string
}

// ─── Main component ───────────────────────────────────────────────────────────

// Parse sheet date reliably regardless of format (dd/mm/yy or ISO yyyy-mm-dd)
function parseDate(s: CashUpSheet): number {
  const raw = s.sheet_date
  if (raw) {
    const m = raw.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/)
    if (m) {
      let y = parseInt(m[3]); if (y < 100) y += 2000
      return new Date(y, parseInt(m[2]) - 1, parseInt(m[1])).getTime()
    }
    const iso = new Date(raw)
    if (!isNaN(iso.getTime())) return iso.getTime()
  }
  return new Date(s.created_at).getTime()
}

export function CashUpTable({ sheets: initialSheets }: { sheets: CashUpSheet[] }) {
  // Optimistic edits stored as a map keyed by sheet id — overlaid on top of
  // initialSheets so parent filter changes always propagate correctly.
  const [updates, setUpdates] = useState<Map<string, Partial<CashUpSheet>>>(new Map())
  const [hover, setHover] = useState<HoverState | null>(null)
  const [vp, setVp] = useState({ w: 1200, h: 800 })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBB, setEditBB] = useState<EditBB>({ new_bb_sold: '', old_bb_sold: '', new_bb_price: '22', old_bb_price: '12' })
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [expandedSlips, setExpandedSlips] = useState<Set<string>>(new Set())
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [dialogSheet, setDialogSheet] = useState<CashUpSheet | null>(null)
  const [dialogSaving, setDialogSaving] = useState(false)

  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Merge optimistic updates onto the prop — filter changes from parent always win
  const displaySheets = initialSheets.map((s) => {
    const u = updates.get(s.id)
    return u ? { ...s, ...u } : s
  })

  const sorted = [...displaySheets].sort((a, b) => parseDate(b) - parseDate(a))

  const hoveredSheet = hover ? displaySheets.find((s) => s.id === hover.id) : null

  // ── Image preview positioning ──────────────────────────────────────────────
  const IMG_W = 480
  const IMG_H = 520
  const GAP   = 10

  function imageStyle(rect: DOMRect): React.CSSProperties {
    // Horizontal: centre over the row, clamped inside viewport
    const idealLeft = rect.left + rect.width / 2 - IMG_W / 2
    const left = Math.max(8, Math.min(idealLeft, vp.w - IMG_W - 8))

    // Vertical: prefer above, fall back to below
    const topAbove = rect.top - IMG_H - GAP
    const top = topAbove >= 8 ? topAbove : rect.bottom + GAP

    return { position: 'fixed', top, left, width: IMG_W, zIndex: 50 }
  }

  // ── Inline BB edit ─────────────────────────────────────────────────────────
  const startEdit = (sheet: CashUpSheet) => {
    setEditingId(sheet.id)
    setEditBB({
      new_bb_sold: sheet.new_bb_sold != null ? String(sheet.new_bb_sold) : '',
      old_bb_sold: sheet.old_bb_sold != null ? String(sheet.old_bb_sold) : '',
      new_bb_price: String(sheet.new_bb_price ?? 22),
      old_bb_price: String(sheet.old_bb_price ?? 12),
    })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id: string) => {
    setSaving(true)
    const payload = {
      new_bb_sold: editBB.new_bb_sold !== '' ? parseInt(editBB.new_bb_sold, 10) : null,
      old_bb_sold: editBB.old_bb_sold !== '' ? parseInt(editBB.old_bb_sold, 10) : null,
      new_bb_price: parseFloat(editBB.new_bb_price) || 22,
      old_bb_price: parseFloat(editBB.old_bb_price) || 12,
    }
    const result = await updateCashUpSheet(id, payload)
    if (!result.error) {
      setUpdates((prev) => new Map(prev).set(id, { ...(prev.get(id) ?? {}), ...payload }))
    }
    setSaving(false)
    setEditingId(null)
  }

  // ── Dialog save ────────────────────────────────────────────────────────────
  const handleDialogSave = async (data: ExtractedCashUpData) => {
    if (!dialogSheet) return
    setDialogSaving(true)
    const result = await updateCashUpSheet(dialogSheet.id, data)
    if (!result.error) {
      setUpdates((prev) => new Map(prev).set(dialogSheet.id, { ...(prev.get(dialogSheet.id) ?? {}), ...data }))
      setDialogSheet(null)
    }
    setDialogSaving(false)
  }

  // ── Excel export ───────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheets: displaySheets }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `village-bakery-cashup-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  const toggleSlips = (id: string) =>
    setExpandedSlips((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleNotes = (id: string) =>
    setExpandedNotes((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = displaySheets.reduce(
    (acc, s) => {
      const c = calcSheet(s)
      return {
        cash: acc.cash + (s.total_cash ?? 0),
        card: acc.card + (s.credit_card_yoco ?? 0),
        accounts: acc.accounts + (s.charged_sales_accounts ?? 0),
        total: acc.total + c.totalActual,
        till: acc.till + (s.till_total_z_print ?? 0),
        variance: acc.variance + c.variance,
        bb: acc.bb + (s.new_bb_sold ?? 0) * (s.new_bb_price ?? 22) + (s.old_bb_sold ?? 0) * (s.old_bb_price ?? 12),
      }
    },
    { cash: 0, card: 0, accounts: 0, total: 0, till: 0, variance: 0, bb: 0 }
  )

  return (
    <>
      {/* ── Floating image preview ─────────────────────────────────────────── */}
      {hover && hoveredSheet?.image_url && (
        <div
          className="rounded-xl overflow-hidden shadow-2xl border border-border bg-card pointer-events-none"
          style={imageStyle(hover.rect)}
        >
          <div className="px-3 py-2 bg-muted/90 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Cash Up Sheet
              </p>
              <p className="text-xs font-semibold text-foreground">
                {hoveredSheet.sheet_date ?? 'Unknown date'}
              </p>
            </div>
            <span className="text-xs font-bold text-primary">
              {Rfull(calcSheet(hoveredSheet).totalActual)}
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hoveredSheet.image_url}
            alt="Cash up sheet"
            className="w-full object-contain"
            style={{ maxHeight: IMG_H - 52 }}
          />
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          {sorted.length} sheet{sorted.length !== 1 ? 's' : ''}
          {sorted.length > 0 && (
            <> · <span className="font-semibold text-foreground">{Rfull(totals.total)}</span> total</>
          )}
        </p>
        <button
          onClick={handleExport}
          disabled={exporting || sorted.length === 0}
          className="flex items-center gap-1.5 bg-card border border-border text-foreground text-xs font-semibold rounded-lg px-3 py-2 hover:bg-muted transition-colors disabled:opacity-50"
        >
          {exporting
            ? <Loader2 size={13} className="animate-spin" />
            : <Download size={13} />}
          Export Excel
        </button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              <Th>Date</Th>
              <Th right>Cash</Th>
              <Th right>Card / Yoco</Th>
              <Th right>Accounts</Th>
              <Th right>Total</Th>
              <Th right>Till (Z)</Th>
              <Th right>Variance</Th>
              <Th>Brown Bread</Th>
              <Th>Slips Paid Out</Th>
              <Th>Notes</Th>
              <Th />
            </tr>
          </thead>

          <tbody>
            {sorted.map((sheet) => {
              const calc        = calcSheet(sheet)
              const isEditing   = editingId === sheet.id
              const isHovered   = hover?.id === sheet.id
              const slips       = sheet.slips_paid_out ?? []
              const slipsTotal  = slips.reduce((s, sl) => s + (sl.amount ?? 0), 0)
              const slipsExpanded = expandedSlips.has(sheet.id)
              const notesExpanded = expandedNotes.has(sheet.id)
              const newBBVal    = (sheet.new_bb_sold ?? 0) * (sheet.new_bb_price ?? 22)
              const oldBBVal    = (sheet.old_bb_sold ?? 0) * (sheet.old_bb_price ?? 12)
              const bbTotal     = newBBVal + oldBBVal
              const hasBB       = (sheet.new_bb_sold ?? 0) > 0 || (sheet.old_bb_sold ?? 0) > 0

              return (
                <tr
                  key={sheet.id}
                  className={`border-b border-border/60 transition-colors ${
                    isHovered ? 'bg-accent/5' : 'hover:bg-muted/30'
                  }`}
                  onMouseEnter={(e) =>
                    setHover({ id: sheet.id, rect: e.currentTarget.getBoundingClientRect() })
                  }
                  onMouseLeave={() => setHover(null)}
                >
                  {/* Date */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {sheet.image_url && (
                        <ImageIcon size={11} className="text-muted-foreground/60 shrink-0" />
                      )}
                      <span className="font-semibold text-foreground text-xs">
                        {sheet.sheet_date ?? sheet.created_at.slice(0, 10)}
                      </span>
                    </div>
                  </td>

                  {/* Cash */}
                  <Td right muted={sheet.total_cash == null}>
                    {sheet.total_cash != null ? Rfull(sheet.total_cash) : '—'}
                  </Td>

                  {/* Card */}
                  <Td right muted={sheet.credit_card_yoco == null}>
                    {sheet.credit_card_yoco != null ? Rfull(sheet.credit_card_yoco) : '—'}
                  </Td>

                  {/* Accounts */}
                  <Td right muted={sheet.charged_sales_accounts == null}>
                    {sheet.charged_sales_accounts != null ? Rfull(sheet.charged_sales_accounts) : '—'}
                  </Td>

                  {/* Total (calculated) */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="font-bold text-primary text-xs">{Rfull(calc.totalActual)}</span>
                  </td>

                  {/* Till */}
                  <Td right muted={sheet.till_total_z_print == null}>
                    {sheet.till_total_z_print != null ? Rfull(sheet.till_total_z_print) : '—'}
                  </Td>

                  {/* Variance */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        calc.variance >= 0
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {calc.variance >= 0 ? '+' : ''}{calc.variance.toFixed(2)}
                    </span>
                  </td>

                  {/* Brown Bread */}
                  <td className="px-4 py-3 min-w-[200px]">
                    {isEditing ? (
                      <div className="space-y-1.5">
                        <BBInputRow
                          label="New"
                          qty={editBB.new_bb_sold}
                          price={editBB.new_bb_price}
                          onQty={(v) => setEditBB((b) => ({ ...b, new_bb_sold: v }))}
                          onPrice={(v) => setEditBB((b) => ({ ...b, new_bb_price: v }))}
                        />
                        <BBInputRow
                          label="Old"
                          qty={editBB.old_bb_sold}
                          price={editBB.old_bb_price}
                          onQty={(v) => setEditBB((b) => ({ ...b, old_bb_sold: v }))}
                          onPrice={(v) => setEditBB((b) => ({ ...b, old_bb_price: v }))}
                        />
                        <div className="flex items-center justify-end gap-1 pt-0.5">
                          <button
                            onClick={cancelEdit}
                            className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                          >
                            <X size={12} />
                          </button>
                          <button
                            onClick={() => saveEdit(sheet.id)}
                            disabled={saving}
                            className="p-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                          >
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        {hasBB ? (
                          <div className="text-xs space-y-0.5">
                            {(sheet.new_bb_sold ?? 0) > 0 && (
                              <div className="whitespace-nowrap text-foreground">
                                <span className="text-muted-foreground">New </span>
                                {sheet.new_bb_sold}× {Rshort(sheet.new_bb_price ?? 22)}{' '}
                                = <span className="font-medium">{Rshort(newBBVal)}</span>
                              </div>
                            )}
                            {(sheet.old_bb_sold ?? 0) > 0 && (
                              <div className="whitespace-nowrap text-foreground">
                                <span className="text-muted-foreground">Old </span>
                                {sheet.old_bb_sold}× {Rshort(sheet.old_bb_price ?? 12)}{' '}
                                = <span className="font-medium">{Rshort(oldBBVal)}</span>
                              </div>
                            )}
                            {(sheet.new_bb_sold ?? 0) > 0 && (sheet.old_bb_sold ?? 0) > 0 && (
                              <div className="font-bold text-primary whitespace-nowrap">{Rshort(bbTotal)}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {isHovered && (
                          <button
                            onClick={() => startEdit(sheet)}
                            className="ml-auto shrink-0 p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                            title="Edit brown bread"
                          >
                            <Edit2 size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Slips Paid Out */}
                  <td className="px-4 py-3 min-w-[160px]">
                    {slips.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div>
                        <button
                          onClick={() => toggleSlips(sheet.id)}
                          className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
                        >
                          <span className="font-medium text-foreground">
                            {slips.length} slip{slips.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-muted-foreground">· {Rfull(slipsTotal)}</span>
                          {slipsExpanded
                            ? <ChevronUp size={11} className="text-muted-foreground" />
                            : <ChevronDown size={11} className="text-muted-foreground" />}
                        </button>
                        {slipsExpanded && (
                          <div className="mt-1.5 space-y-1 border-l-2 border-border ml-0.5 pl-2">
                            {slips.map((slip, i) => (
                              <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
                                <span className="text-muted-foreground truncate max-w-[100px]">
                                  {slip.description || '—'}
                                </span>
                                <span className="font-medium text-foreground shrink-0">
                                  {slip.amount != null ? Rfull(slip.amount) : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Notes */}
                  <td className="px-4 py-3 max-w-[220px]">
                    {sheet.notes ? (
                      <div>
                        <p className={`text-xs text-muted-foreground whitespace-pre-line leading-relaxed ${notesExpanded ? '' : 'line-clamp-1'}`}>
                          {sheet.notes}
                        </p>
                        {sheet.notes.length > 50 && (
                          <button
                            onClick={() => toggleNotes(sheet.id)}
                            className="text-[10px] text-accent hover:text-accent/80 mt-0.5 transition-colors"
                          >
                            {notesExpanded ? 'Less' : 'More'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Expand button */}
                  <td className="px-3 py-3 w-10">
                    <button
                      onClick={() => setDialogSheet(sheet)}
                      className={`p-1.5 rounded-lg hover:bg-accent/20 text-muted-foreground hover:text-accent transition-all ${
                        isHovered ? 'opacity-100' : 'opacity-0'
                      }`}
                      title="Edit this sheet"
                    >
                      <Expand size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* ── Totals row ── */}
          {sorted.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40">
                <td className="px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Total ({sorted.length})
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-xs font-semibold text-foreground">{Rfull(totals.cash)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-xs font-semibold text-foreground">{Rfull(totals.card)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-xs font-semibold text-foreground">{Rfull(totals.accounts)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-xs font-bold text-primary">{Rfull(totals.total)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-xs font-semibold text-foreground">{Rfull(totals.till)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-xs font-bold ${totals.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {totals.variance >= 0 ? '+' : ''}{totals.variance.toFixed(2)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {totals.bb > 0 && (
                    <span className="text-xs font-semibold text-foreground">{Rfull(totals.bb)}</span>
                  )}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Edit dialog ───────────────────────────────────────────────────── */}
      <Dialog open={!!dialogSheet} onOpenChange={(open) => { if (!open) setDialogSheet(null) }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
            <DialogTitle className="font-serif text-lg font-bold">
              Edit Sheet — {dialogSheet?.sheet_date ?? 'Unknown date'}
            </DialogTitle>
          </DialogHeader>

          {dialogSheet && (
            <div className="flex flex-1 min-h-0">

              {/* Left: sheet image */}
              {dialogSheet.image_url ? (
                <div className="w-[42%] shrink-0 border-r border-border bg-muted/30 flex flex-col">
                  <div className="px-4 py-2.5 border-b border-border bg-muted/60">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Original Sheet
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dialogSheet.image_url}
                      alt="Cash up sheet"
                      className="w-full rounded-lg object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="w-[42%] shrink-0 border-r border-border bg-muted/20 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <ImageIcon size={36} className="text-muted-foreground/40 mx-auto" />
                    <p className="text-xs text-muted-foreground">No image attached</p>
                  </div>
                </div>
              )}

              {/* Right: edit form */}
              <ScrollArea className="flex-1 min-w-0">
                <div className="p-6">
                  <CashUpForm
                    data={{
                      sheet_date:              dialogSheet.sheet_date,
                      total_cash:              dialogSheet.total_cash,
                      slips_paid_out:          dialogSheet.slips_paid_out ?? [],
                      credit_card_yoco:        dialogSheet.credit_card_yoco,
                      charged_sales_accounts:  dialogSheet.charged_sales_accounts,
                      till_total_z_print:      dialogSheet.till_total_z_print,
                      curios_sales:            dialogSheet.curios_sales ?? [],
                      notes:                   dialogSheet.notes,
                      image_url:               dialogSheet.image_url,
                      raw_text:                dialogSheet.raw_text,
                      new_bb_sold:             dialogSheet.new_bb_sold,
                      old_bb_sold:             dialogSheet.old_bb_sold,
                      new_bb_price:            dialogSheet.new_bb_price,
                      old_bb_price:            dialogSheet.old_bb_price,
                    }}
                    onSave={handleDialogSave}
                    isSaving={dialogSaving}
                  />
                </div>
              </ScrollArea>

            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── BB inline input row ──────────────────────────────────────────────────────

function BBInputRow({
  label, qty, price, onQty, onPrice,
}: {
  label: string
  qty: string
  price: string
  onQty: (v: string) => void
  onPrice: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground w-7 shrink-0">{label}</span>
      <input
        type="number"
        min="0"
        value={qty}
        onChange={(e) => onQty(e.target.value)}
        placeholder="Qty"
        className="w-14 px-1.5 py-0.5 text-xs border border-border rounded bg-background text-right focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span className="text-[10px] text-muted-foreground">×</span>
      <div className="relative">
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">R</span>
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => onPrice(e.target.value)}
          className="w-16 pl-4 pr-1 py-0.5 text-xs border border-border rounded bg-background text-right focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
    </div>
  )
}

// ─── Table cell helpers ────────────────────────────────────────────────────────

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right, muted }: { children?: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td className={`px-4 py-3 text-xs whitespace-nowrap ${right ? 'text-right' : ''} ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>
      {children}
    </td>
  )
}
