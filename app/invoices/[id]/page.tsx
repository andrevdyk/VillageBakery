import { notFound } from 'next/navigation'
import { Header } from '@/components/header'
import { InvoiceDetailClient } from '@/components/invoice-detail-client'
import { getInvoice } from '@/lib/actions/invoices'

interface Props {
  params: Promise<{ id: string }>
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params
  const { data: invoice, error } = await getInvoice(id)

  if (error || !invoice) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6 pb-10">
        <InvoiceDetailClient invoice={invoice} />
      </div>
    </main>
  )
}
