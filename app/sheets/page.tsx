'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { InvoiceScanner } from '@/components/invoice-scanner'
import { CashUpDashboard } from '@/components/cashup-dashboard'
import { CashUpAnalysis } from '@/components/cashup-analysis'
import { getCashUpSheets } from '@/lib/actions/invoices'
import type { CashUpSheet } from '@/lib/schema'

type Tab = 'scan' | 'overview' | 'analysis'

const TABS: { id: Tab; label: string }[] = [
  { id: 'scan',     label: 'Scan' },
  { id: 'overview', label: 'Overview' },
  { id: 'analysis', label: 'Analysis' },
]

export default function SheetsPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [tab,    setTab]    = useState<Tab>((searchParams.get('tab') as Tab) ?? 'overview')
  const [sheets, setSheets] = useState<CashUpSheet[]>([])
  const [error,  setError]  = useState<string | null>(null)

  useEffect(() => {
    getCashUpSheets().then(({ data, error }) => {
      setSheets(data)
      if (error) setError(error)
    })
  }, [tab]) // refetch when returning from scan tab

  const handleTabChange = (t: Tab) => {
    setTab(t)
    router.replace(`/sheets?tab=${t}`, { scroll: false })
  }

  return (
    <main className="min-h-screen bg-background">
      <Header />

      <div className="max-w-7xl mx-auto px-4 lg:px-8 pt-6 pb-12">

        {/* Page title + tab strip */}
        <div className="mb-6">
          <h2 className="font-serif text-2xl font-bold text-foreground">Daily Cash Up</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Village Bakery — scan, review, and analyse your daily sheets
          </p>
        </div>

        <nav className="flex gap-1 bg-muted rounded-xl p-1 mb-8 max-w-sm">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
                tab === id
                  ? 'bg-card shadow-sm text-foreground border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Error banner */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Tab content */}
        {tab === 'scan' && (
          <div className="max-w-2xl">
            <InvoiceScanner />
          </div>
        )}

        {tab === 'overview' && (
          sheets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="text-2xl font-serif font-bold text-accent">0</span>
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground">No sheets yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Scan your first Daily Cash Up Sheet to start seeing analytics.
                </p>
              </div>
              <button
                onClick={() => handleTabChange('scan')}
                className="bg-primary text-primary-foreground text-sm font-semibold rounded-xl px-6 py-3 hover:bg-primary/90 transition-colors"
              >
                Scan a Sheet
              </button>
            </div>
          ) : (
            <CashUpDashboard sheets={sheets} />
          )
        )}

        {tab === 'analysis' && (
          sheets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground">No data yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Scan a few sheets to unlock predictions and product analysis.
                </p>
              </div>
              <button
                onClick={() => handleTabChange('scan')}
                className="bg-primary text-primary-foreground text-sm font-semibold rounded-xl px-6 py-3 hover:bg-primary/90 transition-colors"
              >
                Scan a Sheet
              </button>
            </div>
          ) : (
            <CashUpAnalysis sheets={sheets} />
          )
        )}

      </div>
    </main>
  )
}
