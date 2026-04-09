import { Header } from '@/components/header'
import { CuriosDashboard } from '@/components/curios-dashboard'
import { getSellers, getCuriosSheets, getSellerPayments } from '@/lib/actions/curios'
import type { CuriosSheet, Seller } from '@/lib/schema'

export default async function CuriosPage() {
  const [{ data: sellers }, { data: sheets }, { data: payments }] = await Promise.all([
    getSellers(),
    getCuriosSheets(),
    getSellerPayments(),
  ])

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <CuriosDashboard
        sellers={sellers as Seller[]}
        sheets={sheets as CuriosSheet[]}
        payments={payments}
      />
    </main>
  )
}
