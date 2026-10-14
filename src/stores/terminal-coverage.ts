import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { PORTS } from '@/mock/ports'
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

const STORAGE_KEY = 'vsp-terminal-coverage-v2'
const LEGACY_KEY = 'vsp-terminal-coverage-v1'

type CoverageSnapshot = {
  regions: RegionRecord[]
  ports: PortCoverage[]
}

function isPort(value: unknown): value is PortCoverage {
  if (!value || typeof value !== 'object') return false
  const row = value as PortCoverage
  return typeof row.portCode === 'string'
    && typeof row.portName === 'string'
    && typeof row.available === 'boolean'
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

function backfillPort(port: PortCoverage): PortCoverage {
  const regionCode = typeof port.regionCode === 'string' && port.regionCode
    ? port.regionCode
    : regionFromStaticPort(port.portCode)
  return { ...port, regionCode }
}

function parseSnapshot(value: unknown): CoverageSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const row = value as CoverageSnapshot
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
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const parsed: unknown = JSON.parse(legacy)
      if (Array.isArray(parsed) && parsed.every(isPort)) {
        return { regions: createSeedRegions(), ports: parsed.map(backfillPort) }
      }
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
    const next: CoverageSnapshot = { regions: regions.value, ports: ports.value }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, { deep: true })

  function save(input: PortCoverage, previousCode?: string) {
    const previous = previousCode?.trim().toUpperCase()
    const existing = ports.value.find((port) => port.portCode === (previous || input.portCode.trim().toUpperCase()))
    const message = validatePort(input, ports.value, regions.value, previousCode, existing?.regionCode)
    if (message) return message
    const next = normalizePort(input)
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

  /** Removes the region and clears it on every port that used it. */
  function removeRegion(code: string) {
    const key = code.trim().toUpperCase()
    regions.value = regions.value.filter((region) => region.code !== key)
    for (const port of ports.value) {
      if (port.regionCode === key) port.regionCode = ''
    }
  }

  function remove(portCode: string) {
    ports.value = ports.value.filter((port) => port.portCode !== portCode)
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
    removeRegion,
    remove,
    move,
    resolveTerminal,
    canCallFeituo,
    clonePort,
  }
})
