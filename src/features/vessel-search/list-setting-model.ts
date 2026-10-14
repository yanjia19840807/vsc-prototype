import type { MatchingStatus, VesselRecord } from '@/types/vsp'

import {
  LARA_BRANDS,
  LARA_VESSEL_TYPES,
  LARA_VOYAGE_STATUSES,
} from '@/features/vessel-schedule/manual-vessel-schemas'
import {
  SEARCH_COLUMNS,
  columnHeaderLabel,
  groupColumnOrder,
  matchingStatusLabel,
  searchCellText,
  searchSortValue,
  type SearchColumn,
} from '@/features/vessel-search/search-columns'
import {
  DEFAULT_SORT,
  defaultColumnPrefs,
  defaultTimeWindow,
  loadColumns,
  loadFilters,
  loadSort,
  loadTime,
  type ColumnPrefs,
  type SortRule,
  type TimeWindow,
} from '@/features/vessel-search/schedule-prefs'

export type FilterControlKind = 'text' | 'datetime' | 'multi'

export type FilterOptionSource =
  | 'region'
  | 'pointCode'
  | 'mappingStatus'
  | 'voyageStatus'
  | 'vesselType'
  | 'brand'
  | 'tmlVslStatus'
  | 'terminal9code'
  | 'terminalName'

export type FilterFieldDef = {
  id: string
  label: string
  kind: FilterControlKind
  optionSource?: FilterOptionSource
}

export type FilterState = {
  text: string
  from: string
  to: string
  values: string[]
  on: boolean
}

export type FilterPref = {
  id: string
  visible: boolean
  default: FilterState
}

export type ListSetting = {
  id: string
  name: string
  filters: FilterPref[]
  columns: ColumnPrefs
  sort: SortRule[]
}

export type UserListSettings = {
  activeId: string
  items: ListSetting[]
  catalogRev?: number
}

export const DEFAULT_VISIBLE_FILTERS = [
  'region',
  'pointCode',
  'vesselName',
  'laraVoyage',
  'service',
  'mappingStatus',
] as const

const CATALOG_REV = 2

const MULTI_FIELDS: Record<string, FilterOptionSource> = {
  region: 'region',
  pointCode: 'pointCode',
  mappingStatus: 'mappingStatus',
  voyageStatus: 'voyageStatus',
  vesselType: 'vesselType',
  brand: 'brand',
  tmlVslStatus: 'tmlVslStatus',
  terminal9code: 'terminal9code',
  terminalName: 'terminalName',
}

const MAPPING_STATUSES: MatchingStatus[] = [
  'Auto matched',
  'Manual matched',
  'Multiple terminal records',
  'Terminal time gap',
  'No external voyage',
  'No terminal record',
  'Port not covered',
  'Pending match',
  'Linked',
]

const TERMINAL_STATUSES = ['计划', '在港', '离港']

const EXTRA_FIELDS: FilterFieldDef[] = [
  { id: 'region', label: 'LARA Region', kind: 'multi', optionSource: 'region' },
]

const SEARCHABLE_SOURCES = new Set<FilterOptionSource>(['pointCode', 'terminal9code', 'terminalName'])

export function filterIsSearchable(field: FilterFieldDef) {
  return Boolean(field.optionSource && SEARCHABLE_SOURCES.has(field.optionSource))
}

export function portsForRegions<T extends { portCode: string; regionCode: string }>(
  regionCodes: string[],
  ports: T[],
) {
  if (!regionCodes.length) return ports.map((port) => port.portCode)
  const selected = new Set(regionCodes)
  return ports.filter((port) => selected.has(port.regionCode)).map((port) => port.portCode)
}

export function retainPointCodes(
  regionCodes: string[],
  pointCodes: string[],
  ports: { portCode: string; regionCode: string }[],
) {
  const allowed = new Set(portsForRegions(regionCodes, ports))
  return pointCodes.filter((code) => allowed.has(code))
}

export function emptyFilterState(kind: FilterControlKind, on = true): FilterState {
  return { text: '', from: '', to: '', values: [], on }
}

export function allPlaceholder(label: string) {
  return `All ${label}`
}

function defFromColumn(column: SearchColumn): FilterFieldDef {
  const label = columnHeaderLabel(column)
  const optionSource = MULTI_FIELDS[column.id]
  if (optionSource) return { id: column.id, label, kind: 'multi', optionSource }
  if (column.kind === 'datetime') return { id: column.id, label, kind: 'datetime' }
  return { id: column.id, label, kind: 'text' }
}

export function filterFieldCatalog(): FilterFieldDef[] {
  const columnDefs = groupColumnOrder(SEARCH_COLUMNS.map((column) => column.id))
    .map((id) => SEARCH_COLUMNS.find((column) => column.id === id))
    .filter((column): column is SearchColumn => Boolean(column))
    .map(defFromColumn)
  const byId = new Map<string, FilterFieldDef>()
  for (const field of [...EXTRA_FIELDS, ...columnDefs]) byId.set(field.id, field)
  const ordered: FilterFieldDef[] = []
  for (const id of DEFAULT_VISIBLE_FILTERS) {
    const field = byId.get(id)
    if (field) {
      ordered.push(field)
      byId.delete(id)
    }
  }
  for (const field of columnDefs) {
    const next = byId.get(field.id)
    if (next) {
      ordered.push(next)
      byId.delete(next.id)
    }
  }
  for (const field of byId.values()) ordered.push(field)
  return ordered
}

const CATALOG = filterFieldCatalog()
const CATALOG_BY_ID = new Map(CATALOG.map((field) => [field.id, field]))

export function filterFieldById(id: string) {
  return CATALOG_BY_ID.get(id)
}

export function filterFields() {
  return CATALOG
}

export function copyFilterState(state: FilterState): FilterState {
  return { text: state.text, from: state.from, to: state.to, values: [...state.values], on: state.on }
}

export function copyFilterSession(session: Record<string, FilterState>): Record<string, FilterState> {
  return Object.fromEntries(
    Object.entries(session).map(([id, state]) => [id, copyFilterState(state)]),
  )
}

export function emptyFilterSession(ids: readonly string[]): Record<string, FilterState> {
  return Object.fromEntries(
    ids.flatMap((id) => {
      const field = CATALOG_BY_ID.get(id)
      return field ? [[id, emptyFilterState(field.kind)] as const] : []
    }),
  )
}

export function defaultFilterState(field: FilterFieldDef): FilterState {
  if (field.id === 'laraEtb') {
    const time = defaultTimeWindow()
    return { ...emptyFilterState('datetime'), from: time.from, to: time.to }
  }
  return emptyFilterState(field.kind)
}

export function defaultFilterPrefs(): FilterPref[] {
  const visible = new Set<string>(DEFAULT_VISIBLE_FILTERS)
  return CATALOG.map((field) => ({
    id: field.id,
    visible: visible.has(field.id),
    default: defaultFilterState(field),
  }))
}

function nextSettingId() {
  return `ls-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function createListSetting(
  name: string,
  source?: Partial<ListSetting>,
): ListSetting {
  return {
    id: source?.id ?? nextSettingId(),
    name,
    filters: normalizeFilterPrefs(source?.filters ?? defaultFilterPrefs()),
    columns: {
      order: [...(source?.columns?.order ?? defaultColumnPrefs().order)],
      hidden: [...(source?.columns?.hidden ?? [])],
    },
    sort: (source?.sort ?? DEFAULT_SORT).map((rule) => ({ ...rule })),
  }
}

export function copyListSetting(setting: ListSetting): ListSetting {
  return {
    id: setting.id,
    name: setting.name,
    filters: setting.filters.map((pref) => ({
      id: pref.id,
      visible: pref.visible,
      default: copyFilterState(pref.default),
    })),
    columns: { order: [...setting.columns.order], hidden: [...setting.columns.hidden] },
    sort: setting.sort.map((rule) => ({ ...rule })),
  }
}

export function cloneListSetting(setting: ListSetting, name: string): ListSetting {
  return createListSetting(name, {
    filters: setting.filters.map((pref) => ({
      id: pref.id,
      visible: pref.visible,
      default: copyFilterState(pref.default),
    })),
    columns: { order: [...setting.columns.order], hidden: [...setting.columns.hidden] },
    sort: setting.sort.map((rule) => ({ ...rule })),
  })
}

export function normalizeFilterPrefs(prefs: FilterPref[]): FilterPref[] {
  const byId = new Map(prefs.map((pref) => [pref.id, pref]))
  const ordered: FilterPref[] = []
  const seen = new Set<string>()
  for (const pref of prefs) {
    const field = CATALOG_BY_ID.get(pref.id)
    if (!field || seen.has(pref.id)) continue
    seen.add(pref.id)
    ordered.push({
      id: pref.id,
      visible: pref.visible,
      default: { ...emptyFilterState(field.kind), ...pref.default, values: [...(pref.default.values ?? [])] },
    })
  }
  for (const field of CATALOG) {
    if (seen.has(field.id)) continue
    const existing = byId.get(field.id)
    ordered.push(
      existing
        ? {
            id: field.id,
            visible: existing.visible,
            default: { ...emptyFilterState(field.kind), ...existing.default, values: [...(existing.default.values ?? [])] },
          }
        : { id: field.id, visible: false, default: defaultFilterState(field) },
    )
  }
  return ordered
}

export function sessionFromSetting(setting: ListSetting): Record<string, FilterState> {
  return Object.fromEntries(setting.filters.map((pref) => [pref.id, copyFilterState(pref.default)]))
}

export function visibleFilterPrefs(setting: ListSetting) {
  return setting.filters.filter((pref) => pref.visible && CATALOG_BY_ID.has(pref.id))
}

export function isFilterFilled(field: FilterFieldDef, state: FilterState | undefined) {
  if (!state) return false
  if (field.kind === 'text') return Boolean(state.text.trim())
  if (field.kind === 'datetime') return Boolean(state.from || state.to)
  if (field.kind === 'multi') return state.values.length > 0
  return false
}

function localDay(date: string, endOfDay: boolean) {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return Number.NaN
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime()
}

function inDateRange(raw: string | number, from: string, to: string) {
  if (!from && !to) return true
  const text = String(raw ?? '')
  if (!text) return false
  const value = new Date(text).getTime()
  if (!Number.isFinite(value)) return false
  const start = from ? localDay(from, false) : Number.NEGATIVE_INFINITY
  const end = to ? localDay(to, true) : Number.POSITIVE_INFINITY
  if (Number.isNaN(start) || Number.isNaN(end)) return false
  return value >= start && value <= end
}

export function vesselMatchesFilters(vessel: VesselRecord, session: Record<string, FilterState>) {
  for (const field of CATALOG) {
    const state = session[field.id] ?? emptyFilterState(field.kind)
    if (!filterMatches(vessel, field, state)) return false
  }
  return true
}

function filterMatches(vessel: VesselRecord, field: FilterFieldDef, state: FilterState) {
  if (field.id === 'region') {
    if (!state.values.length) return true
    return state.values.includes(vessel.region)
  }
  if (field.kind === 'datetime') {
    return inDateRange(searchSortValue(vessel, field.id), state.from, state.to)
  }
  if (field.kind === 'multi') {
    if (!state.values.length) return true
    if (field.id === 'voyageStatus') {
      const omitted = vessel.omit || vessel.voyageStatus === 'Omit'
      return state.values.some((value) => {
        if (value === 'Omit' || value === 'omit') return omitted
        return !omitted && (value === vessel.voyageStatus || value === searchCellText(vessel, field.id))
      })
    }
    const raw = String(searchSortValue(vessel, field.id) ?? '')
    const text = searchCellText(vessel, field.id)
    if (field.id === 'mappingStatus') {
      return state.values.includes(vessel.matchingStatus)
        || state.values.includes(matchingStatusLabel(vessel.matchingStatus, vessel.sharedTerminal))
        || state.values.includes(text)
    }
    return state.values.includes(raw) || state.values.includes(text)
  }
  const query = state.text.trim().toLowerCase()
  if (!query) return true
  const text = searchCellText(vessel, field.id)
  if (!text || text === '—') return false
  return text.toLowerCase().includes(query)
}

export function staticFilterOptions(source: FilterOptionSource | undefined): string[] {
  switch (source) {
    case 'mappingStatus':
      return [...MAPPING_STATUSES.map((status) => matchingStatusLabel(status)), 'Multiple LARA records']
        .filter((status, index, list) => list.indexOf(status) === index)
    case 'voyageStatus':
      return [...LARA_VOYAGE_STATUSES]
    case 'vesselType':
      return [...LARA_VESSEL_TYPES]
    case 'brand':
      return [...LARA_BRANDS]
    case 'tmlVslStatus':
      return TERMINAL_STATUSES
    default:
      return []
  }
}

const SETTINGS_KEY = 'vsp-list-settings-v1'
const FILTER_KEY = 'vsp-schedule-filters'
const TIME_KEY = 'vsp-schedule-time'
const COLUMN_KEY = 'vsp-schedule-columns-v10'
const SORT_KEY = 'vsp-schedule-sort'

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function hasLegacyPrefs() {
  return Boolean(
    localStorage.getItem(FILTER_KEY)
    || localStorage.getItem(TIME_KEY)
    || localStorage.getItem(COLUMN_KEY)
    || localStorage.getItem(SORT_KEY),
  )
}

function settingFromLegacy(): ListSetting {
  const setting = createListSetting('Default')
  const legacy = loadFilters()
  const time = loadTime()
  const columns = loadColumns()
  const sort = loadSort()
  const defaults = Object.fromEntries(setting.filters.map((pref) => [pref.id, pref]))
  const assign = (id: string, patch: Partial<FilterState>) => {
    const pref = defaults[id]
    if (!pref) return
    pref.default = { ...pref.default, ...patch }
  }
  assign('region', { values: [...legacy.regions] })
  assign('pointCode', { values: [...legacy.ports] })
  assign('vesselName', { text: legacy.vesselNames })
  assign('laraVoyage', { text: legacy.voyage })
  assign('service', { text: legacy.service })
  assign('laraEtb', { from: time.from, to: time.to })
  setting.columns = columns
  setting.sort = sort
  return setting
}

function promoteMappingStatus(filters: FilterPref[]): FilterPref[] {
  const mapping = filters.find((pref) => pref.id === 'mappingStatus')
  if (!mapping) return filters
  mapping.visible = true
  const rest = filters.filter((pref) => pref.id !== 'mappingStatus')
  const serviceAt = rest.findIndex((pref) => pref.id === 'service')
  rest.splice(serviceAt === -1 ? rest.length : serviceAt + 1, 0, mapping)
  return rest
}

export function loadUserSettings(username: string): UserListSettings {
  const all = readJson<Record<string, UserListSettings>>(SETTINGS_KEY) ?? {}
  const saved = all[username]
  if (saved?.items?.length) {
    let items = saved.items.map((item) =>
      createListSetting(item.name, { ...item, id: item.id }),
    )
    const catalogRev = saved.catalogRev ?? 1
    if (catalogRev < CATALOG_REV) {
      items = items.map((item) => ({ ...item, filters: promoteMappingStatus(item.filters) }))
    }
    const activeId = items.some((item) => item.id === saved.activeId) ? saved.activeId : items[0]!.id
    const next = { activeId, items, catalogRev: CATALOG_REV }
    if (catalogRev < CATALOG_REV) persistUserSettings(username, next)
    return next
  }
  const first = hasLegacyPrefs() ? settingFromLegacy() : createListSetting('Default')
  const next = { activeId: first.id, items: [first], catalogRev: CATALOG_REV }
  persistUserSettings(username, next)
  return next
}

export function persistUserSettings(username: string, data: UserListSettings) {
  const all = readJson<Record<string, UserListSettings>>(SETTINGS_KEY) ?? {}
  all[username] = {
    activeId: data.activeId,
    items: data.items,
    catalogRev: data.catalogRev ?? all[username]?.catalogRev ?? CATALOG_REV,
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(all))
}

export function timeWindowOf(session: Record<string, FilterState>): TimeWindow {
  const etb = session.laraEtb
  return { from: etb?.from ?? '', to: etb?.to ?? '' }
}

export function displayFilterValues(
  field: FilterFieldDef,
  values: string[],
  labelOf: (id: string, value: string) => string,
) {
  return values.map((value) => labelOf(field.id, value))
}

export function persistFilterValues(
  field: FilterFieldDef,
  displayed: string[],
  valueOf: (id: string, label: string) => string,
) {
  return displayed.map((label) => valueOf(field.id, label))
}
