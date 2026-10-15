import { PORTS } from '@/mock/ports'
import { TML_MATRIX } from '@/mock/tml-matrix'

/** One CMA terminal under a port. Translates an API terminal code into a 9code. */
export type PortTerminal = {
  id: string
  /** Terminal 9code (CMA pool location). */
  pool: string
  /** Terminal abbreviation. Empty when the matrix has no short code. */
  abbr: string
  nameZh: string
}

/** Region catalog row. `code` is the stable key stored on ports and vessels. */
export type RegionRecord = {
  code: string
  name: string
  active: boolean
}

/** Port master row. `apiCovered` decides whether the terminal schedule API is called. */
export type PortCoverage = {
  portCode: string
  portName: string
  /** Region code. Stays on the port after that region is deactivated. */
  regionCode: string
  /** False when the port is deactivated. Historical rows still show the code. */
  active: boolean
  apiCovered: boolean
  terminals: PortTerminal[]
}

export function createSeedRegions(): RegionRecord[] {
  return [
    { code: 'NC', name: 'North China', active: true },
    { code: 'CC', name: 'Central China', active: true },
    { code: 'SC', name: 'South China', active: true },
    { code: 'HK', name: 'Hong Kong', active: true },
  ]
}

export function regionLabel(region: Pick<RegionRecord, 'code' | 'name'> | undefined) {
  if (!region?.code) return ''
  return region.name ? `${region.code} (${region.name})` : region.code
}

/** Vendor terminal codes that are not the matrix abbreviation. */
export const TERMINAL_CODE_ALIAS: Record<string, string> = {
  YS01: 'YAN1',
}

export function createTerminalId() {
  return `tml-${crypto.randomUUID()}`
}

export function createSeedPorts(): PortCoverage[] {
  return PORTS.map((port) => ({
    portCode: port.code,
    portName: port.name,
    regionCode: port.region,
    active: true,
    apiCovered: port.apiCovered,
    terminals: TML_MATRIX.filter((row) => row.port === port.code).map((row) => ({
      id: `${port.code}-${row.pool}`,
      pool: row.pool,
      abbr: row.abbr,
      nameZh: row.nameZh,
    })),
  }))
}

export function clonePort(port: PortCoverage): PortCoverage {
  return {
    portCode: port.portCode,
    portName: port.portName,
    regionCode: port.regionCode,
    active: port.active,
    apiCovered: port.apiCovered,
    terminals: port.terminals.map((terminal) => ({ ...terminal })),
  }
}

export function emptyPort(): PortCoverage {
  return { portCode: '', portName: '', regionCode: '', active: true, apiCovered: false, terminals: [] }
}

export function normalizeRegion(input: RegionRecord): RegionRecord {
  return {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    active: input.active,
  }
}

export function normalizePort(input: PortCoverage): PortCoverage {
  return {
    portCode: input.portCode.trim().toUpperCase(),
    portName: input.portName.trim(),
    regionCode: input.regionCode.trim().toUpperCase(),
    active: input.active,
    apiCovered: input.apiCovered,
    terminals: input.terminals.map((terminal) => ({
      id: terminal.id || createTerminalId(),
      pool: terminal.pool.trim().toUpperCase(),
      abbr: terminal.abbr.trim().toUpperCase(),
      nameZh: terminal.nameZh.trim(),
    })),
  }
}

export type TerminalFieldErrors = {
  pool?: string
  abbr?: string
}

export type PortFieldErrors = {
  portCode?: string
  portName?: string
  regionCode?: string
  terminals: Record<string, TerminalFieldErrors>
}

export type RegionFieldErrors = {
  code?: string
  name?: string
}

/** Field-level messages for an inline region row. */
export function regionFieldErrors(input: RegionRecord, regions: RegionRecord[], previousCode?: string): RegionFieldErrors {
  const region = normalizeRegion(input)
  const errors: RegionFieldErrors = {}
  if (!region.code) errors.code = 'Code is required'
  if (!region.name) errors.name = 'Name is required'
  const previous = previousCode?.trim().toUpperCase()
  if (region.code && regions.some((row) => row.code === region.code && row.code !== previous)) {
    errors.code = 'Code already exists'
  }
  return errors
}

/** Field-level messages for the port form. Empty when the port can be saved. */
export function portFieldErrors(
  input: PortCoverage,
  ports: PortCoverage[],
  regions: RegionRecord[],
  previousCode?: string,
  keptRegionCode?: string,
): PortFieldErrors {
  const port = normalizePort(input)
  const errors: PortFieldErrors = { terminals: {} }
  if (!port.portCode) errors.portCode = 'Port code is required'
  if (!port.portName) errors.portName = 'Port name is required'
  const kept = keptRegionCode?.trim().toUpperCase()
  if (!port.regionCode) errors.regionCode = 'Region is required'
  else {
    const region = regions.find((row) => row.code === port.regionCode)
    if (!region) errors.regionCode = 'Region is required'
    else if (!region.active && region.code !== kept) errors.regionCode = 'Select an active region'
  }
  const previous = previousCode?.trim().toUpperCase()
  if (port.portCode && ports.some((row) => row.portCode === port.portCode && row.portCode !== previous)) {
    errors.portCode = 'Port code already exists'
  }
  const pools = new Map<string, string>()
  const abbreviations = new Map<string, string>()
  for (const terminal of port.terminals) {
    const row: TerminalFieldErrors = {}
    if (!terminal.pool) row.pool = 'Terminal 9code is required'
    else if (pools.has(terminal.pool)) {
      row.pool = `Terminal 9code ${terminal.pool} is duplicated`
      const firstId = pools.get(terminal.pool)
      if (firstId) errors.terminals[firstId] = { ...errors.terminals[firstId], pool: row.pool }
    } else {
      pools.set(terminal.pool, terminal.id)
    }
    if (terminal.abbr) {
      if (abbreviations.has(terminal.abbr)) {
        row.abbr = `Abbreviation ${terminal.abbr} is duplicated`
        const firstId = abbreviations.get(terminal.abbr)
        if (firstId) errors.terminals[firstId] = { ...errors.terminals[firstId], abbr: row.abbr }
      } else {
        abbreviations.set(terminal.abbr, terminal.id)
      }
    }
    if (row.pool || row.abbr) errors.terminals[terminal.id] = { ...errors.terminals[terminal.id], ...row }
  }
  return errors
}

/** Returns the first validation message, or null when the port can be saved. */
export function validatePort(
  input: PortCoverage,
  ports: PortCoverage[],
  regions: RegionRecord[],
  previousCode?: string,
  keptRegionCode?: string,
): string | null {
  const errors = portFieldErrors(input, ports, regions, previousCode, keptRegionCode)
  if (errors.portCode) return errors.portCode
  if (errors.portName) return errors.portName
  if (errors.regionCode) return errors.regionCode
  for (const terminal of Object.values(errors.terminals)) {
    if (terminal.pool) return terminal.pool
    if (terminal.abbr) return terminal.abbr
  }
  return null
}

export function findTerminal(
  ports: PortCoverage[],
  portCode: string,
  terminal: string | null | undefined,
): PortTerminal | undefined {
  if (!terminal) return undefined
  const port = ports.find((row) => row.portCode === portCode)
  if (!port) return undefined
  const code = TERMINAL_CODE_ALIAS[terminal] ?? terminal
  return port.terminals.find(
    (row) => row.abbr === code || row.pool === code || row.abbr === terminal || row.pool === terminal,
  )
}

export function portCanCallFeituo(ports: PortCoverage[], portCode: string) {
  return ports.some((port) => port.portCode === portCode && port.active && port.apiCovered)
}

export function selectableRegions(regions: RegionRecord[]) {
  return regions.filter((region) => region.active)
}

export function selectablePorts(ports: PortCoverage[]) {
  return ports.filter((port) => port.active)
}
