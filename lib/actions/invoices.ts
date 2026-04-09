'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ExtractedCashUpData } from '@/lib/schema'

export async function saveInvoice(data: ExtractedCashUpData) {
  const supabase = await createClient()
  const { data: sheet, error } = await supabase
    .from('cash_up_sheets')
    .insert({ ...data })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/')
  revalidatePath('/invoices')
  return { data: sheet }
}

export async function getInvoices() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cash_up_sheets')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}

export async function getInvoice(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cash_up_sheets')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return { error: error.message, data: null }
  return { data }
}

export async function deleteInvoice(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cash_up_sheets')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/')
  revalidatePath('/invoices')
  return { success: true }
}

export { saveInvoice as saveCashUpSheet }
export { getInvoices as getCashUpSheets }
export { getInvoice as getCashUpSheet }
export { deleteInvoice as deleteCashUpSheet }