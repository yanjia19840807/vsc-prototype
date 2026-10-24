import { brandFromVoyage } from '@/domain/lara-brand'

/** Display values from the BRD vessel-type rule. Empty when the voyage digit is neither 3 nor 9. */
export type VesselTypeLabel = 'Group vsl' | 'Partner vsl' | '3PF' | ''

const GROUP_CODES = new Set(['CMA', 'CNC', 'ANL'])

const GROUP_NAMES = [
  'CMA CGM ASIA SHIPPING PTE LTD',
  'BRAND OF CMA CGM ASIA SHIPPING',
  'CMA CGM ASIA SHIPPING',
  'ANL SINGAPORE PTE LTD',
  'ANL CONTAINER LINE PTY LTD',
  'CMA-CGM',
  'CMA CGM',
]

function companyName(value: string) {
  return value.trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ')
}

/** Group companies from the BRD: CMA CGM, CNC, ANL, and the listed legal names. APL stays partner. */
export function isGroupVesselCompany(value: string) {
  const name = companyName(value)
  if (!name || name === 'APL') return false
  if (GROUP_CODES.has(name)) return true
  return GROUP_NAMES.some((item) => name.includes(item))
}

/** Last digit after the brand suffix. The BRD diagram uses that digit: 3 = 3PF, 9 = mainliner. */
function typeDigit(voyage: string) {
  const stripped = voyage.trim().toUpperCase().replace(/(MA|NC|PL|NL)$/, '')
  return stripped.match(/(\d)(?!.*\d)/)?.[1] ?? ''
}

export function vesselTypeText(input: {
  laraVoyage: string
  brand?: string
  vesselOperator?: string
}): VesselTypeLabel {
  const digit = typeDigit(input.laraVoyage)
  if (digit === '3') return '3PF'
  if (digit !== '9') return ''
  const brand = brandFromVoyage(input.laraVoyage) || input.brand || ''
  const group = [brand, input.vesselOperator ?? ''].some((value) => isGroupVesselCompany(value))
  return group ? 'Group vsl' : 'Partner vsl'
}
