import Link from 'next/link'
import { Plus, Receipt } from 'lucide-react'
import { Header } from '@/components/header'
import { InvoiceCard } from '@/components/invoice-card'
import { getInvoices } from '@/lib/actions/invoices'

export default async function InvoicesPage() {
  const { data: invoices, error } = await getInvoices()

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6 pb-10">
        {/* Page header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-serif text-xl font-bold text-foreground">Invoices</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {invoices.length > 0
                ? `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''} saved`
                : 'No invoices yet'}
            </p>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-full px-4 py-2 hover:bg-brown-mid transition-colors"
          >
            <Plus size={16} />
            Scan New
          </Link>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive mb-4">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!error && invoices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
              <Receipt size={32} className="text-accent" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground">No invoices yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Scan your first handwritten invoice to get started.
              </p>
            </div>
            <Link
              href="/"
              className="bg-primary text-primary-foreground text-sm font-semibold rounded-xl px-6 py-3 hover:bg-brown-mid transition-colors"
            >
              Scan an Invoice
            </Link>
          </div>
        )}

        {/* Invoice list */}
        {invoices.length > 0 && (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <InvoiceCard key={invoice.id} invoice={invoice} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
