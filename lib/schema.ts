// ─── Curios / Sellers ─────────────────────────────────────────────────────────

export interface CurioEntry {
  name: string
  description: string
  amount: number | null
  payment_type: 'cash' | 'card'
  commission_pct: number | null   // null = use seller default
  seller_id?: string | null
  carried_forward?: boolean       // true if name was blank/ditto on the sheet
}

export interface Seller {
  id: string
  created_at: string
  name: string
  display_name: string | null
  commission_pct: number
}

/** A name the AI saw on the sheet that didn't match any known seller */
export interface UnknownSeller {
  raw_name: string        // exactly as the AI read it from the sheet
  suggested_name: string  // cleaned / title-cased suggestion
}

export interface CuriosSheet {
  id: string
  created_at: string
  sheet_date: string | null
  entries: CurioEntry[]
  notes: string | null
  image_url: string | null
  raw_text: string | null
}

export type ExtractedCuriosData = Omit<CuriosSheet, 'id' | 'created_at'> & {
  unknown_sellers?: UnknownSeller[]
}

export interface SellerSummary {
  seller_name: string
  display_name: string | null
  commission_pct: number
  total_sales: number
  bakery_keeps: number       // bakery commission = total_sales * commission_pct / 100
  seller_payout: number      // what gets paid out to the seller
  entries: CurioEntry[]
}

// ─── Seller Payments ──────────────────────────────────────────────────────────

export interface SellerPayment {
  id: string
  created_at: string
  seller_id: string
  payment_date: string
  amount: number
  transaction_number: string | null
  notes: string | null
  period_start: string | null
  period_end: string | null
}

// ─── Cash Up ──────────────────────────────────────────────────────────────────

export interface SlipPaidOut {
  description: string
  amount: number | null
}

export interface CashUpSheet {
  id: string
  created_at: string
  sheet_date: string | null
  total_cash: number | null
  slips_paid_out: SlipPaidOut[]
  credit_card_yoco: number | null
  charged_sales_accounts: number | null
  till_total_z_print: number | null
  curios_sales: CurioEntry[]
  notes: string | null
  image_url: string | null
  raw_text: string | null
}

export type ExtractedCashUpData = Omit<CashUpSheet, 'id' | 'created_at'>

export type ExtractedInvoiceData = ExtractedCashUpData