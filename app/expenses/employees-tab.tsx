'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, Plus, Pencil, Trash2, Phone, CreditCard, AlertCircle,
  Loader2, Check, Printer, FileText, Clock, Calendar, X, Eye, BanknoteIcon,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Badge }    from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'

// ─── Types ─────────────────────────────────────────────────────────────────
export interface Employee {
  employee_id: number
  full_name: string
  id_number: string | null
  phone_number: string | null
  emergency_contact: string | null
  bank_account_number: string | null
  job_position: string | null
  tax_ref_number: string | null
  date_employed: string | null
  pay_type: 'hourly' | 'daily' | 'flat'
  hourly_rate: number | null
  daily_rate: number | null
  flat_rate: number | null
  is_active: boolean
  notes: string | null
}

export interface PayslipData {
  payslip_id?: number
  employee_id: number
  period_from: string
  period_to: string
  pay_date: string
  payslip_type: 'weekly' | 'monthly'
  pay_type: 'hourly' | 'daily' | 'flat'
  flat_amount: number
  rate: number
  regular_hours: number
  regular_days: number
  overtime_hours: number
  public_holiday_hours: number
  public_holiday_days: number
  leave_days: number
  bonus: number
  extra_earnings: ExtraEarning[]
  regular_pay: number
  overtime_pay: number
  public_holiday_pay: number
  leave_pay: number
  total_earnings: number
  uif_employee: number
  other_deductions: number
  other_deductions_label: string | null
  total_deductions: number
  nett_pay: number
  payout: number
  notes: string | null
  date_paid: string | null
  vb_employee?: {
    full_name: string
    job_position: string | null
    id_number: string | null
    tax_ref_number: string | null
  }
}

interface ExtraEarning {
  label: string
  amount: number
}

// ─── Constants ──────────────────────────────────────────────────────────────
const UIF_RATE      = 0.01
const OT_MULTIPLIER = 1.5
const PH_MULTIPLIER = 2.0

const ZAR = (n: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n)

const fmt2 = (n: number) => Math.round(n * 100) / 100
const roundToTenCents = (n: number) => Math.round(n * 10) / 10

// ─── Period helpers ─────────────────────────────────────────────────────────

/** Weekly period: Monday–Sunday of the current week */
function currentWeekPeriod(): { from: string; to: string } {
  const now  = new Date()
  const day  = now.getDay() // 0=Sun
  const mon  = new Date(now)
  mon.setDate(now.getDate() - ((day + 6) % 7))
  const sun  = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return {
    from: mon.toISOString().split('T')[0],
    to:   sun.toISOString().split('T')[0],
  }
}

/**
 * Monthly period: 26th of the previous month → 25th of the current month.
 * e.g. called in July  →  26 June – 25 July
 */
function currentMonthlyPeriod(): { from: string; to: string } {
  const now      = new Date()
  const year     = now.getFullYear()
  const month    = now.getMonth() // 0-indexed current month

  // 25th of current month
  const toDate   = new Date(year, month, 25)

  // 26th of previous month
  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear  = month === 0 ? year - 1 : year
  const fromDate  = new Date(prevYear, prevMonth, 26)

  return {
    from: fromDate.toISOString().split('T')[0],
    to:   toDate.toISOString().split('T')[0],
  }
}


/** Count Mon–Fri business days between two ISO date strings (inclusive) */
function countBusinessDays(from: string, to: string): number {
  const start = new Date(from)
  const end   = new Date(to)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const d = cur.getDay()
    if (d !== 0 && d !== 6) count++ // exclude Sun(0) and Sat(6)
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// ─── Payslip calculation ────────────────────────────────────────────────────
function calcPayslip(inputs: {
  pay_type: 'hourly' | 'daily' | 'flat'
  flat_amount: number
  rate: number
  regular_hours: number
  regular_days: number
  overtime_hours: number
  public_holiday_hours: number
  public_holiday_days: number
  leave_days: number
  bonus: number
  extra_earnings: ExtraEarning[]
  other_deductions: number
}) {
  const {
    pay_type, flat_amount, rate, regular_hours, regular_days,
    overtime_hours, public_holiday_hours, public_holiday_days,
    leave_days, bonus, extra_earnings, other_deductions,
  } = inputs

  let regular_pay = 0, overtime_pay = 0, public_holiday_pay = 0, leave_pay = 0

  if (pay_type === 'flat') {
    regular_pay = fmt2(flat_amount)
    // flat employees: public holidays and leave still possible as extras via extra_earnings
  } else if (pay_type === 'hourly') {
    regular_pay        = fmt2(regular_hours * rate)
    overtime_pay       = fmt2(overtime_hours * rate * OT_MULTIPLIER)
    public_holiday_pay = fmt2(public_holiday_hours * rate * PH_MULTIPLIER)
    leave_pay          = fmt2(leave_days * rate * 8)
  } else {
    regular_pay        = fmt2(regular_days * rate)
    overtime_pay       = 0
    public_holiday_pay = fmt2(public_holiday_days * rate * PH_MULTIPLIER)
    leave_pay          = fmt2(leave_days * rate)
  }

  const extra_total    = extra_earnings.reduce((s, e) => s + (e.amount || 0), 0)
  const total_earnings = fmt2(regular_pay + overtime_pay + public_holiday_pay + leave_pay + bonus + extra_total)
  const uif_employee   = fmt2(total_earnings * UIF_RATE)
  const total_deductions = fmt2(uif_employee + other_deductions)
  const nett_pay       = fmt2(total_earnings - total_deductions)
  const payout         = roundToTenCents(nett_pay)

  return {
    regular_pay, overtime_pay, public_holiday_pay, leave_pay,
    total_earnings, uif_employee, total_deductions, nett_pay, payout,
  }
}


// ─── Print payslip in a new window ─────────────────────────────────────────
// Opens a new blank window, writes the payslip HTML into it, and calls print.
// This is the only reliable cross-browser approach — no CSS @media tricks needed.
function printPayslipInNewWindow(payslip: PayslipData, employee: Employee) {
  // Build the HTML content using the same layout as PayslipPrint
  const safeRate      = Number(payslip.rate       ?? 0)
  const safeFlatAmt   = Number((payslip as any).flat_amount ?? payslip.regular_pay ?? 0)
  const safeBonus     = Number(payslip.bonus       ?? 0)
  const safeRegHours  = Number(payslip.regular_hours  ?? 0)
  const safeRegDays   = Number(payslip.regular_days   ?? 0)
  const safeOtHours   = Number(payslip.overtime_hours ?? 0)
  const safePhHours   = Number(payslip.public_holiday_hours ?? 0)
  const safePhDays    = Number(payslip.public_holiday_days  ?? 0)
  const safeLeaveDays = Number(payslip.leave_days ?? 0)
  const safeTotalEarnings   = Number(payslip.total_earnings   ?? 0)
  const safeUif             = Number(payslip.uif_employee     ?? 0)
  const safeOtherDeductions = Number(payslip.other_deductions ?? 0)
  const safeTotalDeductions = Number(payslip.total_deductions ?? 0)
  const safeNettPay         = Number(payslip.nett_pay         ?? 0)
  const safePayout          = Number(payslip.payout           ?? 0)

  const fmtD = (d: string) => {
    const dt = new Date(d)
    return isNaN(dt.getTime()) ? (d ?? '') : dt.toLocaleDateString('en-ZA')
  }
  const fmtN = (n: number) =>
    n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtA = (n: number | null | undefined) =>
    (n == null || n === 0) ? '-' : Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Build earning rows as HTML string
  let earningsHtml = ''
  const row = (label: string, hours: string, rate: string, amount: string) =>
    `<tr><td style="padding-bottom:3px;width:42%">${label}</td><td style="width:10%;text-align:center">${hours}</td><td style="width:5%;text-align:center;color:#555">${hours ? '@' : ''}</td><td style="width:18%;text-align:right">${rate}</td><td style="width:5%;text-align:center">R</td><td style="width:20%;text-align:right">${amount}</td></tr>`

  const extras: ExtraEarning[] = Array.isArray(payslip.extra_earnings) ? payslip.extra_earnings : []

  if (payslip.pay_type === 'flat') {
    earningsHtml += row('MONTHLY SALARY', '', '', fmtA(safeFlatAmt))
    if (safeBonus) earningsHtml += row('BONUS', '', '', fmtA(safeBonus))
  } else if (payslip.pay_type === 'hourly') {
    earningsHtml += row('NUMBER OF HOURS WORKED', String(safeRegHours), `R ${safeRate.toFixed(2)}`, fmtA(payslip.regular_pay))
    earningsHtml += row('LEAVE PAY', String(safeLeaveDays > 0 ? safeLeaveDays * 8 : 0), `R ${safeRate.toFixed(2)}`, fmtA(payslip.leave_pay))
    earningsHtml += row('BONUS', '', '', fmtA(safeBonus || null))
    earningsHtml += row('OVERTIME', String(safeOtHours), `R ${(safeRate * 1.5).toFixed(2)}`, fmtA(payslip.overtime_pay))
    earningsHtml += row('PUBLIC HOLIDAY (Worked)', String(safePhHours), `R ${(safeRate * 2).toFixed(2)}`, fmtA(payslip.public_holiday_pay))
  } else {
    earningsHtml += row('DAYS WORKED', String(safeRegDays), `R ${safeRate.toFixed(2)}`, fmtA(payslip.regular_pay))
    earningsHtml += row('LEAVE PAY (days)', String(safeLeaveDays), `R ${safeRate.toFixed(2)}`, fmtA(payslip.leave_pay))
    earningsHtml += row('BONUS', '', '', fmtA(safeBonus || null))
    earningsHtml += row('PUBLIC HOLIDAY (Worked)', String(safePhDays), `R ${(safeRate * 2).toFixed(2)}`, fmtA(payslip.public_holiday_pay))
  }
  extras.filter(e => e.amount > 0).forEach(e => {
    earningsHtml += row(e.label || 'Additional payment', '', '', fmtA(e.amount))
  })

  const deductionsHtml = `
    <tr><td style="width:72%;padding-bottom:6px">UIF</td><td style="width:5%;text-align:center">=</td><td style="text-align:center;width:3%">R</td><td style="text-align:right;width:20%">${fmtN(safeUif)}</td></tr>
    ${safeOtherDeductions > 0 ? `<tr><td style="padding-bottom:6px">${payslip.other_deductions_label ?? 'Other deduction'}</td><td style="text-align:center">=</td><td style="text-align:center">R</td><td style="text-align:right">${fmtN(safeOtherDeductions)}</td></tr>` : ''}
  `

  // Get the logo as a full URL
  const logoUrl = `${window.location.origin}/logo.jpg`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payslip — ${employee.full_name}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; margin: 0; padding: 28px 36px; max-width: 680px; }
    table { width: 100%; border-collapse: collapse; }
    hr { border: none; border-top: 1px solid #000; margin: 8px 0; }
    hr.thick { border-top-width: 2px; }
    @media print { body { padding: 14px 18px; } }
  </style>
</head>
<body>
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px">
    <img src="${logoUrl}" alt="Village Bakery" style="height:48px;object-fit:contain" />
    <div style="text-align:right;font-size:10pt;line-height:1.7">
      <div style="font-weight:bold">SUIKERBEKKIE BAKKERY CC</div>
      <div>P O BOX 6</div><div>WAKKERSTROOM</div><div>2480</div><div>TEL: (017) 730 0077</div>
    </div>
  </div>

  <div style="text-align:center;font-size:14pt;font-weight:bold;text-decoration:underline;margin-bottom:14px">PAYSLIP</div>

  <table style="margin-bottom:10px;font-size:10.5pt">
    <tr><td style="width:22%"><strong><u>DATE:</u></strong></td><td>${fmtD(payslip.pay_date)}</td></tr>
    <tr><td style="padding-top:4px"><strong>PAYMENT FOR THE PERIOD</strong></td>
        <td style="padding-top:4px"><strong><u>FROM:</u></strong>&nbsp;&nbsp;${fmtD(payslip.period_from)}&nbsp;&nbsp;&nbsp;<strong><u>TO:</u></strong>&nbsp;&nbsp;${fmtD(payslip.period_to)}</td></tr>
  </table>

  <hr />

  <table style="margin-bottom:8px;font-size:10.5pt">
    <tr>
      <td style="width:55%;vertical-align:top;padding-bottom:4px">
        <strong>${employee.full_name.toUpperCase()}</strong>
        ${employee.phone_number ? `<div style="font-size:10pt;margin-top:2px">${employee.phone_number}</div>` : ''}
        ${employee.tax_ref_number ? `<div style="margin-top:4px">TAX REF NO: ${employee.tax_ref_number}</div>` : ''}
        <div style="margin-top:6px"><strong><u>POSITION:</u></strong>&nbsp;&nbsp;${(employee.job_position ?? '—').toUpperCase()}</div>
      </td>
      <td style="vertical-align:top;font-size:10.5pt;line-height:1.8">
        ${employee.id_number ? `<div>ID no ${employee.id_number}</div>` : ''}
        ${employee.date_employed ? `<div>DATE EMPLOYED: ${fmtD(employee.date_employed)}</div>` : ''}
      </td>
    </tr>
  </table>

  <hr style="margin:8px 0 10px" />

  <div style="font-weight:bold;text-decoration:underline;margin-bottom:8px">EARNINGS</div>
  <table style="font-size:10.5pt"><tbody>${earningsHtml}</tbody></table>
  <hr />
  <table style="font-size:10.5pt;margin-bottom:14px">
    <tr><td style="font-weight:bold">TOTAL EARNINGS</td><td></td><td style="text-align:center">R</td><td style="text-align:right;font-weight:bold;width:20%">${fmtN(safeTotalEarnings)}</td></tr>
  </table>

  <div style="font-weight:bold;text-decoration:underline;margin-bottom:8px">DEDUCTIONS</div>
  <table style="font-size:10.5pt;margin-bottom:10px"><tbody>${deductionsHtml}</tbody></table>
  <hr />
  <table style="font-size:10.5pt;margin-bottom:14px">
    <tr><td style="font-weight:bold">TOTAL DEDUCTIONS</td><td style="text-align:center">=</td><td style="text-align:center;width:3%">R</td><td style="text-align:right;font-weight:bold;width:20%">${fmtN(safeTotalDeductions)}</td></tr>
  </table>

  <hr class="thick" />
  <table style="font-size:12pt;margin-bottom:8px">
    <tr><td style="font-weight:bold;text-decoration:underline">NETT PAY</td><td style="text-align:center">=</td><td style="text-align:center;width:3%">R</td><td style="text-align:right;font-weight:bold;width:20%;text-decoration:underline">${fmtN(safeNettPay)}</td></tr>
  </table>
  <table style="font-size:11pt;margin-bottom:20px">
    <tr><td></td><td style="text-align:center;font-weight:bold;text-decoration:underline">Payout</td><td style="text-align:center;width:3%">R</td><td style="text-align:right;font-weight:bold;width:20%">${fmtN(safePayout)}</td></tr>
  </table>

  <div style="margin-top:24px;font-size:10pt">I hereby acknowledge receipt of the abovementioned amount</div>
  <div style="margin-top:32px;border-top:1px solid #000;width:200px;padding-top:4px;font-size:10pt">Signature</div>
  ${payslip.notes ? `<div style="margin-top:16px;font-size:9pt;color:#555">Notes: ${payslip.notes}</div>` : ''}

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=750,height=900')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

// ─── Payslip Print ──────────────────────────────────────────────────────────
export function PayslipPrint({
  payslip, employee,
}: {
  payslip: PayslipData
  employee: Employee
}) {
  // Safety guard — should never be null in practice but prevents crash during re-renders
  if (!payslip || !employee) return null
  const emp = employee

  const formatDate = (d: string) => {
    const dt = new Date(d)
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-ZA')
  }

  const fmtAmt = (n: number | null | undefined) =>
    (n == null || n === 0) ? '-' : Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Guard against undefined/null coming from DB rows missing the new columns
  const safeRate      = Number(payslip.rate       ?? 0)
  const safeFlatAmt   = Number((payslip as any).flat_amount ?? payslip.regular_pay ?? 0)
  const safeBonus     = Number(payslip.bonus       ?? 0)
  const safeRegHours  = Number(payslip.regular_hours  ?? 0)
  const safeRegDays   = Number(payslip.regular_days   ?? 0)
  const safeOtHours   = Number(payslip.overtime_hours ?? 0)
  const safePhHours   = Number(payslip.public_holiday_hours ?? 0)
  const safePhDays    = Number(payslip.public_holiday_days  ?? 0)
  const safeLeaveDays = Number(payslip.leave_days ?? 0)

  // Safe versions of all fields used directly in JSX with .toLocaleString()
  const safeTotalEarnings   = Number(payslip.total_earnings   ?? 0)
  const safeUif             = Number(payslip.uif_employee     ?? 0)
  const safeOtherDeductions = Number(payslip.other_deductions ?? 0)
  const safeTotalDeductions = Number(payslip.total_deductions ?? 0)
  const safeNettPay         = Number(payslip.nett_pay         ?? 0)
  const safePayout          = Number(payslip.payout           ?? 0)

  const fmtNum = (n: number) =>
    n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const earningRows: Array<{ label: string; hours?: string; rate?: string; amount: number | null }> = []

  if (payslip.pay_type === 'flat') {
    earningRows.push({ label: 'MONTHLY SALARY', amount: safeFlatAmt })
    if (safeBonus) earningRows.push({ label: 'BONUS', amount: safeBonus })
  } else if (payslip.pay_type === 'hourly') {
    earningRows.push({ label: 'NUMBER OF HOURS WORKED', hours: String(safeRegHours), rate: `R ${safeRate.toFixed(2)}`, amount: payslip.regular_pay })
    earningRows.push({ label: 'LEAVE PAY', hours: safeLeaveDays > 0 ? String(safeLeaveDays * 8) : '0', rate: `R ${safeRate.toFixed(2)}`, amount: payslip.leave_pay || null })
    earningRows.push({ label: 'BONUS', amount: safeBonus || null })
    earningRows.push({ label: 'OVERTIME', hours: String(safeOtHours), rate: `R ${(safeRate * OT_MULTIPLIER).toFixed(2)}`, amount: payslip.overtime_pay || null })
    earningRows.push({ label: 'PUBLIC HOLIDAY (Worked)', hours: String(safePhHours), rate: `R ${(safeRate * PH_MULTIPLIER).toFixed(2)}`, amount: payslip.public_holiday_pay || null })
  } else {
    earningRows.push({ label: 'DAYS WORKED', hours: String(safeRegDays), rate: `R ${safeRate.toFixed(2)}`, amount: payslip.regular_pay })
    earningRows.push({ label: 'LEAVE PAY (days)', hours: String(safeLeaveDays), rate: `R ${safeRate.toFixed(2)}`, amount: payslip.leave_pay || null })
    earningRows.push({ label: 'BONUS', amount: safeBonus || null })
    earningRows.push({ label: 'PUBLIC HOLIDAY (Worked)', hours: String(safePhDays), rate: `R ${(safeRate * PH_MULTIPLIER).toFixed(2)}`, amount: payslip.public_holiday_pay || null })
  }

  // Extra earnings
  const extra: ExtraEarning[] = Array.isArray(payslip.extra_earnings) ? payslip.extra_earnings : []
  extra.filter(e => e.amount > 0).forEach(e => {
    earningRows.push({ label: e.label || 'Additional payment', amount: e.amount })
  })

  return (
    <div
      id="payslip-print-area"
      style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '11pt',
        color: '#000',
        background: '#fff',
        padding: '28px 36px',
        maxWidth: '680px',
        margin: '0 auto',
        lineHeight: 1.5,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="Village Bakery" style={{ height: 48, objectFit: 'contain' }} />
        <div style={{ textAlign: 'right', fontSize: '10pt', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 'bold' }}>SUIKERBEKKIE BAKKERY CC</div>
          <div>P O BOX 6</div>
          <div>WAKKERSTROOM</div>
          <div>2480</div>
          <div>TEL: (017) 730 0077</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: '14pt', fontWeight: 'bold', textDecoration: 'underline', marginBottom: 14 }}>
        PAYSLIP
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, fontSize: '10.5pt' }}>
        <tbody>
          <tr>
            <td style={{ width: '22%' }}><strong><u>DATE:</u></strong></td>
            <td>{formatDate(payslip.pay_date)}</td>
          </tr>
          <tr>
            <td style={{ paddingTop: 4 }}><strong>PAYMENT FOR THE PERIOD</strong></td>
            <td style={{ paddingTop: 4 }}>
              <strong><u>FROM:</u></strong>&nbsp;&nbsp;{formatDate(payslip.period_from)}
              &nbsp;&nbsp;&nbsp;<strong><u>TO:</u></strong>&nbsp;&nbsp;{formatDate(payslip.period_to)}
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '8px 0' }} />

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, fontSize: '10.5pt' }}>
        <tbody>
          <tr>
            <td style={{ width: '55%', verticalAlign: 'top', paddingBottom: 4 }}>
              <strong>{emp.full_name.toUpperCase()}</strong>
              {emp.phone_number && <div style={{ fontSize: '10pt', marginTop: 2 }}>{emp.phone_number}</div>}
              {emp.tax_ref_number && <div style={{ marginTop: 4 }}>TAX REF NO: {emp.tax_ref_number}</div>}
              <div style={{ marginTop: 6 }}>
                <strong><u>POSITION:</u></strong>&nbsp;&nbsp;{emp.job_position?.toUpperCase() ?? '—'}
              </div>
            </td>
            <td style={{ verticalAlign: 'top', fontSize: '10.5pt', lineHeight: 1.8 }}>
              {emp.id_number && <div>ID no {emp.id_number}</div>}
              {emp.date_employed && <div>DATE EMPLOYED: {formatDate(emp.date_employed)}</div>}
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '8px 0 10px' }} />

      <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: 8 }}>EARNINGS</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5pt' }}>
        <tbody>
          {earningRows.map((row, i) => (
            <tr key={i}>
              <td style={{ paddingBottom: 3, width: '42%' }}>{row.label}</td>
              <td style={{ width: '10%', textAlign: 'center' }}>{row.hours ?? ''}</td>
              <td style={{ width: '5%', textAlign: 'center', color: '#555' }}>{row.hours != null ? '@' : ''}</td>
              <td style={{ width: '18%', textAlign: 'right' }}>{row.rate ?? ''}</td>
              <td style={{ width: '5%', textAlign: 'center' }}>R</td>
              <td style={{ width: '20%', textAlign: 'right' }}>{fmtAmt(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '8px 0' }} />

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5pt', marginBottom: 14 }}>
        <tbody>
          <tr>
            <td style={{ fontWeight: 'bold' }}>TOTAL EARNINGS</td>
            <td /><td style={{ textAlign: 'center' }}>R</td>
            <td style={{ textAlign: 'right', fontWeight: 'bold', width: '20%' }}>
              {fmtNum(safeTotalEarnings)}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: 8 }}>DEDUCTIONS</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5pt', marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={{ width: '72%', paddingBottom: 6 }}>UIF</td>
            <td style={{ width: '5%', textAlign: 'center' }}>=</td>
            <td style={{ textAlign: 'center', width: '3%' }}>R</td>
            <td style={{ textAlign: 'right', width: '20%' }}>
              {fmtNum(safeUif)}
            </td>
          </tr>
          {payslip.other_deductions > 0 && (
            <tr>
              <td style={{ paddingBottom: 6 }}>{payslip.other_deductions_label ?? 'Other deduction'}</td>
              <td style={{ textAlign: 'center' }}>=</td>
              <td style={{ textAlign: 'center' }}>R</td>
              <td style={{ textAlign: 'right' }}>
                {fmtNum(safeOtherDeductions)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '8px 0' }} />

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5pt', marginBottom: 14 }}>
        <tbody>
          <tr>
            <td style={{ fontWeight: 'bold' }}>TOTAL DEDUCTIONS</td>
            <td style={{ textAlign: 'center' }}>=</td>
            <td style={{ textAlign: 'center', width: '3%' }}>R</td>
            <td style={{ textAlign: 'right', fontWeight: 'bold', width: '20%' }}>
              {fmtNum(safeTotalDeductions)}
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '8px 0' }} />

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12pt', marginBottom: 8 }}>
        <tbody>
          <tr>
            <td style={{ fontWeight: 'bold', textDecoration: 'underline' }}>NETT PAY</td>
            <td style={{ textAlign: 'center' }}>=</td>
            <td style={{ textAlign: 'center', width: '3%' }}>R</td>
            <td style={{ textAlign: 'right', fontWeight: 'bold', width: '20%', textDecoration: 'underline' }}>
              {fmtNum(safeNettPay)}
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt', marginBottom: 20 }}>
        <tbody>
          <tr>
            <td /><td style={{ textAlign: 'center', fontWeight: 'bold', textDecoration: 'underline' }}>Payout</td>
            <td style={{ textAlign: 'center', width: '3%' }}>R</td>
            <td style={{ textAlign: 'right', fontWeight: 'bold', width: '20%' }}>
              {fmtNum(safePayout)}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 24, fontSize: '10pt' }}>
        I hereby acknowledge receipt of the abovementioned amount
      </div>
      <div style={{ marginTop: 32, borderTop: '1px solid #000', width: 200, paddingTop: 4, fontSize: '10pt' }}>
        Signature
      </div>

      {payslip.notes && (
        <div style={{ marginTop: 16, fontSize: '9pt', color: '#555' }}>Notes: {payslip.notes}</div>
      )}
    </div>
  )
}

// ─── Generate Payslip Modal ─────────────────────────────────────────────────
function GeneratePayslipModal({
  open, onClose, employee, onSave, initialData,
}: {
  open: boolean
  onClose: () => void
  employee: Employee | null
  onSave: (data: Omit<PayslipData, 'payslip_id'>, existingId?: number) => Promise<PayslipData>
  initialData?: PayslipData | null
}) {
  const today   = new Date().toISOString().split('T')[0]
  const emp     = employee
  const payType = emp?.pay_type ?? 'hourly'  // 'hourly' | 'daily' | 'flat'

  // ── Form state ──────────────────────────────────────────────────────────
  const [payslipType, setPayslipType] = useState<'weekly' | 'monthly'>('weekly')
  const [periodFrom, setPeriodFrom]   = useState('')
  const [periodTo, setPeriodTo]       = useState('')
  const [payDate, setPayDate]         = useState(today)
  const [rate, setRate]               = useState(0)

  // Earnings
  const [regularHours, setRegularHours] = useState(0)
  const [regularDays, setRegularDays]   = useState(0)
  const [overtimeHours, setOvertimeHours] = useState(0)
  const [phHours, setPhHours]           = useState(0)
  const [phDays, setPhDays]             = useState(0)
  const [leaveDays, setLeaveDays]       = useState(0)
  const [bonus, setBonus]               = useState(0)

  // Extra earnings rows
  const [extraEarnings, setExtraEarnings] = useState<ExtraEarning[]>([])

  // Deductions
  const [otherDeductions, setOtherDeductions]           = useState(0)
  const [otherDeductionsLabel, setOtherDeductionsLabel] = useState('')
  const [notes, setNotes]                               = useState('')

  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [preview, setPreview] = useState<PayslipData | null>(null)

  // ── Reset on open ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !emp) return

    if (initialData) {
      // ── Edit mode: pre-populate from existing payslip ──
      setPayslipType(initialData.payslip_type)
      setRate(initialData.pay_type === 'flat' ? (initialData.flat_amount ?? 0) : (initialData.rate ?? 0))
      setPeriodFrom(initialData.period_from)
      setPeriodTo(initialData.period_to)
      setPayDate(initialData.pay_date)
      setRegularHours(initialData.regular_hours ?? 0)
      setRegularDays(initialData.regular_days ?? 0)
      setOvertimeHours(initialData.overtime_hours ?? 0)
      setPhHours(initialData.public_holiday_hours ?? 0)
      setPhDays(initialData.public_holiday_days ?? 0)
      setLeaveDays(initialData.leave_days ?? 0)
      setBonus(initialData.bonus ?? 0)
      setExtraEarnings(Array.isArray(initialData.extra_earnings) ? initialData.extra_earnings : [])
      setOtherDeductions(initialData.other_deductions ?? 0)
      setOtherDeductionsLabel(initialData.other_deductions_label ?? '')
      setNotes(initialData.notes ?? '')
      setPreview(null); setError('')
      return
    }

    // ── New payslip mode ──
    const defaultType = (emp.pay_type === 'daily' || emp.pay_type === 'flat') ? 'monthly' : 'weekly'
    setPayslipType(defaultType)
    const defaultRate =
      emp.pay_type === 'hourly' ? (emp.hourly_rate ?? 0) :
      emp.pay_type === 'daily'  ? (emp.daily_rate  ?? 0) :
      (emp.flat_rate ?? 0)
    setRate(defaultRate)
    setOvertimeHours(0); setPhHours(0); setPhDays(0); setLeaveDays(0); setBonus(0)
    setExtraEarnings([])
    setOtherDeductions(0); setOtherDeductionsLabel(''); setNotes('')
    setPreview(null); setError('')
    setPayDate(today)

    const period = defaultType === 'monthly' ? currentMonthlyPeriod() : currentWeekPeriod()
    setPeriodFrom(period.from); setPeriodTo(period.to)

    // Auto-fill days/hours from business days in period
    const bdays = countBusinessDays(period.from, period.to)
    if (emp.pay_type === 'daily') { setRegularDays(bdays); setRegularHours(0) }
    else if (emp.pay_type === 'hourly') { setRegularHours(bdays * 8); setRegularDays(0) }
    else { setRegularDays(0); setRegularHours(0) } // flat — no days needed
  }, [open, emp, initialData])

  // Re-set period (and auto-fill days) when type changes
  useEffect(() => {
    if (!open || !emp) return
    const period = payslipType === 'monthly' ? currentMonthlyPeriod() : currentWeekPeriod()
    setPeriodFrom(period.from); setPeriodTo(period.to)
    const bdays = countBusinessDays(period.from, period.to)
    if (emp.pay_type === 'daily') setRegularDays(bdays)
    else if (emp.pay_type === 'hourly') setRegularHours(bdays * 8)
  }, [payslipType])

  // Re-fill days/hours when period dates change manually
  useEffect(() => {
    if (!open || !emp || !periodFrom || !periodTo) return
    const bdays = countBusinessDays(periodFrom, periodTo)
    if (emp.pay_type === 'daily') setRegularDays(bdays)
    else if (emp.pay_type === 'hourly') setRegularHours(bdays * 8)
  }, [periodFrom, periodTo])

  // ── Extra earnings helpers ──────────────────────────────────────────────
  function addExtraRow() {
    setExtraEarnings(rows => [...rows, { label: '', amount: 0 }])
  }
  function updateExtra(i: number, field: keyof ExtraEarning, val: string | number) {
    setExtraEarnings(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }
  function removeExtra(i: number) {
    setExtraEarnings(rows => rows.filter((_, idx) => idx !== i))
  }

  // ── Live calc ───────────────────────────────────────────────────────────
  const calc = useMemo(() => calcPayslip({
    pay_type: payType,
    flat_amount: payType === 'flat' ? rate : 0,
    rate: payType === 'flat' ? 0 : rate,
    regular_hours: regularHours, regular_days: regularDays,
    overtime_hours: overtimeHours, public_holiday_hours: phHours,
    public_holiday_days: phDays, leave_days: leaveDays, bonus,
    extra_earnings: extraEarnings, other_deductions: otherDeductions,
  }), [payType, rate, regularHours, regularDays, overtimeHours, phHours, phDays, leaveDays, bonus, extraEarnings, otherDeductions])

  function buildPayslip(): Omit<PayslipData, 'payslip_id'> {
    return {
      employee_id: emp!.employee_id,
      period_from: periodFrom, period_to: periodTo, pay_date: payDate,
      payslip_type: payslipType, pay_type: payType,
      flat_amount: payType === 'flat' ? rate : 0,
      rate: payType === 'flat' ? 0 : rate,
      regular_hours: regularHours, regular_days: regularDays,
      overtime_hours: overtimeHours, public_holiday_hours: phHours,
      public_holiday_days: phDays, leave_days: leaveDays, bonus,
      extra_earnings: extraEarnings.filter(e => e.amount > 0),
      other_deductions: otherDeductions,
      other_deductions_label: otherDeductionsLabel || null,
      ...calc,
      notes: notes || null,
    }
  }

  function handlePreview() {
    if (!emp || !periodFrom || !periodTo || !payDate) return setError('Please fill in all period/date fields')
    setError('')
    setPreview({
      ...buildPayslip(),
      vb_employee: {
        full_name: emp.full_name, job_position: emp.job_position,
        id_number: emp.id_number, tax_ref_number: emp.tax_ref_number,
      },
    })
  }

  async function handleSave() {
    if (!emp || !periodFrom || !periodTo || !payDate) return setError('Please fill in all period/date fields')
    setError(''); setSaving(true)
    const built = buildPayslip()
    const existingId = initialData?.payslip_id
    const saved = await onSave(built, existingId)
    setSaving(false)
    setPreview({
      ...built,
      payslip_id: existingId ?? saved?.payslip_id,
      vb_employee: {
        full_name: emp.full_name, job_position: emp.job_position,
        id_number: emp.id_number, tax_ref_number: emp.tax_ref_number,
      },
    })
  }

  if (!emp) return null
  // If modal was closed with a preview showing, don't render PayslipPrint on next open
  if (!open && preview) {
    // preview will be cleared by useEffect on next open
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[95vh] overflow-y-auto p-4 sm:p-6 rounded-none sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit payslip' : 'Generate payslip'} — {emp.full_name}</DialogTitle>
        </DialogHeader>

        {preview ? (
          /* ── Preview mode ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">Review before printing</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreview(null)}>← Edit</Button>
                <Button size="sm" onClick={() => printPayslipInNewWindow(preview!, emp)} className="gap-1.5">
                  <Printer className="w-4 h-4" /> Print / Save PDF
                </Button>
              </div>
            </div>
            {/* The preview renders inline here — visible on screen, hidden on print */}
            <div className="border rounded-xl overflow-auto bg-white">
              <PayslipPrint payslip={preview} employee={emp} />
            </div>
          </div>
        ) : (
          /* ── Form mode ── */
          <div className="space-y-5">

            {/* Type + pay date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payslip type</Label>
                <Select value={payslipType} onValueChange={v => setPayslipType(v as 'weekly' | 'monthly')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Pay date</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
            </div>

            {/* Period */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Period from</Label>
                <Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Period to</Label>
                <Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} />
              </div>
            </div>
            {payslipType === 'monthly' && (
              <p className="text-xs text-muted-foreground -mt-3">
                Monthly period: 26th of previous month → 25th of current month
              </p>
            )}

            {/* Rate / flat amount */}
            <div className="space-y-1.5">
              <Label>
                {payType === 'flat'   ? 'Flat monthly amount (R)' :
                 payType === 'hourly' ? 'Hourly rate (R)' :
                                        'Daily rate (R)'}
              </Label>
              <Input
                type="number" min={0} step={0.01} value={rate || ''}
                onChange={e => setRate(parseFloat(e.target.value) || 0)}
              />
              {payType === 'flat' && (
                <p className="text-xs text-muted-foreground">
                  Fixed amount paid regardless of days worked. Add deductions or extra payments below if needed.
                </p>
              )}
            </div>

            {/* Earnings — hidden for flat rate employees */}
            {payType !== 'flat' && (
            <div className="rounded-xl border p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Earnings</p>
              {/* Auto-filled from business days in period — editable override */}
              {payType === 'hourly' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Regular hours</Label>
                    <Input type="number" min={0} step={0.5} value={regularHours || ''} placeholder="0" onChange={e => setRegularHours(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Overtime hours</Label>
                    <Input type="number" min={0} step={0.5} value={overtimeHours || ''} placeholder="0" onChange={e => setOvertimeHours(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Public holiday hours</Label>
                    <Input type="number" min={0} step={0.5} value={phHours || ''} placeholder="0" onChange={e => setPhHours(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Leave days</Label>
                    <Input type="number" min={0} step={0.5} value={leaveDays || ''} placeholder="0" onChange={e => setLeaveDays(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Bonus (R)</Label>
                    <Input type="number" min={0} step={0.01} value={bonus || ''} placeholder="0.00" onChange={e => setBonus(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Days worked</Label>
                    <Input type="number" min={0} step={0.5} value={regularDays || ''} placeholder="0" onChange={e => setRegularDays(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Public holiday days</Label>
                    <Input type="number" min={0} step={0.5} value={phDays || ''} placeholder="0" onChange={e => setPhDays(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Leave days</Label>
                    <Input type="number" min={0} step={0.5} value={leaveDays || ''} placeholder="0" onChange={e => setLeaveDays(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Bonus (R)</Label>
                    <Input type="number" min={0} step={0.01} value={bonus || ''} placeholder="0.00" onChange={e => setBonus(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              )}

            </div>
            )} {/* end payType !== flat earnings block */}

            {/* Extra payments — always shown, also for flat rate employees */}
            <div className="rounded-xl border p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Additional payments</p>
              {extraEarnings.length === 0 && (
                <p className="text-xs text-muted-foreground">No additional payments added.</p>
              )}
              {extraEarnings.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="flex-1 h-8 text-xs"
                    placeholder="Label (e.g. Transport allowance)"
                    value={row.label}
                    onChange={e => updateExtra(i, 'label', e.target.value)}
                  />
                  <Input
                    className="w-28 h-8 text-xs"
                    type="number" min={0} step={0.01}
                    placeholder="0.00"
                    value={row.amount || ''}
                    onChange={e => updateExtra(i, 'amount', parseFloat(e.target.value) || 0)}
                  />
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeExtra(i)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline" size="sm"
                className="w-full h-8 text-xs border-dashed gap-1.5"
                onClick={addExtraRow}
              >
                <Plus className="w-3.5 h-3.5" /> Add additional payment
              </Button>
            </div>

            {/* Deductions */}
            <div className="rounded-xl border p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Additional deductions</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Label</Label>
                  <Input placeholder="e.g. Uniform advance" value={otherDeductionsLabel} onChange={e => setOtherDeductionsLabel(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount (R)</Label>
                  <Input type="number" min={0} step={0.01} value={otherDeductions || ''} placeholder="0.00" onChange={e => setOtherDeductions(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            {/* Live calculation preview */}
            <div className="rounded-xl bg-muted/40 border p-4 space-y-1.5 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Calculation preview</p>
              {[
                payType === 'flat'
                  ? { label: `Monthly salary`, val: rate }
                  : { label: payType === 'hourly' ? `Regular (${regularHours}h × R${rate})` : `Days (${regularDays} × R${rate})`, val: calc.regular_pay },
                calc.overtime_pay > 0 && { label: `Overtime (${overtimeHours}h × R${(rate * OT_MULTIPLIER).toFixed(2)})`, val: calc.overtime_pay },
                calc.public_holiday_pay > 0 && { label: 'Public holiday pay', val: calc.public_holiday_pay },
                calc.leave_pay > 0 && { label: 'Leave pay', val: calc.leave_pay },
                bonus > 0 && { label: 'Bonus', val: bonus },
                ...extraEarnings.filter(e => e.amount > 0).map(e => ({ label: e.label || 'Additional payment', val: e.amount })),
              ].filter(Boolean).map((row, i) => row && (
                <div key={i} className="flex justify-between text-muted-foreground">
                  <span>{row.label}</span><span>{ZAR(row.val)}</span>
                </div>
              ))}
              <div className="flex justify-between font-medium border-t pt-1.5 mt-1">
                <span>Total earnings</span><span>{ZAR(calc.total_earnings)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>UIF (1%)</span><span>− {ZAR(calc.uif_employee)}</span>
              </div>
              {otherDeductions > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{otherDeductionsLabel || 'Other deduction'}</span><span>− {ZAR(otherDeductions)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base border-t pt-1.5 mt-1">
                <span>Nett pay</span><span>{ZAR(calc.nett_pay)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Payout (rounded to 10c)</span><span>{ZAR(calc.payout)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes…" />
            </div>

            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {error}
              </p>
            )}

            <div className="flex gap-2 justify-end sticky bottom-0 bg-background pb-2 sm:static sm:pb-0 sm:bg-transparent">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="outline" onClick={handlePreview} className="gap-1.5">
                Preview
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save & Preview
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Employee Form Modal ────────────────────────────────────────────────────
type EmployeeForm = Omit<Employee, 'employee_id'>
const EMPTY_EMPLOYEE: EmployeeForm = {
  full_name: '', id_number: null, phone_number: null, emergency_contact: null,
  bank_account_number: null, job_position: null, tax_ref_number: null,
  date_employed: null, pay_type: 'hourly', hourly_rate: null, daily_rate: null,
  flat_rate: null, is_active: true, notes: null,
}

function EmployeeModal({
  open, onClose, initial, onSave,
}: {
  open: boolean; onClose: () => void
  initial?: Employee | null
  onSave: (data: EmployeeForm, id?: number) => Promise<void>
}) {
  const [form, setForm]     = useState<EmployeeForm>(EMPTY_EMPLOYEE)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (open) setForm(initial ? { ...initial } : EMPTY_EMPLOYEE)
  }, [open, initial])

  const set = (k: keyof EmployeeForm, v: unknown) =>
    setForm(f => ({ ...f, [k]: v === '' ? null : v }))

  async function handleSave() {
    if (!form.full_name.trim()) return setError('Full name is required')
    setError(''); setSaving(true)
    await onSave(form, initial?.employee_id)
    setSaving(false); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-none sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit employee' : 'Add employee'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Full name <span className="text-destructive">*</span></Label>
            <Input value={form.full_name} placeholder="e.g. Nompumelelo Zwane" onChange={e => set('full_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Job position</Label><Input value={form.job_position ?? ''} placeholder="e.g. Bakery Assistant" onChange={e => set('job_position', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ID number</Label><Input value={form.id_number ?? ''} placeholder="13-digit SA ID" onChange={e => set('id_number', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Phone number</Label><Input value={form.phone_number ?? ''} placeholder="e.g. 078 869 6041" onChange={e => set('phone_number', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Emergency contact</Label><Input value={form.emergency_contact ?? ''} placeholder="Name – 082 000 0000" onChange={e => set('emergency_contact', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Bank account number</Label><Input value={form.bank_account_number ?? ''} placeholder="Account number" onChange={e => set('bank_account_number', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tax ref number</Label><Input value={form.tax_ref_number ?? ''} placeholder="SARS tax ref" onChange={e => set('tax_ref_number', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Date employed</Label><Input type="date" value={form.date_employed ?? ''} onChange={e => set('date_employed', e.target.value || null)} /></div>
            <div className="space-y-1.5">
              <Label>Pay type</Label>
              <Select value={form.pay_type} onValueChange={v => set('pay_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="flat">Flat (fixed monthly)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.pay_type === 'hourly' ? (
            <div className="space-y-1.5"><Label>Hourly rate (R)</Label><Input type="number" min={0} step={0.01} value={form.hourly_rate ?? ''} placeholder="e.g. 34.10" onChange={e => set('hourly_rate', parseFloat(e.target.value) || null)} /></div>
          ) : form.pay_type === 'daily' ? (
            <div className="space-y-1.5"><Label>Daily rate (R)</Label><Input type="number" min={0} step={0.01} value={form.daily_rate ?? ''} placeholder="e.g. 280.00" onChange={e => set('daily_rate', parseFloat(e.target.value) || null)} /></div>
          ) : (
            <div className="space-y-1.5">
              <Label>Flat monthly amount (R)</Label>
              <Input type="number" min={0} step={0.01} value={form.flat_rate ?? ''} placeholder="e.g. 9000.00" onChange={e => set('flat_rate', parseFloat(e.target.value) || null)} />
              <p className="text-xs text-muted-foreground">Fixed amount paid each period, regardless of days worked.</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox id="is-active" checked={form.is_active} onCheckedChange={v => set('is_active', v === true)} />
            <Label htmlFor="is-active" className="cursor-pointer">Active employee</Label>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes ?? ''} placeholder="Any additional notes…" rows={2} onChange={e => set('notes', e.target.value)} /></div>
          {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
          <div className="flex justify-end gap-2 pt-1 sticky bottom-0 bg-background pb-2 sm:static sm:pb-0 sm:bg-transparent">
            <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {initial ? 'Save changes' : 'Add employee'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Payslip History Sheet ──────────────────────────────────────────────────
function PayslipHistorySheet({
  open, onClose, employee, payslips, onPrint, onDelete, onMarkPaid, onEdit,
}: {
  open: boolean; onClose: () => void
  employee: Employee | null
  payslips: PayslipData[]
  onPrint: (p: PayslipData) => void
  onDelete: (id: number) => Promise<void>
  onMarkPaid: (id: number, datePaid: string) => Promise<void>
  onEdit: (p: PayslipData) => void
}) {
  const [deleteTarget, setDeleteTarget]     = useState<PayslipData | null>(null)
  const [markPaidTarget, setMarkPaidTarget] = useState<PayslipData | null>(null)
  const [markPaidDate, setMarkPaidDate]     = useState('')
  const [working, setWorking]               = useState(false)

  const today = new Date().toISOString().split('T')[0]

  if (!employee) return null

  async function confirmDelete() {
    if (!deleteTarget?.payslip_id) return
    setWorking(true)
    await onDelete(deleteTarget.payslip_id)
    setWorking(false)
    setDeleteTarget(null)
  }

  async function confirmMarkPaid() {
    if (!markPaidTarget?.payslip_id || !markPaidDate) return
    setWorking(true)
    await onMarkPaid(markPaidTarget.payslip_id, markPaidDate)
    setWorking(false)
    setMarkPaidTarget(null)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-4 sm:p-6">
          <SheetHeader className="mb-4">
            <SheetTitle>Payslip history — {employee.full_name}</SheetTitle>
          </SheetHeader>

          {payslips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <FileText className="w-8 h-8 opacity-30" />
              <p className="text-sm">No payslips generated yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payslips.map(p => {
                const isPaid = !!p.date_paid
                return (
                  <div key={p.payslip_id} className="rounded-xl border bg-card p-4 space-y-3">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {new Date(p.period_from).toLocaleDateString('en-ZA')} – {new Date(p.period_to).toLocaleDateString('en-ZA')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Pay date: {new Date(p.pay_date).toLocaleDateString('en-ZA')} · {p.payslip_type}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isPaid ? (
                          <span className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                            Paid {new Date(p.date_paid!).toLocaleDateString('en-ZA')}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            Unpaid
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Summary figures */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {[
                        { label: 'Earnings',   val: p.total_earnings },
                        { label: 'Deductions', val: p.total_deductions },
                        { label: 'Nett pay',   val: p.nett_pay },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-muted/40 rounded-lg p-2">
                          <p className="text-muted-foreground">{label}</p>
                          <p className="font-semibold">{ZAR(Number(val ?? 0))}</p>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 pt-1 border-t flex-wrap">
                      <Button
                        size="sm" variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => onPrint(p)}
                      >
                        <Printer className="w-3 h-3" /> Print
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => onEdit(p)}
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </Button>
                      {!isPaid && (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => { setMarkPaidDate(today); setMarkPaidTarget(p) }}
                        >
                          <BanknoteIcon className="w-3 h-3" /> Mark paid
                        </Button>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 text-xs gap-1 text-destructive hover:text-destructive ml-auto"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payslip?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the payslip for{' '}
              {deleteTarget && (
                <strong>
                  {new Date(deleteTarget.period_from).toLocaleDateString('en-ZA')} – {new Date(deleteTarget.period_to).toLocaleDateString('en-ZA')}
                </strong>
              )}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={working}
            >
              {working && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Mark as paid ── */}
      <AlertDialog open={!!markPaidTarget} onOpenChange={() => setMarkPaidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark payslip as paid</AlertDialogTitle>
            <AlertDialogDescription>
              {markPaidTarget && (
                <>
                  Payslip period: <strong>{new Date(markPaidTarget.period_from).toLocaleDateString('en-ZA')} – {new Date(markPaidTarget.period_to).toLocaleDateString('en-ZA')}</strong>
                  <br />Nett pay: <strong>{ZAR(Number(markPaidTarget.nett_pay ?? 0))}</strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2 space-y-1.5">
            <Label className="text-sm">Date paid</Label>
            <Input
              type="date"
              value={markPaidDate}
              onChange={e => setMarkPaidDate(e.target.value)}
              className="h-9"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmMarkPaid}
              disabled={working || !markPaidDate}
              className="gap-1.5"
            >
              {working
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />
              }
              Confirm payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Employees Tab ──────────────────────────────────────────────────────────
export function EmployeesTab() {
  const supabase = createClient()

  const [employees, setEmployees]               = useState<Employee[]>([])
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee]   = useState<Employee | null>(null)
  const [payslipEmployee, setPayslipEmployee]   = useState<Employee | null>(null)
  const [historyEmployee, setHistoryEmployee]   = useState<Employee | null>(null)
  const [employeePayslips, setEmployeePayslips] = useState<PayslipData[]>([])
  const [deleteTarget, setDeleteTarget]         = useState<Employee | null>(null)
  const [editingPayslip, setEditingPayslip]     = useState<PayslipData | null>(null)
  const [search, setSearch]                     = useState('')
  const [showInactive, setShowInactive]         = useState(false)

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('vb_employee').select('*').order('full_name')
    setEmployees((data as Employee[]) ?? [])
  }, [])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  const filtered = employees.filter(e =>
    (showInactive || e.is_active) &&
    e.full_name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSaveEmployee(data: EmployeeForm, id?: number) {
    if (id) await supabase.from('vb_employee').update(data).eq('employee_id', id)
    else    await supabase.from('vb_employee').insert([data])
    await fetchEmployees()
  }

  async function handleDeleteEmployee(id: number) {
    await supabase.from('vb_payslip').delete().eq('employee_id', id)
    await supabase.from('vb_employee').delete().eq('employee_id', id)
    await fetchEmployees()
  }

  async function handleSavePayslip(data: Omit<PayslipData, 'payslip_id'>, existingId?: number): Promise<PayslipData> {
    if (existingId) {
      // Update existing payslip
      await supabase.from('vb_payslip').update(data).eq('payslip_id', existingId)
      // Refresh history list
      if (historyEmployee) await handleViewHistory(historyEmployee)
      return { ...data, payslip_id: existingId }
    }
    const { data: saved } = await supabase.from('vb_payslip').insert([data]).select().single()
    return saved as PayslipData
  }

  async function handleViewHistory(emp: Employee) {
    setHistoryEmployee(emp)
    const { data } = await supabase.from('vb_payslip')
      .select('*').eq('employee_id', emp.employee_id).order('period_from', { ascending: false })
    setEmployeePayslips((data as PayslipData[]) ?? [])
  }

  function handlePrintHistorical(p: PayslipData) {
    const emp = employees.find(e => e.employee_id === p.employee_id)
    if (!emp) return
    printPayslipInNewWindow(p, emp)
  }

  async function handleDeletePayslip(id: number) {
    await supabase.from('vb_payslip').delete().eq('payslip_id', id)
    // Refresh the payslip list for the currently open history sheet
    if (historyEmployee) await handleViewHistory(historyEmployee)
  }

  async function handleMarkPayslipPaid(id: number, datePaid: string) {
    await supabase.from('vb_payslip').update({ date_paid: datePaid }).eq('payslip_id', id)
    if (historyEmployee) await handleViewHistory(historyEmployee)
  }

  function handleEditPayslip(p: PayslipData) {
    // Find the employee for this payslip, set them as the payslip target
    // and pre-populate the generate modal with existing data
    setEditingPayslip(p)
    const emp = employees.find(e => e.employee_id === p.employee_id)
    if (emp) setPayslipEmployee(emp)
  }

  return (
    <div className="space-y-4">
      {/* Search + controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          className="h-8 text-xs max-w-xs"
          placeholder="Search employees…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSearch('')}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
        <div className="flex items-center gap-1.5">
          <Checkbox id="show-inactive" checked={showInactive} onCheckedChange={v => setShowInactive(v === true)} />
          <Label htmlFor="show-inactive" className="text-xs cursor-pointer text-muted-foreground">Show inactive</Label>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} employee{filtered.length !== 1 ? 's' : ''}
        </span>
        <Button size="sm" onClick={() => { setEditingEmployee(null); setEmployeeModalOpen(true) }} className="gap-1.5">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add employee</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Users className="w-10 h-10 opacity-30" />
          <p className="text-sm">{search ? 'No employees match your search.' : 'No employees yet.'}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Pay type</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-44" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(e => (
                  <TableRow key={e.employee_id} className={!e.is_active ? 'opacity-50' : ''}>
                    <TableCell className="font-medium text-sm">{e.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.job_position ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs gap-1">
                        {e.pay_type === 'hourly' ? <Clock className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                        {e.pay_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {e.pay_type === 'hourly' && e.hourly_rate ? `R${e.hourly_rate}/hr` : ''}
                      {e.pay_type === 'daily'  && e.daily_rate  ? `R${e.daily_rate}/day` : ''}
                      {e.pay_type === 'flat'   && e.flat_rate   ? `R${e.flat_rate}/mo` : ''}
                      {!e.hourly_rate && !e.daily_rate && !e.flat_rate ? '—' : ''}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.phone_number ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={e.is_active ? 'secondary' : 'outline'} className="text-xs">
                        {e.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => handleViewHistory(e)}>
                          <FileText className="w-3.5 h-3.5" /> History
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setPayslipEmployee(e)}>
                          <Printer className="w-3.5 h-3.5" /> Payslip
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingEmployee(e); setEmployeeModalOpen(true) }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(e)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map(e => (
              <div key={e.employee_id} className={`rounded-xl border bg-card p-4 space-y-3 ${!e.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{e.full_name}</p>
                    {e.job_position && <p className="text-xs text-muted-foreground mt-0.5">{e.job_position}</p>}
                  </div>
                  <Badge variant="outline" className="text-xs gap-1 shrink-0">
                    {e.pay_type === 'hourly' ? <Clock className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                    {e.pay_type === 'hourly' && e.hourly_rate ? `R${e.hourly_rate}/hr` : ''}
                    {e.pay_type === 'daily'  && e.daily_rate  ? `R${e.daily_rate}/day` : ''}
                    {e.pay_type === 'flat'   && e.flat_rate   ? `R${e.flat_rate}/mo`  : ''}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  {e.phone_number          && <div className="flex items-center gap-1.5"><Phone     className="w-3 h-3" />{e.phone_number}</div>}
                  {e.bank_account_number   && <div className="flex items-center gap-1.5"><CreditCard className="w-3 h-3" />{e.bank_account_number}</div>}
                  {e.emergency_contact     && <div className="col-span-2 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" />{e.emergency_contact}</div>}
                </div>
                <div className="flex gap-2 pt-1 border-t">
                  <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={() => handleViewHistory(e)}>
                    <FileText className="w-3 h-3" /> History
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={() => setPayslipEmployee(e)}>
                    <Printer className="w-3 h-3" /> Payslip
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditingEmployee(e); setEmployeeModalOpen(true) }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(e)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.full_name}</strong> and all their payslips. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { handleDeleteEmployee(deleteTarget.employee_id); setDeleteTarget(null) } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modals */}
      <EmployeeModal
        open={employeeModalOpen}
        onClose={() => setEmployeeModalOpen(false)}
        initial={editingEmployee}
        onSave={handleSaveEmployee}
      />
      <GeneratePayslipModal
        open={!!payslipEmployee}
        onClose={() => {
          setPayslipEmployee(null)
          setEditingPayslip(null)
        }}
        employee={payslipEmployee}
        onSave={handleSavePayslip}
        initialData={editingPayslip}
      />
      <PayslipHistorySheet
        open={!!historyEmployee}
        onClose={() => setHistoryEmployee(null)}
        employee={historyEmployee}
        payslips={employeePayslips}
        onPrint={handlePrintHistorical}
        onDelete={handleDeletePayslip}
        onMarkPaid={handleMarkPayslipPaid}
        onEdit={handleEditPayslip}
      />
    </div>
  )
}