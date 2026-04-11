'use client'

import { useState, useTransition } from 'react'
import { createSeller } from '@/lib/actions/curios'
import type { Seller, UnknownSeller } from '@/lib/schema'

export function AddSellerCard({
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
            Seen on sheet as{' '}
            <span className="font-mono bg-orange-100 px-1 rounded">{unknown.raw_name}</span>
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
            Display name{' '}
            <span className="font-normal normal-case text-orange-600">(optional)</span>
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

      {error && <p className="text-xs text-red-600">{error}</p>}

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