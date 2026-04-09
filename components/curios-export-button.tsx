'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import type { CuriosSheet, Seller } from '@/lib/schema'

export function CuriosExportButton({
  sheets,
  sellers,
}: {
  sheets: CuriosSheet[]
  sellers: Seller[]
}) {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/export-curios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheets, sellers }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const today = new Date().toISOString().split('T')[0]
      a.download = `village-bakery-curios-${today}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading || sheets.length === 0}
      className="flex items-center gap-1.5 border border-border text-foreground text-sm font-medium rounded-full px-3 py-2 hover:bg-muted transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      Export Curios
    </button>
  )
}
