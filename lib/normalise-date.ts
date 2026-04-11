/**
 * Normalise any curios date string to yyyy-mm-dd.
 * Returns null if the input is empty/null.
 * Returns the raw string if it can't be parsed (let the DB reject it).
 */
export function normaliseSheetDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null

  // Already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // dd/mm/yyyy  e.g. 09/04/2026
  // dd/mm/yy    e.g. 8/4/26
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slashMatch) {
    const [, d, m, y] = slashMatch
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // dd.mm.yyyy  e.g. 16.3.2026
  // dd.mm.yy    e.g. 14.3.26
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (dotMatch) {
    const [, d, m, y] = dotMatch
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // "28 March" / "13Mar 2026" / "26 March" (no year → assume 2026)
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }
  const wordMatch = s.match(/^(\d{1,2})\s*([a-zA-Z]{3})[a-zA-Z]*[\s,]*(\d{2,4})?$/)
  if (wordMatch) {
    const [, d, mon, y] = wordMatch
    const month = months[mon.toLowerCase()]
    const year = y ? (y.length === 2 ? `20${y}` : y) : '2026'
    if (month) return `${year}-${month}-${d.padStart(2, '0')}`
  }

  return s // fallback — return as-is
}

/** Format a yyyy-mm-dd string for display, e.g. "8 April 2026" */
export function formatSheetDate(isoDate: string | null | undefined): string {
  if (!isoDate) return 'Undated'
  try {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return isoDate
  }
}