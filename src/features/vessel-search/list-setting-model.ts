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
  loadColumns,
  loadFilters,
  loadSort,
  loadTime,
  normalizeFreezeThrough,
  type ColumnPrefs,
  type SortRule,
  type TimeWindow,
} from '@/features/vessel-search/schedule-prefs'

export type FilterControlKind = 'text' | 'datetime' | 'multi' | 'lines'

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

export type DateDefaultMode = 'fixed' | 'relative'

export type FilterState = {
  text: string
  from: string
  to: string
  values: string[]
  on: boolean
  dateMode: DateDefaultMode
  fromDays: number | null
  toDays: number | null
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

const CATALOG_REV = 3

const LINE_FIELDS = new Set([
  'vesselName',
  'laraVoyage',
  'vesselNameEn',
  'vesselNameCn',
  'shipName',
  'localVoyageExport',
  'localVoyageImport',
])

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
  'ETD gap > 5 days',
  'No external voyage',
  'No terminal record',
  'Pending match',
]

const TERMINAL_STATUSES = ['计划', '在港', '离港']

const EXTRA_FIELDS: FilterFieldDef[] = [
  { id: 'region', label: 'LARA Region', kind: 'multi', optionSource: 'region' },
]

const SEARCHABLE_SOURCES = new Set<FilterOptionSource>(['pointCode', 'terminal9code', 'terminalName'])

export function filterIsSearchable(field: FilterFieldDef) {
  return Boolean(field.optionSource && SEARCHABLE_SOURCES.has(field.optionSource))
}

export function parseLineList(raw: string): string[] {
  const seen = new Set<string>()
  const values: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    values.push(value)
  }
  return values
}

export function lineListSummary(values: readonly string[], placeholder: string) {
  if (!values.length) return placeholder
  if (values.length <= 2) return values.join(', ')
  return `${values[0]} +${values.length - 1}`
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
  return { text: '', from: '', to: '', values: [], on, dateMode: 'fixed', fromDays: null, toDays: null }
}

function startOfDay(today = new Date()) {
  const date = new Date(today)
  date.setHours(0, 0, 0, 0)
  return date
}

function isoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function shiftIsoDate(today: Date, dayOffset: number) {
  const date = startOfDay(today)
  date.setDate(date.getDate() + dayOffset)
  return isoDate(date)
}

export function normalizeDayOffset(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const days = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(days)) return null
  return Math.max(0, Math.trunc(days))
}

export function relativeDateLabel(fromDays: number | null, toDays: number | null, today = new Date()) {
  const from = fromDays == null ? '' : shiftIsoDate(today, -fromDays)
  const to = toDays == null ? '' : shiftIsoDate(today, toDays)
  if (from && to) return `${from} – ${to}`
  if (from) return `From ${from}`
  if (to) return `Through ${to}`
  return 'No date limit'
}

export function resolveFilterDefault(field: FilterFieldDef, state: FilterState, today = new Date()): FilterState {
  const copy = copyFilterState(state)
  if (field.kind !== 'datetime' || state.dateMode !== 'relative') {
    return { ...copy, dateMode: 'fixed', fromDays: null, toDays: null }
  }
  return {
    ...copy,
    dateMode: 'fixed',
    fromDays: null,
    toDays: null,
    from: state.fromDays == null ? '' : shiftIsoDate(today, -state.fromDays),
    to: state.toDays == null ? '' : shiftIsoDate(today, state.toDays),
  }
}

function normalizeStoredFilter(field: FilterFieldDef, raw: Partial<FilterState> | undefined): FilterState {
  const source = raw ?? {}
  const base = emptyFilterState(field.kind, source.on ?? true)
  base.text = field.kind === 'multi' || field.kind === 'lines' ? '' : (source.text ?? '')
  base.from = source.from ?? ''
  base.to = source.to ?? ''
  base.values = field.kind === 'lines'
    ? parseLineList((source.values ?? []).join('\n'))
    : [...(source.values ?? [])]
  if (field.kind !== 'datetime' || source.dateMode !== 'relative') return base
  return {
    ...base,
    dateMode: 'relative',
    fromDays: normalizeDayOffset(source.fromDays),
    toDays: normalizeDayOffset(source.toDays),
  }
}

export function allPlaceholder(label: string) {
  return `All ${label}`
}

function defFromColumn(column: SearchColumn): FilterFieldDef {
  const label = columnHeaderLabel(column)
  if (LINE_FIELDS.has(column.id)) return { id: column.id, label, kind: 'lines' }
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
  return {
    text: state.text,
    from: state.from,
    to: state.to,
    values: [...state.values],
    on: state.on,
    dateMode: state.dateMode === 'relative' ? 'relative' : 'fixed',
    fromDays: state.fromDays ?? null,
    toDays: state.toDays ?? null,
  }
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
    return { ...emptyFilterState('datetime'), dateMode: 'relative', fromDays: 7, toDays: 7 }
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
  const defaults = defaultColumnPrefs()
  const known = new Set(defaults.order)
  const order = (source?.columns?.order ?? defaults.order).filter((id) => known.has(id))
  for (const id of defaults.order) {
    if (!order.includes(id)) order.push(id)
  }
  const sort = (source?.sort ?? DEFAULT_SORT)
    .filter((rule) => known.has(rule.id))
    .map((rule) => ({ ...rule }))
  return {
    id: source?.id ?? nextSettingId(),
    name,
    filters: normalizeFilterPrefs(source?.filters ?? defaultFilterPrefs()),
    columns: {
      order,
      hidden: (source?.columns?.hidden ?? []).filter((id) => known.has(id) && id !== 'vesselName'),
      freezeThrough: normalizeFreezeThrough(order, source?.columns?.freezeThrough),
    },
    sort: sort.length ? sort : DEFAULT_SORT.map((rule) => ({ ...rule })),
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
    columns: {
      order: [...setting.columns.order],
      hidden: [...setting.columns.hidden],
      freezeThrough: setting.columns.freezeThrough ?? null,
    },
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
    columns: {
      order: [...setting.columns.order],
      hidden: [...setting.columns.hidden],
      freezeThrough: setting.columns.freezeThrough ?? null,
    },
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
      default: normalizeStoredFilter(field, pref.default),
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
            default: normalizeStoredFilter(field, existing.default),
          }
        : { id: field.id, visible: false, default: defaultFilterState(field) },
    )
  }
  return ordered
}

export function sessionFromSetting(setting: ListSetting, today = new Date()): Record<string, FilterState> {
  return Object.fromEntries(
    setting.filters.map((pref) => {
      const field = CATALOG_BY_ID.get(pref.id)
      const state = field ? resolveFilterDefault(field, pref.default, today) : copyFilterState(pref.default)
      return [pref.id, state]
    }),
  )
}

export function visibleFilterPrefs(setting: ListSetting) {
  return setting.filters.filter((pref) => pref.visible && CATALOG_BY_ID.has(pref.id))
}

export function isFilterFilled(field: FilterFieldDef, state: FilterState | undefined) {
  if (!state) return false
  if (field.kind === 'text') return Boolean(state.text.trim())
  if (field.kind === 'datetime') return Boolean(state.from || state.to)
  if (field.kind === 'multi' || field.kind === 'lines') return state.values.length > 0
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
  if (vessel.recordStatus === 'Inactive') return false
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
  if (field.kind === 'lines') {
    if (!state.values.length) return true
    const raw = String(searchSortValue(vessel, field.id) ?? '').trim().toLowerCase()
    if (!raw) return false
    return state.values.some((value) => value.trim().toLowerCase() === raw)
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
  assign('laraEtb', { dateMode: 'fixed', from: time.from, to: time.to, fromDays: null, toDays: null })
  setting.columns = columns
  setting.sort = sort
  return setting
}

function clearSavedLineLists(filters: FilterPref[]): FilterPref[] {
  return filters.map((pref) => {
    if (!LINE_FIELDS.has(pref.id)) return pref
    return { ...pref, default: { ...pref.default, text: '', values: [] } }
  })
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
      items = items.map((item) => ({
        ...item,
        filters: clearSavedLineLists(catalogRev < 2 ? promoteMappingStatus(item.filters) : item.filters),
      }))
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
