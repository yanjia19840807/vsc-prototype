const BRAND_BY_SUFFIX: Record<string, string> = {
  MA: 'CMA',
  NC: 'CNC',
  PL: 'APL',
  NL: 'ANL',
}

/** Brand code is the last two letters of CMA, CNC, APL, or ANL, after a digit. */
export function brandFromVoyage(voyage: string): string {
  const match = voyage.trim().toUpperCase().match(/[0-9](MA|NC|PL|NL)$/)
  return match ? BRAND_BY_SUFFIX[match[1]!] ?? '' : ''
}
