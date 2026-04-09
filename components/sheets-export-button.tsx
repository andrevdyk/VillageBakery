'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import type { CashUpSheet } from '@/lib/schema'

export function SheetsExportButton({ sheets }: { sheets: CashUpSheet[] }) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await fetch('/api/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheets }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const today = new Date().toISOString().split('T')[0]
      a.download = `village-bakery-cashup-${today}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="flex items-center gap-1.5 border border-border text-foreground text-sm font-medium rounded-full px-3 py-2 hover:bg-muted transition-colors disabled:opacity-60"
    >
      {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      Export
    </button>
  )
}
