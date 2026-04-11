'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ExtractedCuriosData, Seller, SellerPayment } from '@/lib/schema'

// ─── Sellers ────────────────────────────────────────────────────────────────

export async function getSellers(): Promise<{ data: Seller[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('curios_sellers')
    .select('*')
    .order('name', { ascending: true })
  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}

export async function createSeller(
  seller: Pick<Seller, 'name' | 'display_name' | 'commission_pct'>
): Promise<{ data?: Seller; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('curios_sellers')
    .insert({
      name: seller.name,
      display_name: seller.display_name,
      commission_pct: seller.commission_pct,
    })
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath('/curios')
  return { data: data as Seller }
}

export async function upsertSeller(
  seller: Omit<Seller, 'id' | 'created_at'> & { id?: string }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = seller.id
    ? await supabase
        .from('curios_sellers')
        .update({ name: seller.name, display_name: seller.display_name, commission_pct: seller.commission_pct })
        .eq('id', seller.id)
    : await supabase
        .from('curios_sellers')
        .insert({ name: seller.name, display_name: seller.display_name, commission_pct: seller.commission_pct })
  if (error) return { error: error.message }
  revalidatePath('/curios')
  return {}
}

export async function deleteSeller(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('curios_sellers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/curios')
  return {}
}

// ─── Curios Sheets ──────────────────────────────────────────────────────────

export async function getCuriosSheetByDate(
  sheetDate: string
): Promise<{ data: { id: string; sheet_date: string } | null; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('curios_sheets')
    .select('id, sheet_date')
    .eq('sheet_date', sheetDate)
    .maybeSingle()
  if (error) return { error: error.message, data: null }
  return { data: data ?? null }
}

export async function saveCuriosSheet(data: ExtractedCuriosData) {
  const supabase = await createClient()

  // Duplicate date guard — reject if a sheet for this date already exists
  if (data.sheet_date) {
    const { data: existing, error: lookupError } = await supabase
      .from('curios_sheets')
      .select('id, sheet_date')
      .eq('sheet_date', data.sheet_date)
      .maybeSingle()
    if (lookupError) return { error: lookupError.message }
    if (existing) {
      return {
        error: 'duplicate_date',
        existingId: existing.id,
        existingDate: existing.sheet_date,
      }
    }
  }

  const { data: sheet, error } = await supabase
    .from('curios_sheets')
    .insert({
      sheet_date: data.sheet_date,
      entries: data.entries ?? [],
      notes: data.notes,
      image_url: data.image_url ?? null,
      raw_text: data.raw_text,
    })
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath('/curios')
  return { data: sheet }
}

export async function getCuriosSheets() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('curios_sheets')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}

export async function getCuriosSheet(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('curios_sheets')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return { error: error.message, data: null }
  return { data }
}

export async function getCuriosSheetsByDateRange(startDate: string, endDate: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('curios_sheets')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false })
  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}

export async function deleteCuriosSheet(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('curios_sheets').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/curios')
  return { success: true }
}

// ─── Seller Payments ────────────────────────────────────────────────────────

export async function getSellerPayments() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('seller_payments')
    .select('*, curios_sellers(*)')
    .order('payment_date', { ascending: false })
  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}

export async function recordSellerPayment(payment: {
  seller_id: string
  amount: number
  transaction_number: string | null
  notes: string | null
  period_start: string | null
  period_end: string | null
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('seller_payments')
    .insert(payment)
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath('/curios')
  return { data }
}