import { LOCKED_COLUMN_ID, SEARCH_COLUMNS } from '@/features/vessel-search/search-columns'

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
  /** Column id of the left-freeze boundary, or null when nothing is frozen. */
  freezeThrough: string | null
}

const FILTER_KEY = 'vsp-schedule-filters'
const TIME_KEY = 'vsp-schedule-time'
/** Bump when default column order / groups change so saved prefs pick up the new layout. */
const COLUMN_KEY = 'vsp-schedule-columns-v12'
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

/** Columns a user turns on from list settings. Hidden until that choice is saved. */
const OPT_IN_COLUMNS: string[] = []

export function defaultColumnPrefs(): ColumnPrefs {
  return { order: SEARCH_COLUMNS.map((column) => column.id), hidden: [...OPT_IN_COLUMNS], freezeThrough: null }
}

export function hideUnseenOptIn(savedOrder: readonly string[] | undefined, hidden: string[]) {
  if (!savedOrder) return hidden
  for (const id of OPT_IN_COLUMNS) {
    if (!savedOrder.includes(id) && !hidden.includes(id)) hidden.push(id)
  }
  return hidden
}

/** Keep a saved boundary only when that column still exists in the current order. */
export function normalizeFreezeThrough(order: readonly string[], id: unknown): string | null {
  return typeof id === 'string' && order.includes(id) ? id : null
}

/** Drop a new column in front of a neighbor when a saved order never mentioned it. */
export function placeNewColumn(order: string[], id: string, beforeId: string, alreadyPresent: boolean) {
  if (alreadyPresent) return
  const from = order.indexOf(id)
  const anchor = order.indexOf(beforeId)
  if (from === -1 || anchor === -1 || from === anchor - 1) return
  order.splice(from, 1)
  order.splice(order.indexOf(beforeId), 0, id)
}

/** Columns restored to the catalog. A one-time layout pass seats them with their neighbors. */
const RESTORED_COLUMN_IDS = new Set([
  'laraEta',
  'vesselNameEn',
  'shipCode',
  'shipName',
  'lineCode',
  'tmlEta',
  'tmlAta',
  'agentCode',
  'agentName',
  'portCloseDate',
  'customsCloseDate',
  'portsEn',
  'portsCn',
  'terminalUpdateTime',
])

function moveColumn(order: string[], id: string, to: number) {
  const from = order.indexOf(id)
  if (from === -1 || from === to) return
  order.splice(from, 1)
  order.splice(from < to ? to - 1 : to, 0, id)
}

/** Seat restored columns next to the catalog neighbor that was already on the layout. */
export function placeRestoredColumns(order: string[]) {
  for (const id of RESTORED_COLUMN_IDS) {
    const index = SEARCH_COLUMNS.findIndex((column) => column.id === id)
    if (index === -1 || !order.includes(id)) continue
    const next = SEARCH_COLUMNS.slice(index + 1).find((column) => !RESTORED_COLUMN_IDS.has(column.id) && order.includes(column.id))
    if (next) {
      moveColumn(order, id, order.indexOf(next.id))
      continue
    }
    const previous = [...SEARCH_COLUMNS.slice(0, index)].reverse().find((column) => order.includes(column.id))
    if (previous) moveColumn(order, id, order.indexOf(previous.id) + 1)
  }
}

/** Keep columns a saved layout never stored beside the next catalog column that it did store. */
export function placeMissingColumns(order: string[], savedOrder: readonly string[]) {
  const saved = new Set(savedOrder)
  SEARCH_COLUMNS.forEach((column, index) => {
    if (saved.has(column.id)) return
    const from = order.indexOf(column.id)
    if (from === -1) return
    const anchor = SEARCH_COLUMNS.slice(index + 1).find((item) => saved.has(item.id) && order.includes(item.id))
    if (!anchor) return
    const anchorAt = order.indexOf(anchor.id)
    if (from === anchorAt - 1) return
    order.splice(from, 1)
    order.splice(order.indexOf(anchor.id), 0, column.id)
  })
}

/** Visible columns from the left through the freeze boundary, inclusive. */
export function frozenColumnIds(columns: Pick<ColumnPrefs, 'order' | 'hidden' | 'freezeThrough'>): string[] {
  const boundary = normalizeFreezeThrough(columns.order, columns.freezeThrough)
  if (!boundary) return []
  const end = columns.order.indexOf(boundary)
  const hidden = new Set(columns.hidden)
  return columns.order.slice(0, end + 1).filter((id) => id === LOCKED_COLUMN_ID || !hidden.has(id))
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
  const saved = readJson<Partial<ColumnPrefs>>(COLUMN_KEY)
  const defaults = defaultColumnPrefs()
  if (!saved?.order) return defaults
  const known = new Set(defaults.order)
  const order = saved.order.filter((id) => known.has(id))
  for (const id of defaults.order) {
    if (!order.includes(id)) order.push(id)
  }
  placeMissingColumns(order, saved.order)
  placeRestoredColumns(order)
  const hidden = hideUnseenOptIn(
    saved.order,
    (saved.hidden ?? []).filter((id) => id !== LOCKED_COLUMN_ID && known.has(id)),
  )
  return { order, hidden, freezeThrough: normalizeFreezeThrough(order, saved.freezeThrough) }
}

export function saveColumns(columns: ColumnPrefs) {
  localStorage.setItem(
    COLUMN_KEY,
    JSON.stringify({
      order: columns.order,
      hidden: columns.hidden.filter((id) => id !== LOCKED_COLUMN_ID),
      freezeThrough: normalizeFreezeThrough(columns.order, columns.freezeThrough),
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
