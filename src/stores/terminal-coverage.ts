import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import {
  clonePort,
  createSeedPorts,
  createSeedRegions,
  findTerminal,
  normalizePort,
  normalizeRegion,
  portCanCallFeituo,
  regionFieldErrors,
  validatePort,
  type PortCoverage,
  type RegionRecord,
} from '@/features/terminal-coverage/model'
import { PORTS } from '@/mock/ports'

const STORAGE_KEY = 'vsc-terminal-coverage-v3'
const LEGACY_KEYS = ['vsp-terminal-coverage-v3', 'vsp-terminal-coverage-v2', 'vsp-terminal-coverage-v1']

type CoverageSnapshot = {
  regions: RegionRecord[]
  ports: PortCoverage[]
}

type LegacyPort = {
  portCode: string
  portName: string
  regionCode?: string
  available?: boolean
  apiCovered?: boolean
  active?: boolean
  terminals: PortCoverage['terminals']
}

function isPort(value: unknown): value is LegacyPort {
  if (!value || typeof value !== 'object') return false
  const row = value as LegacyPort
  return typeof row.portCode === 'string'
    && typeof row.portName === 'string'
    && Array.isArray(row.terminals)
}

function isRegion(value: unknown): value is RegionRecord {
  if (!value || typeof value !== 'object') return false
  const row = value as RegionRecord
  return typeof row.code === 'string'
    && typeof row.name === 'string'
    && typeof row.active === 'boolean'
}

function regionFromStaticPort(portCode: string) {
  return PORTS.find((port) => port.code === portCode)?.region ?? ''
}

function backfillPort(port: LegacyPort): PortCoverage {
  const seed = PORTS.find((row) => row.code === port.portCode)
  const regionCode = typeof port.regionCode === 'string' && port.regionCode
    ? port.regionCode
    : regionFromStaticPort(port.portCode)
  const apiCovered = typeof port.apiCovered === 'boolean'
    ? port.apiCovered
    : typeof port.available === 'boolean'
      ? port.available
      : seed?.apiCovered ?? false
  return {
    portCode: port.portCode,
    portName: port.portName,
    regionCode,
    active: typeof port.active === 'boolean' ? port.active : true,
    apiCovered,
    terminals: port.terminals,
  }
}

function parseSnapshot(value: unknown): CoverageSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<CoverageSnapshot> & { ports?: unknown; regions?: unknown }
  if (!Array.isArray(row.regions) || !row.regions.every(isRegion)) return null
  if (!Array.isArray(row.ports) || !row.ports.every(isPort)) return null
  return { regions: row.regions, ports: row.ports.map(backfillPort) }
}

function loadSnapshot(): CoverageSnapshot {
  try {
    const current = localStorage.getItem(STORAGE_KEY)
    if (current) {
      const snapshot = parseSnapshot(JSON.parse(current) as unknown)
      if (snapshot) return snapshot
    }
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key)
      if (!legacy) continue
      const parsed: unknown = JSON.parse(legacy)
      if (Array.isArray(parsed) && parsed.every(isPort)) {
        return { regions: createSeedRegions(), ports: parsed.map(backfillPort) }
      }
      const snapshot = parseSnapshot(parsed)
      if (snapshot) return snapshot
    }
  } catch {
    // Fall through to the seed catalog.
  }
  return { regions: createSeedRegions(), ports: createSeedPorts() }
}

export const useTerminalCoverageStore = defineStore('terminal-coverage', () => {
  const snapshot = loadSnapshot()
  const regions = ref<RegionRecord[]>(snapshot.regions)
  const ports = ref<PortCoverage[]>(snapshot.ports)

  watch([regions, ports], () => {
    const next: CoverageSnapshot = {
      regions: regions.value,
      ports: ports.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, { deep: true })

  function save(input: PortCoverage, previousCode?: string) {
    const previous = previousCode?.trim().toUpperCase()
    const existing = ports.value.find((port) => port.portCode === (previous || input.portCode.trim().toUpperCase()))
    const message = validatePort(input, ports.value, regions.value, previousCode, existing?.regionCode)
    if (message) return message
    const next = normalizePort({ ...input, active: existing?.active ?? input.active })
    const index = ports.value.findIndex((port) => port.portCode === (previous || next.portCode))
    if (index === -1) ports.value.push(next)
    else ports.value.splice(index, 1, next)
    return null
  }

  function saveRegion(input: RegionRecord, previousCode?: string) {
    const errors = regionFieldErrors(input, regions.value, previousCode)
    if (errors.code || errors.name) return errors.code ?? errors.name ?? 'Region is invalid'
    const next = normalizeRegion(input)
    if (previousCode) next.code = previousCode.trim().toUpperCase()
    const index = regions.value.findIndex((region) => region.code === next.code)
    if (index === -1) regions.value.push(next)
    else regions.value.splice(index, 1, next)
    return null
  }

  function setRegionActive(code: string, active: boolean) {
    const region = regions.value.find((row) => row.code === code)
    if (!region || region.active === active) return
    saveRegion({ ...region, active }, region.code)
  }

  function setPortActive(portCode: string, active: boolean) {
    const port = ports.value.find((row) => row.portCode === portCode)
    if (!port || port.active === active) return
    port.active = active
  }

  /** Removes a region that no vessel or port still uses. */
  function removeRegion(code: string) {
    const key = code.trim().toUpperCase()
    regions.value = regions.value.filter((row) => row.code !== key)
  }

  function remove(portCode: string) {
    ports.value = ports.value.filter((row) => row.portCode !== portCode)
  }

  function move(portCode: string, beforePortCode: string) {
    const from = ports.value.findIndex((port) => port.portCode === portCode)
    const to = ports.value.findIndex((port) => port.portCode === beforePortCode)
    if (from < 0 || to < 0 || from === to) return
    const next = [...ports.value]
    const [item] = next.splice(from, 1)
    if (!item) return
    next.splice(to, 0, item)
    ports.value = next
  }

  function resolveTerminal(portCode: string, terminal: string | null | undefined) {
    return findTerminal(ports.value, portCode, terminal)
  }

  function canCallFeituo(portCode: string) {
    return portCanCallFeituo(ports.value, portCode)
  }

  return {
    regions,
    ports,
    save,
    saveRegion,
    setRegionActive,
    setPortActive,
    removeRegion,
    remove,
    move,
    resolveTerminal,
    canCallFeituo,
    clonePort,
  }
})
