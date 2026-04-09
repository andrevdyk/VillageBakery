'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ExtractedCashUpData } from '@/lib/schema'

export async function saveCashUpSheet(data: ExtractedCashUpData) {
  const supabase = await createClient()

  const { data: sheet, error } = await supabase
    .from('cash_up_sheets')
    .insert({
      sheet_date: data.sheet_date,
      total_cash: data.total_cash,
      slips_paid_out: data.slips_paid_out ?? [],
      credit_card_yoco: data.credit_card_yoco,
      charged_sales_accounts: data.charged_sales_accounts,
      till_total_z_print: data.till_total_z_print,
      curios_sales: data.curios_sales ?? [],
      notes: data.notes,
      image_url: data.image_url ?? null,
      raw_text: data.raw_text,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/sheets')
  return { data: sheet }
}

export async function getCashUpSheets() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cash_up_sheets')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return { error: error.message, data: [] }
  }

  return { data: data ?? [] }
}

export async function getCashUpSheet(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cash_up_sheets')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return { error: error.message, data: null }
  }

  return { data }
}

export async function deleteCashUpSheet(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('cash_up_sheets')
    .delete()
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/sheets')
  return { success: true }
}
