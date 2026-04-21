import { Header } from '@/components/header'
import { CuriosDashboard } from '@/components/curios-dashboard'
import { getSellers, getCuriosSheets, getSellerPayments, updateCuriosSheet } from '@/lib/actions/curios'
import type { CuriosSheet, CurioEntry, Seller } from '@/lib/schema'

export default async function CuriosPage() {
  const [{ data: sellers }, { data: sheets }, { data: payments }] = await Promise.all([
    getSellers(),
    getCuriosSheets(),
    getSellerPayments(),
  ])

  async function handleUpdateSheet(
    id: string,
    data: { sheet_date?: string; entries?: CurioEntry[]; notes?: string }
  ) {
    'use server'
    return updateCuriosSheet(id, data)
  }

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <CuriosDashboard
        sellers={sellers as Seller[]}
        sheets={sheets as CuriosSheet[]}
        payments={payments}
        onUpdateSheet={handleUpdateSheet}
      />
    </main>
  )
}