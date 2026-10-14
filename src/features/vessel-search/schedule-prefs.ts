import { SEARCH_COLUMNS } from '@/features/vessel-search/search-columns'

export type OmitMode = 'show' | 'hide'

export type ScheduleFilters = {
  regions: string[]
  ports: string[]
  vesselNames: string
  voyage: string
  service: string
  omit: OmitMode
}

export type TimeWindow = {
  from: string
  to: string
}

export type SortRule = { id: string; desc: boolean }

export type ColumnPrefs = {
  order: string[]
  hidden: string[]
}

const FILTER_KEY = 'vsp-schedule-filters'
const TIME_KEY = 'vsp-schedule-time'
/** Bump when default column order / groups change so saved prefs pick up the new layout. */
const COLUMN_KEY = 'vsp-schedule-columns-v10'
const SORT_KEY = 'vsp-schedule-sort'

export const DEFAULT_SORT: SortRule[] = [{ id: 'laraEtb', desc: true }]

export function emptyFilters(): ScheduleFilters {
  return {
    regions: [],
    ports: [],
    vesselNames: '',
    voyage: '',
    service: '',
    omit: 'show',
  }
}

export function defaultColumnPrefs(): ColumnPrefs {
  return { order: SEARCH_COLUMNS.map((column) => column.id), hidden: [] }
}

export function defaultTimeWindow(): TimeWindow {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return span(today, -7, 7)
}

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadFilters(): ScheduleFilters {
  const saved = readJson<Partial<ScheduleFilters> & { coverage?: unknown }>(FILTER_KEY)
  return {
    ...emptyFilters(),
    vesselNames: saved?.vesselNames ?? '',
    voyage: saved?.voyage ?? '',
    service: saved?.service ?? '',
    omit: saved?.omit === 'hide' ? 'hide' : 'show',
    regions: Array.isArray(saved?.regions) ? saved.regions.filter((region) => typeof region === 'string') : [],
    ports: saved?.ports ?? [],
  }
}

export function saveFilters(filters: ScheduleFilters) {
  localStorage.setItem(FILTER_KEY, JSON.stringify(filters))
}

export function loadTime(): TimeWindow {
  const saved = readJson<Record<string, Partial<TimeWindow>>>(TIME_KEY)
  const entry = saved?.post_sailing ?? Object.values(saved ?? {})[0]
  if (entry?.from && entry.to) return { from: entry.from, to: entry.to }
  return defaultTimeWindow()
}

export function loadColumns(): ColumnPrefs {
  const saved = readJson<ColumnPrefs>(COLUMN_KEY)
  const defaults = defaultColumnPrefs()
  if (!saved) return defaults
  const known = new Set(defaults.order)
  const order = saved.order.filter((id) => known.has(id))
  for (const id of defaults.order) {
    if (!order.includes(id)) order.push(id)
  }
  const hidden = saved.hidden.filter((id) => id !== 'vesselName' && known.has(id))
  return { order, hidden }
}

export function saveColumns(columns: ColumnPrefs) {
  localStorage.setItem(
    COLUMN_KEY,
    JSON.stringify({
      order: columns.order,
      hidden: columns.hidden.filter((id) => id !== 'vesselName'),
    }),
  )
}

export function loadSort(): SortRule[] {
  const saved = readJson<SortRule[]>(SORT_KEY)
  if (!saved?.length) return DEFAULT_SORT.map((rule) => ({ ...rule }))
  const known = new Set(SEARCH_COLUMNS.map((column) => column.id))
  const rules = saved.filter((rule) => known.has(rule.id))
  return rules.length ? rules : DEFAULT_SORT.map((rule) => ({ ...rule }))
}

export function saveSort(rules: SortRule[]) {
  localStorage.setItem(SORT_KEY, JSON.stringify(rules))
}

function iso(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function span(today: Date, fromOffset: number, toOffset: number): TimeWindow {
  const from = new Date(today)
  const to = new Date(today)
  from.setDate(from.getDate() + fromOffset)
  to.setDate(to.getDate() + toOffset)
  return { from: iso(from), to: iso(to) }
}
