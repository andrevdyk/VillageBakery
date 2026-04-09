/**
 * Canonical seller name → list of aliases the AI might return.
 * All values are lower-cased for comparison.
 */
export const SELLER_ALIASES: Record<string, string[]> = {
  belinda: [
    'belinda', 'belinda d', 'b. creations', 'b.creations', 'bcreations',
    'belinda m', 'b creations', 'bel', 'belinda b',
  ],
  linda: [
    'linda', 'linda m', 'linda b',
  ],
  'book nook': [
    'book nook', 'booknook', 'bk nook', 'bknook', 'candi', 'candi bk nook',
    'candi book nook', 'book', 'bk',
  ],
  'wk rose': [
    'wk rose', 'wkrose', 'rose', 'w k rose', 'wk',
  ],
  'ant v': [
    'ant v', 'antv', 'av', 'a v', 'ant', 'anthony v', 'ant van',
  ],
  sarnel: [
    'sarnel', 'sarnel c', 'sarnelc', 'sarnel ch',
  ],
  biani: [
    'biani', 'bianca', 'biani c',
  ],
  christa: [
    'christa', 'christa h', 'christah', 'chr',
  ],
  gunter: [
    'gunter', 'günter', 'gunther',
  ],
}

/**
 * Returns the canonical seller name if a match is found, otherwise null.
 */
export function matchSellerName(raw: string): string | null {
  const normalised = raw.toLowerCase().trim()
  for (const [canonical, aliases] of Object.entries(SELLER_ALIASES)) {
    if (normalised === canonical || aliases.includes(normalised)) {
      return canonical
    }
  }
  // Partial / contains match fallback
  for (const [canonical, aliases] of Object.entries(SELLER_ALIASES)) {
    if (
      canonical.includes(normalised) ||
      normalised.includes(canonical) ||
      aliases.some((a) => a.includes(normalised) || normalised.includes(a))
    ) {
      return canonical
    }
  }
  return null
}
