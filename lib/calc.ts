import type { CashUpSheet, ExtractedCashUpData, CurioEntry, Seller, SellerSummary } from '@/lib/schema'
import { matchSellerName } from '@/lib/seller-aliases'

export function calcSheet(sheet: ExtractedCashUpData | CashUpSheet) {
  const FLOAT = 1000
  const totalCash = sheet.total_cash ?? 0
  const totalCashToTakeOut = Math.max(0, totalCash - FLOAT)
  const slipsTotal = (sheet.slips_paid_out ?? []).reduce((s, sl) => s + (sl.amount ?? 0), 0)

  // Cash received = cash after float + slips paid out
  const totalCashReceived = totalCashToTakeOut + slipsTotal

  const creditCard = sheet.credit_card_yoco ?? 0
  const accounts = sheet.charged_sales_accounts ?? 0

  // Total actual = cash received + card + accounts
  const totalActual = totalCashReceived + creditCard + accounts

  const tillTotal = sheet.till_total_z_print ?? 0
  const variance = totalActual - tillTotal

  return {
    FLOAT,
    totalCashToTakeOut,
    slipsTotal,
    totalCashReceived,
    totalActual,
    variance,
  }
}

export function calcCuriosCommissions(
  entries: CurioEntry[],
  sellers: Seller[]
): SellerSummary[] {
  const sellerMap = new Map(sellers.map((s) => [s.name.toLowerCase().trim(), s]))

  const grouped = new Map<string, { entries: CurioEntry[]; seller: Seller | null }>()

  for (const entry of entries) {
    const raw = (entry.name ?? '').trim()
    const canonical = matchSellerName(raw)
    const seller = canonical ? (sellerMap.get(canonical) ?? null) : null
    const key = seller ? seller.name.toLowerCase() : raw.toLowerCase() || 'unknown'

    if (!grouped.has(key)) {
      grouped.set(key, { entries: [], seller })
    }
    grouped.get(key)!.entries.push(entry)
  }

  const summaries: SellerSummary[] = []
  for (const [, { entries: items, seller }] of grouped.entries()) {
    const sellerDefaultPct = seller?.commission_pct ?? 20
    const total_sales = items.reduce((s, e) => s + (e.amount ?? 0), 0)
    const bakery_keeps = items.reduce((s, e) => {
      const pct = e.commission_pct ?? sellerDefaultPct
      return s + ((e.amount ?? 0) * pct) / 100
    }, 0)

    summaries.push({
      seller_name: seller?.name ?? items[0].name,
      display_name: seller?.display_name ?? null,
      commission_pct: sellerDefaultPct,
      total_sales,
      bakery_keeps,
      seller_payout: total_sales - bakery_keeps,
      entries: items,
    })
  }
  return summaries.sort((a, b) => b.total_sales - a.total_sales)
}