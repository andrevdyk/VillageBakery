import Link from 'next/link'
import { FileSpreadsheet, Calendar, ChevronRight } from 'lucide-react'
import { calcSheet } from '@/lib/calc'
import type { CashUpSheet } from '@/lib/schema'

const Rfull = (v: number) =>
  `R\u00a0${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface SheetCardProps {
  sheet: CashUpSheet
}

export function InvoiceCard({ sheet }: SheetCardProps) {
  const savedDate = new Date(sheet.created_at).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const calc = calcSheet(sheet)
  const variance = calc.variance
  const isOver = variance >= 0

  return (
    <Link href={`/sheets/${sheet.id}`}>
      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-accent/60 hover:shadow-sm transition-all active:scale-[0.99]">
        <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
          <FileSpreadsheet size={20} className="text-accent" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-serif font-semibold text-foreground text-sm">
              {sheet.sheet_date ? `Cash Up — ${sheet.sheet_date}` : 'Cash Up Sheet'}
            </p>
            <span className="text-sm font-bold text-primary flex-shrink-0">
              {Rfull(calc.totalActual)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar size={10} />
              {savedDate}
            </span>
            {sheet.till_total_z_print != null && (
              <span className="text-xs text-muted-foreground">
                Till: {Rfull(sheet.till_total_z_print)}
              </span>
            )}
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                isOver ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {isOver ? '+' : '-'}{Rfull(Math.abs(variance))}
            </span>
          </div>
        </div>

        <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
      </div>
    </Link>
  )
}
