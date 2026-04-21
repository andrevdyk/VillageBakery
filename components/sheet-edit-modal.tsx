'use client'

import { useState, useEffect, useRef } from 'react'
import type { CuriosSheet, CurioEntry, Seller } from '@/lib/schema'

// Internal form type — amount can be string while typing
interface EntryForm {
  name: string           // seller name — maps to CurioEntry.name
  description: string
  amount: number | string
  payment_type: 'cash' | 'card'
  commission_pct: number | null
  seller_id?: string | null
  carried_forward?: boolean
}

function entryToForm(e: CurioEntry): EntryForm {
  return {
    name: e.name ?? '',
    description: e.description ?? '',
    amount: e.amount ?? '',
    payment_type: e.payment_type ?? 'cash',
    commission_pct: e.commission_pct ?? null,
    seller_id: e.seller_id ?? null,
    carried_forward: e.carried_forward ?? false,
  }
}

function formToEntry(e: EntryForm): CurioEntry {
  return {
    name: e.name.trim(),
    description: e.description.trim(),
    amount: parseFloat(String(e.amount)) || 0,
    payment_type: e.payment_type,
    commission_pct: e.commission_pct,
    seller_id: e.seller_id ?? null,
    carried_forward: e.carried_forward ?? false,
  }
}

interface Props {
  sheet: CuriosSheet
  sellers: Seller[]
  open: boolean
  onClose: () => void
  onSave: (
    id: string,
    data: { sheet_date?: string; entries?: CurioEntry[]; notes?: string }
  ) => Promise<{ error?: string; existingDate?: string } | void>
}

function normaliseToInputDate(raw: string | null | undefined): string {
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parts = raw.split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return ''
}

export function SheetEditModal({ sheet, sellers, open, onClose, onSave }: Props) {
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [entries, setEntries] = useState<EntryForm[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setDate(normaliseToInputDate(sheet.sheet_date))
    setNotes(sheet.notes ?? '')
    setEntries((sheet.entries ?? []).map(entryToForm))
    setError(null)
    setTimeout(() => firstInputRef.current?.focus(), 50)
  }, [open, sheet])

  const updateEntry = (i: number, field: keyof EntryForm, value: string) => {
    setEntries((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e))
    )
  }

  // When seller dropdown changes, sync name + seller_id + commission_pct from the seller record
  const updateEntrySeller = (i: number, sellerName: string) => {
    const seller = sellers.find((s) => s.name === sellerName)
    setEntries((prev) =>
      prev.map((e, idx) =>
        idx === i
          ? {
              ...e,
              name: sellerName,
              seller_id: seller?.id ?? null,
              commission_pct: seller?.commission_pct ?? null,
            }
          : e
      )
    )
  }

  const addEntry = () => {
    setEntries((prev) => [
      ...prev,
      {
        name: '',
        description: '',
        amount: '',
        payment_type: 'cash',
        commission_pct: null,
        seller_id: null,
        carried_forward: false,
      },
    ])
  }

  const removeEntry = (i: number) => {
    setEntries((prev) => prev.filter((_, idx) => idx !== i))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    const cleaned = entries
      .filter((e) => e.description.trim() || Number(e.amount) > 0)
      .map(formToEntry)

    const result = await onSave(sheet.id, {
      sheet_date: date || undefined,
      entries: cleaned,
      notes: notes.trim() || undefined,
    })

    setSaving(false)

    if (result && 'error' in result && result.error) {
      setError(
        result.error === 'duplicate_date'
          ? `A sheet for ${date} already exists. Please choose a different date.`
          : result.error
      )
      return
    }

    onClose()
  }

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92dvh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-serif text-base font-bold text-foreground">Edit Sheet</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{sheet.sheet_date ?? 'Undated'}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Uploaded image preview */}
          {sheet.image_url && (
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                Scanned Sheet
              </label>
              <div className="rounded-xl overflow-hidden border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sheet.image_url}
                  alt="Scanned curios sheet"
                  className="w-full max-h-64 object-contain"
                />
              </div>
            </div>
          )}

          {/* Date + Notes row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Sheet Date</label>
              <input
                ref={firstInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes…"
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 placeholder:text-muted-foreground/60 text-foreground"
              />
            </div>
          </div>

          {/* Entries */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                Entries <span className="normal-case font-normal">({entries.length})</span>
              </label>
              <button
                onClick={addEntry}
                className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80 transition-opacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
                Add entry
              </button>
            </div>

            {/* Column headers */}
            {entries.length > 0 && (
              <div className="grid grid-cols-[1fr_5rem_6rem_2rem] gap-1.5 px-1">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Description</span>
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Amount</span>
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Seller</span>
                <span />
              </div>
            )}

            {entries.length === 0 && (
              <div className="text-center py-6 text-muted-foreground border border-dashed border-border rounded-xl">
                <p className="text-xs">No entries yet. Add one above.</p>
              </div>
            )}

            <div className="space-y-1.5">
              {entries.map((entry, i) => (
                <div key={i} className="grid grid-cols-[1fr_5rem_6rem_2rem] gap-1.5 items-center">
                  <input
                    type="text"
                    value={entry.description}
                    onChange={(e) => updateEntry(i, 'description', e.target.value)}
                    placeholder="Item description"
                    className="bg-muted border border-border rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 placeholder:text-muted-foreground/50 text-foreground w-full"
                  />
                  <input
                    type="number"
                    value={entry.amount}
                    onChange={(e) => updateEntry(i, 'amount', e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="bg-muted border border-border rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 placeholder:text-muted-foreground/50 text-foreground w-full text-right"
                  />
                  <select
                    value={entry.name}
                    onChange={(e) => updateEntrySeller(i, e.target.value)}
                    className="bg-muted border border-border rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 text-foreground w-full"
                  >
                    <option value="">— seller —</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.display_name ?? s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeEntry(i)}
                    className="flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors p-1 rounded-md hover:bg-destructive/10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Running total */}
            {entries.length > 0 && (
              <div className="flex justify-end pt-1">
                <span className="text-xs text-muted-foreground">
                  Total:{' '}
                  <span className="font-bold text-primary">
                    R{entries
                      .reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0)
                      .toFixed(2)}
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
              <p className="text-xs text-destructive font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-xs font-semibold px-4 py-2.5 rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs font-semibold px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {saving && (
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}