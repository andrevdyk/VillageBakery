'use client'

import Link from 'next/link'
import { useState } from 'react'

interface Props {
  existingDate: string
  existingId: string
  onDateChange: (newDate: string) => void
}

export function DuplicateDateBanner({ existingDate, existingId, onDateChange }: Props) {
  const [editingDate, setEditingDate] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [dateError, setDateError] = useState('')

  function handleDateSubmit() {
    const trimmed = newDate.trim()
    if (!trimmed) { setDateError('Please enter a date'); return }
    setDateError('')
    setEditingDate(false)
    onDateChange(trimmed)
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="text-base leading-none mt-0.5">🚫</span>
        <div>
          <p className="text-sm font-semibold text-red-800">
            A sheet for {existingDate} has already been saved
          </p>
          <p className="text-xs text-red-700 mt-0.5">
            You cannot save a duplicate. Either view the existing sheet or correct the date below.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/curios/${existingId}`}
          prefetch={false}
          className="flex-1 text-center text-xs font-semibold py-2 px-3 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition"
        >
          View existing sheet →
        </Link>

        {!editingDate ? (
          <button
            onClick={() => setEditingDate(true)}
            className="flex-1 text-xs font-semibold py-2 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] transition"
          >
            Change the date
          </button>
        ) : (
          <div className="flex-1 space-y-1.5">
            <input
              type="text"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              placeholder="e.g. 31/3/26"
              autoFocus
              className="w-full text-sm px-3 py-2 rounded-lg border border-red-300 bg-white focus:outline-none focus:ring-2 focus:ring-red-300 text-foreground"
            />
            {dateError && <p className="text-xs text-red-600">{dateError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleDateSubmit}
                className="flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
              >
                Confirm date
              </button>
              <button
                onClick={() => { setEditingDate(false); setNewDate(''); setDateError('') }}
                className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}