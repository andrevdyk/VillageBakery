import { notFound } from 'next/navigation'
import { Header } from '@/components/header'
import { InvoiceDetailClient } from '@/components/invoice-detail-client'
import { getCashUpSheet } from '@/lib/actions/invoices'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SheetDetailPage({ params }: Props) {
  const { id } = await params
  const { data: sheet, error } = await getCashUpSheet(id)

  if (error || !sheet) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6 pb-10">
        <InvoiceDetailClient sheet={sheet} />
      </div>
    </main>
  )
}
