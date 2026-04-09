'use client'

import { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { upsertSeller, deleteSeller } from '@/lib/actions/curios'
import type { Seller } from '@/lib/schema'

interface SellersManagerProps {
  initialSellers: Seller[]
}

interface EditState {
  id?: string
  name: string
  display_name: string
  commission_pct: string
}

const empty = (): EditState => ({ name: '', display_name: '', commission_pct: '20' })

export function SellersManager({ initialSellers }: SellersManagerProps) {
  const [sellers, setSellers] = useState<Seller[]>(initialSellers)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startAdd = () => setEditing(empty())
  const startEdit = (s: Seller) =>
    setEditing({ id: s.id, name: s.name, display_name: s.display_name ?? '', commission_pct: String(s.commission_pct) })
  const cancel = () => { setEditing(null); setError(null) }

  const save = async () => {
    if (!editing) return
    if (!editing.name.trim()) { setError('Seller name is required'); return }
    const pct = parseFloat(editing.commission_pct)
    if (isNaN(pct) || pct < 0 || pct > 100) { setError('Commission must be 0–100'); return }
    setSaving(true)
    setError(null)
    const result = await upsertSeller({
      id: editing.id,
      name: editing.name.trim(),
      display_name: editing.display_name.trim() || null,
      commission_pct: pct,
    })
    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    // Optimistically refresh list
    if (editing.id) {
      setSellers((prev) =>
        prev.map((s) =>
          s.id === editing.id
            ? { ...s, name: editing.name.trim(), display_name: editing.display_name.trim() || null, commission_pct: pct }
            : s
        )
      )
    } else {
      // Reload to get new ID — add placeholder
      setSellers((prev) => [
        ...prev,
        { id: Date.now().toString(), created_at: '', name: editing.name.trim(), display_name: editing.display_name.trim() || null, commission_pct: pct },
      ])
    }
    setSaving(false)
    setEditing(null)
  }

  const remove = async (id: string) => {
    const result = await deleteSeller(id)
    if (result.error) { setError(result.error); return }
    setSellers((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xs font-semibold tracking-widest uppercase text-muted-foreground">
          Sellers & Commissions
        </h3>
        <button
          onClick={startAdd}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 font-medium"
        >
          <Plus size={13} /> Add Seller
        </button>
      </div>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Add/Edit form */}
      {editing && (
        <div className="bg-muted/50 rounded-xl border border-border p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">
            {editing.id ? 'Edit Seller' : 'New Seller'}
          </p>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Seller Name *</Label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing((prev) => prev && ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Linda M"
                className="mt-1 bg-background border-border text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Display Name</Label>
              <Input
                value={editing.display_name}
                onChange={(e) => setEditing((prev) => prev && ({ ...prev, display_name: e.target.value }))}
                placeholder="e.g. Linda M — Jewellery (optional)"
                className="mt-1 bg-background border-border text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Commission % *</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={editing.commission_pct}
                  onChange={(e) => setEditing((prev) => prev && ({ ...prev, commission_pct: e.target.value }))}
                  className="bg-background border-border text-sm text-right"
                />
                <span className="text-sm font-semibold text-muted-foreground">%</span>
              </div>
              {parseFloat(editing.commission_pct) === 100 && (
                <p className="text-xs text-muted-foreground mt-1">
                  100% — full amount goes to Village Bakery (e.g. Book Nook)
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              onClick={save}
              disabled={saving}
              size="sm"
              className="flex-1 bg-primary text-primary-foreground gap-1"
            >
              <Check size={13} />
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button onClick={cancel} variant="outline" size="sm" className="flex-1 gap-1">
              <X size={13} /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Sellers list */}
      {sellers.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No sellers yet. Add one above.
        </p>
      ) : (
        <div className="space-y-2">
          {sellers.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between bg-card rounded-xl border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {s.display_name || s.name}
                </p>
                {s.display_name && (
                  <p className="text-xs text-muted-foreground">{s.name}</p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                <span
                  className={`text-sm font-bold tabular-nums ${
                    s.commission_pct === 100 ? 'text-accent' : 'text-primary'
                  }`}
                >
                  {s.commission_pct}%
                </span>
                <button
                  onClick={() => startEdit(s)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => remove(s.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
