import { Header } from '@/components/header'
import { getCuriosSheet, getSellers } from '@/lib/actions/curios'
import { calcCuriosCommissions } from '@/lib/calc'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { CurioEntry, Seller, SellerSummary } from '@/lib/schema'
import { ReactElement, JSXElementConstructor, ReactNode, ReactPortal, Key } from 'react'

const R = (v: number | null | undefined) => `R${(Number(v) || 0).toFixed(2)}`

export default async function CuriosDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [{ data: sheet }, { data: sellers }] = await Promise.all([
    getCuriosSheet(id),
    getSellers(),
  ])

  if (!sheet) notFound()

  const entries = sheet.entries ?? []
  const cashTotal = entries.filter((e: CurioEntry) => e.payment_type === 'cash').reduce((s: number, e: CurioEntry) => s + (e.amount ?? 0), 0)
  const cardTotal = entries.filter((e: CurioEntry) => e.payment_type === 'card').reduce((s: number, e: CurioEntry) => s + (e.amount ?? 0), 0)
  const grandTotal = cashTotal + cardTotal
  const commissions = calcCuriosCommissions(entries, sellers as Seller[])
  const totalSellerPayout = commissions.reduce((s: number, c: SellerSummary) => s + c.seller_payout, 0)
  const totalBakeryKeeps = commissions.reduce((s: number, c: SellerSummary) => s + c.bakery_keeps, 0)

  const SectionHead = ({ title }: { title: string }) => (
    <h3 className="font-serif text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
      {title}
    </h3>
  )

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6 pb-10 space-y-5">
        {/* Back */}
        <Link href="/curios" className="text-xs text-accent underline underline-offset-2">
          &larr; Back to Curios
        </Link>

        {/* Header */}
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">
            Curios — {sheet.sheet_date ?? 'Undated'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Saved {new Date(sheet.created_at).toLocaleDateString('en-ZA', {
              day: 'numeric', month: 'long', year: 'numeric'
            })}
          </p>
        </div>

        {/* Image */}
        {sheet.image_url && (
          <div className="rounded-xl overflow-hidden border border-border/60 max-h-48">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sheet.image_url} alt="Curios sales sheet" className="w-full object-cover max-h-48" />
          </div>
        )}

        {/* Sales entries */}
        <section className="bg-card rounded-xl border border-border p-4">
          <SectionHead title="Sales Entries" />
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No entries recorded.</p>
          ) : (
            <div className="space-y-1">
              {entries.map((entry: { name: any; description: any; payment_type: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; amount: any }, i: Key | null | undefined) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0 gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{entry.name || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">{entry.description || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      entry.payment_type === 'cash'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {entry.payment_type}
                    </span>
                    <span className="text-sm font-bold">{R(entry.amount ?? 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Totals */}
        <section className="bg-card rounded-xl border border-border p-4 space-y-2">
          <SectionHead title="Totals" />
          <div className="flex justify-between py-2 px-3 bg-muted/50 rounded-lg">
            <span className="text-xs text-muted-foreground">Cash</span>
            <span className="text-sm font-semibold">{R(cashTotal)}</span>
          </div>
          <div className="flex justify-between py-2 px-3 bg-muted/50 rounded-lg">
            <span className="text-xs text-muted-foreground">Card</span>
            <span className="text-sm font-semibold">{R(cardTotal)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-primary/8 border border-primary/20 rounded-lg">
            <span className="text-xs font-semibold text-foreground">Grand Total</span>
            <span className="text-sm font-bold text-primary">{R(grandTotal)}</span>
          </div>
        </section>

        {/* Commissions per seller */}
        {commissions.length > 0 && (
          <section className="space-y-3">
            <SectionHead title="Commissions by Seller" />
            {commissions.map((c, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <p className="font-serif font-semibold text-foreground text-sm">
                    {c.display_name || c.seller_name}
                  </p>
                  <span className="text-xs font-bold text-accent bg-accent/10 rounded-full px-2.5 py-1">
                    {c.commission_pct}%
                  </span>
                </div>
                <div className="space-y-1 pt-1 border-t border-border/60">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total Sales</span>
                    <span className="font-semibold">{R(c.total_sales)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Seller Payout</span>
                    <span className="font-semibold text-destructive">{R(c.seller_payout)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Village Bakery Keeps</span>
                    <span className="font-semibold text-primary">{R(c.bakery_keeps)}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Grand summary */}
            <div className="bg-primary/5 rounded-xl border border-primary/20 p-4 space-y-2">
              <div className="flex justify-between py-2 px-3 bg-background rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Total Curios Sales</span>
                <span className="text-sm font-bold">{R(grandTotal)}</span>
              </div>
              <div className="flex justify-between py-2 px-3 bg-destructive/5 rounded-lg border border-destructive/20">
                <span className="text-xs text-muted-foreground">Total Seller Payouts</span>
                <span className="text-sm font-bold text-destructive">{R(totalSellerPayout)}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-primary/8 rounded-lg border border-primary/20">
                <span className="text-xs font-semibold text-foreground">Village Bakery Total</span>
                <span className="text-sm font-bold text-primary">{R(totalBakeryKeeps)}</span>
              </div>
            </div>
          </section>
        )}

        {sheet.notes && (
          <section className="bg-card rounded-xl border border-border p-4">
            <SectionHead title="Notes" />
            <p className="text-sm text-foreground whitespace-pre-wrap">{sheet.notes}</p>
          </section>
        )}
      </div>
    </main>
  )
}
