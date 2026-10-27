import {
  LARA_FIELDS,
  MATCH_FIELD,
  TERMINAL_FIELDS,
  emptyLaraSnapshot,
  emptyTerminalSnapshot,
  laraValue,
  pickLara,
  pickTerminal,
  sameTerminal,
  terminalValue,
  type LaraField,
  type TerminalField,
} from '@/domain/schedule-model/snapshot'
import { nextId, parseTime } from '@/domain/schedule-model/state'
import type {
  FieldDecision,
  LaraPayload,
  LaraSnapshot,
  LaraVersion,
  Match,
  MatchMethod,
  ScheduleState,
  TerminalPayload,
  TerminalSnapshot,
  TerminalVersion,
  VesselSchedule,
} from '@/domain/schedule-model/types'

export type ReviewStatus = 'applied' | 'pending'

export type FieldReview = {
  side: 'LARA' | 'TERMINAL' | 'MATCH'
  field: string
  previousValue: string
  incomingValue: string
  status: ReviewStatus
  payloadId: string
}

export type TerminalShape = 'many' | 'none'

export type ScheduleReview = {
  scheduleId: string
  pending: boolean
  changed: boolean
  fields: FieldReview[]
  /** Set when an already matched schedule's latest sync is no longer one record. */
  shape: TerminalShape | null
  candidateCount: number
  queryId: string | null
}

export type SyncPolicy = {
  /** Keys from `watchKey`. A changed field waits only when it is in this set and the user edited it. */
  watched: ReadonlySet<string>
  /** Day thresholds for watched date fields. Missing or 0 means any difference counts. */
  dayThreshold: Readonly<Record<string, number>>
}

export const TERMINAL_SHAPE = 'terminalShape'

const DATE_KEYS = new Set([
  'LARA:laraEta',
  'LARA:laraEtb',
  'LARA:laraEtd',
  'LARA:cutoff',
  'TERMINAL:eta',
  'TERMINAL:ata',
  'TERMINAL:etb',
  'TERMINAL:atb',
  'TERMINAL:etd',
  'TERMINAL:atd',
  'TERMINAL:cyOpen',
  'TERMINAL:cyCutoff',
  'TERMINAL:updateTime',
])

const DEFAULT_WATCHED = new Set([
  'LARA:laraEtb',
  'LARA:laraEtd',
  'TERMINAL:etb',
  'TERMINAL:etd',
  'TERMINAL:atb',
  'TERMINAL:atd',
  'TERMINAL:exportVoyage',
  'TERMINAL:importVoyage',
  'MATCH:match',
])

export function watchKey(side: 'LARA' | 'TERMINAL' | 'MATCH', field: string) {
  return `${side}:${field}`
}

export function defaultSyncPolicy(): SyncPolicy {
  return { watched: DEFAULT_WATCHED, dayThreshold: {} }
}

function dayDistance(left: string, right: string) {
  const start = parseTime(left)
  const end = parseTime(right)
  if (start == null || end == null) return null
  const day = 24 * 60 * 60 * 1000
  return Math.abs(Math.floor(start / day) - Math.floor(end / day))
}

function countsAsChange(key: string, previous: string, incoming: string, policy: SyncPolicy) {
  if (previous === incoming) return false
  if (!policy.watched.has(key)) return true
  const threshold = policy.dayThreshold[key] ?? 0
  if (threshold <= 0 || !DATE_KEYS.has(key)) return true
  const days = dayDistance(previous, incoming)
  if (days == null) return true
  return days > threshold
}

function emptyReview(scheduleId: string): ScheduleReview {
  return { scheduleId, pending: false, changed: false, fields: [], shape: null, candidateCount: 0, queryId: null }
}

export type FieldHistoryRow = {
  seq: number
  previousValue: string
  nextValue: string
  source: 'SYNC' | 'USER'
  reason: string
  updatedBy: string
  updatedAt: string
}

export function laraVersion(state: ScheduleState, id: string | null | undefined) {
  if (!id) return undefined
  return state.laraVersions.find((version) => version.id === id)
}

export function terminalVersion(state: ScheduleState, id: string | null | undefined) {
  if (!id) return undefined
  return state.terminalVersions.find((version) => version.id === id)
}

export function matchOf(state: ScheduleState, schedule: VesselSchedule) {
  if (!schedule.matchId) return undefined
  return state.matches.find((match) => match.id === schedule.matchId)
}

export function currentTerminal(state: ScheduleState, schedule: VesselSchedule) {
  const match = matchOf(state, schedule)
  return terminalVersion(state, match?.terminalVersionId)
}

function laraVersionsOf(state: ScheduleState, scheduleId: string) {
  return state.laraVersions.filter((version) => version.scheduleId === scheduleId).sort((a, b) => a.seq - b.seq)
}

function terminalVersionsOf(state: ScheduleState, scheduleId: string) {
  return state.terminalVersions.filter((version) => version.scheduleId === scheduleId).sort((a, b) => a.seq - b.seq)
}

function heldLaraFields(state: ScheduleState, schedule: VesselSchedule) {
  const current = laraVersion(state, schedule.laraVersionId)
  const held = new Set<LaraField>()
  if (!current || current.source === 'SYNC') return held
  const prior = [...laraVersionsOf(state, schedule.id)].reverse().find((version) => version.source === 'SYNC' && version.seq < current.seq)
  const base = prior ?? emptyLaraSnapshot()
  for (const field of LARA_FIELDS) {
    if (laraValue(current, field) !== laraValue(base, field)) held.add(field)
  }
  return held
}

function heldTerminalFields(state: ScheduleState, schedule: VesselSchedule) {
  const current = currentTerminal(state, schedule)
  const held = new Set<TerminalField>()
  if (!current || current.source === 'SYNC') return held
  const prior = [...terminalVersionsOf(state, schedule.id)].reverse().find((version) => version.source === 'SYNC' && version.seq < current.seq)
  const base = prior ?? emptyTerminalSnapshot()
  for (const field of TERMINAL_FIELDS) {
    if (terminalValue(current, field) !== terminalValue(base, field)) held.add(field)
  }
  return held
}

function laraPayload(state: ScheduleState, id: string) {
  return state.laraPayloads.find((payload) => payload.id === id)
}

function terminalPayload(state: ScheduleState, id: string) {
  return state.terminalPayloads.find((payload) => payload.id === id)
}

function laraDecided(state: ScheduleState, scheduleId: string, field: string, incoming: string) {
  return state.fieldDecisions.some((decision) => {
    if (decision.scheduleId !== scheduleId || decision.side !== 'LARA' || decision.field !== field) return false
    const payload = laraPayload(state, decision.payloadId)
    return Boolean(payload && laraValue(payload, field as LaraField) === incoming)
  })
}

function terminalDecided(state: ScheduleState, scheduleId: string, field: string, incoming: string) {
  return state.fieldDecisions.some((decision) => {
    if (decision.scheduleId !== scheduleId || decision.side !== 'TERMINAL' || decision.field !== field) return false
    const payload = terminalPayload(state, decision.payloadId)
    return Boolean(payload && terminalValue(payload, field as TerminalField) === incoming)
  })
}

function matchDecided(state: ScheduleState, scheduleId: string, incoming: TerminalSnapshot) {
  return state.fieldDecisions.some((decision) => {
    if (decision.scheduleId !== scheduleId || decision.field !== MATCH_FIELD) return false
    const payload = terminalPayload(state, decision.payloadId)
    return Boolean(payload && sameTerminal(payload, incoming))
  })
}

function requireSchedule(state: ScheduleState, scheduleId: string) {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) throw new Error('Vessel schedule was not found')
  return schedule
}

function updateSchedule(state: ScheduleState, scheduleId: string, patch: Partial<VesselSchedule>) {
  return {
    ...state,
    schedules: state.schedules.map((schedule) => (schedule.id === scheduleId ? { ...schedule, ...patch } : schedule)),
  }
}

function appendLaraVersion(
  state: ScheduleState,
  schedule: VesselSchedule,
  input: { snapshot: LaraSnapshot; source: 'SYNC' | 'USER'; payloadId: string | null; reason: string; updatedBy: string; updatedAt: string },
) {
  const seq = laraVersionsOf(state, schedule.id).length + 1
  const issued = nextId(state, 'lara-version')
  const version: LaraVersion = {
    ...pickLara(input.snapshot),
    id: issued.id,
    scheduleId: schedule.id,
    seq,
    source: input.source,
    payloadId: input.payloadId,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  }
  return updateSchedule(
    { ...issued.state, laraVersions: [...issued.state.laraVersions, version] },
    schedule.id,
    { laraVersionId: version.id },
  )
}

function appendTerminalVersion(
  state: ScheduleState,
  schedule: VesselSchedule,
  input: { snapshot: TerminalSnapshot; source: 'SYNC' | 'USER'; payloadId: string | null; reason: string; updatedBy: string; updatedAt: string },
) {
  const seq = terminalVersionsOf(state, schedule.id).length + 1
  const issued = nextId(state, 'terminal-version')
  const version: TerminalVersion = {
    ...pickTerminal(input.snapshot),
    id: issued.id,
    scheduleId: schedule.id,
    seq,
    source: input.source,
    payloadId: input.payloadId,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  }
  return {
    state: { ...issued.state, terminalVersions: [...issued.state.terminalVersions, version] },
    version,
  }
}

export function appendMatch(
  state: ScheduleState,
  input: {
    schedule: VesselSchedule
    terminalVersionId: string | null
    method: MatchMethod
    reason: string
    updatedBy: string
    updatedAt: string
  },
) {
  const lara = laraVersion(state, input.schedule.laraVersionId)
  if (!lara) return state
  const current = matchOf(state, input.schedule)
  if (current && current.terminalVersionId === input.terminalVersionId && current.method === input.method && current.laraVersionId === lara.id) {
    return state
  }
  const seq = state.matches.filter((match) => match.scheduleId === input.schedule.id).length + 1
  const issued = nextId(state, 'match')
  const match: Match = {
    id: issued.id,
    scheduleId: input.schedule.id,
    seq,
    laraVersionId: lara.id,
    terminalVersionId: input.terminalVersionId,
    method: input.method,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  }
  return updateSchedule(
    { ...issued.state, matches: [...issued.state.matches, match] },
    input.schedule.id,
    { matchId: match.id },
  )
}

function appendDecision(
  state: ScheduleState,
  input: Omit<FieldDecision, 'id'>,
) {
  const issued = nextId(state, 'decision')
  const decision: FieldDecision = { ...input, id: issued.id }
  return { ...issued.state, fieldDecisions: [...issued.state.fieldDecisions, decision] }
}

export function applyLaraPayload(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; updatedBy: string; updatedAt: string; policy?: SyncPolicy },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const payload = laraPayload(state, input.payloadId)
  if (!payload || payload.scheduleId !== schedule.id) throw new Error('LARA payload was not found')
  const policy = input.policy ?? defaultSyncPolicy()
  const comparable = hasBoundMatch(state, schedule.id)
  const current = laraVersion(state, schedule.laraVersionId) ?? emptyLaraSnapshot()
  const held = heldLaraFields(state, schedule)
  const auto = isAutoBound(state, schedule) || latestSyncIsAuto(state, schedule.id)
  const adopted: Partial<LaraSnapshot> = {}
  let pending = false
  for (const field of LARA_FIELDS) {
    const incoming = laraValue(payload, field)
    const previous = laraValue(current, field)
    const key = watchKey('LARA', field)
    if (!countsAsChange(key, previous, incoming, policy)) continue
    if (!auto && comparable && policy.watched.has(key) && held.has(field) && !laraDecided(state, schedule.id, field, incoming)) {
      pending = true
      continue
    }
    adopted[field] = incoming as never
  }
  if (!Object.keys(adopted).length) return state
  const snapshot = { ...pickLara(current as LaraSnapshot), ...adopted }
  return appendLaraVersion(state, freshSchedule(state, schedule.id), {
    snapshot,
    source: pending ? 'USER' : 'SYNC',
    payloadId: payload.id,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function applyTerminalPayload(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; updatedBy: string; updatedAt: string; policy?: SyncPolicy; method?: MatchMethod },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const payload = terminalPayload(state, input.payloadId)
  if (!payload || payload.scheduleId !== schedule.id) throw new Error('Terminal payload was not found')
  const policy = input.policy ?? defaultSyncPolicy()
  const match = matchOf(state, schedule)
  const current = currentTerminal(state, schedule) ?? emptyTerminalSnapshot()
  if (sameTerminal(current, payload) && currentTerminal(state, schedule) && !input.method) return state
  const held = heldTerminalFields(state, schedule)
  const auto = input.method !== 'USER'
  const adopted: Partial<TerminalSnapshot> = {}
  let pending = false
  for (const field of TERMINAL_FIELDS) {
    const incoming = terminalValue(payload, field)
    const previous = terminalValue(current, field)
    const key = watchKey('TERMINAL', field)
    if (!countsAsChange(key, previous, incoming, policy)) continue
    if (!auto && policy.watched.has(key) && held.has(field) && !terminalDecided(state, schedule.id, field, incoming)) {
      pending = true
      continue
    }
    adopted[field] = incoming
  }
  if (!Object.keys(adopted).length && pending) return state
  if (!Object.keys(adopted).length && currentTerminal(state, schedule)) return state
  const snapshot = { ...pickTerminal(current), ...adopted }
  const saved = appendTerminalVersion(state, schedule, {
    snapshot,
    source: pending ? 'USER' : 'SYNC',
    payloadId: payload.id,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  const method = input.method ?? (pending ? (match?.method ?? 'AUTO') : 'AUTO')
  return appendMatch(saved.state, {
    schedule: freshSchedule(saved.state, schedule.id),
    terminalVersionId: saved.version.id,
    method,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function clearAutoMatch(state: ScheduleState, scheduleId: string, at: string, by: string) {
  const schedule = requireSchedule(state, scheduleId)
  const match = matchOf(state, schedule)
  if (!match || match.method === 'USER' || !match.terminalVersionId) return state
  return appendMatch(state, {
    schedule,
    terminalVersionId: null,
    method: 'AUTO',
    reason: '',
    updatedBy: by,
    updatedAt: at,
  })
}

export function hasBoundMatch(state: ScheduleState, scheduleId: string) {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) return false
  const match = matchOf(state, schedule)
  return Boolean(match?.terminalVersionId && (match.method === 'AUTO' || match.method === 'USER'))
}

function shapeDecided(state: ScheduleState, scheduleId: string, queryId: string) {
  return state.fieldDecisions.some(
    (decision) => decision.scheduleId === scheduleId && decision.field === TERMINAL_SHAPE && decision.payloadId === queryId,
  )
}

export function keepTerminalShape(
  state: ScheduleState,
  input: { scheduleId: string; queryId: string; updatedBy: string; updatedAt: string },
) {
  if (shapeDecided(state, input.scheduleId, input.queryId)) return state
  return appendDecision(state, {
    scheduleId: input.scheduleId,
    side: 'TERMINAL',
    payloadId: input.queryId,
    field: TERMINAL_SHAPE,
    action: 'KEEP',
    versionId: null,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function adoptNoTerminal(
  state: ScheduleState,
  input: { scheduleId: string; queryId: string; updatedBy: string; updatedAt: string },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const match = matchOf(state, schedule)
  let next = state
  if (match?.terminalVersionId) {
    next = appendMatch(state, {
      schedule,
      terminalVersionId: null,
      method: 'AUTO',
      reason: '',
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    })
  }
  if (shapeDecided(next, input.scheduleId, input.queryId)) return next
  return appendDecision(next, {
    scheduleId: input.scheduleId,
    side: 'TERMINAL',
    payloadId: input.queryId,
    field: TERMINAL_SHAPE,
    action: 'EDIT',
    versionId: null,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function keepLaraField(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; field: LaraField; updatedBy: string; updatedAt: string },
) {
  return appendDecision(state, {
    scheduleId: input.scheduleId,
    side: 'LARA',
    payloadId: input.payloadId,
    field: input.field,
    action: 'KEEP',
    versionId: null,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function keepTerminalField(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; field: TerminalField; updatedBy: string; updatedAt: string },
) {
  return appendDecision(state, {
    scheduleId: input.scheduleId,
    side: 'TERMINAL',
    payloadId: input.payloadId,
    field: input.field,
    action: 'KEEP',
    versionId: null,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function keepMatch(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; updatedBy: string; updatedAt: string },
) {
  return appendDecision(state, {
    scheduleId: input.scheduleId,
    side: 'TERMINAL',
    payloadId: input.payloadId,
    field: MATCH_FIELD,
    action: 'KEEP',
    versionId: null,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function acceptLaraField(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; field: LaraField; updatedBy: string; updatedAt: string },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const payload = laraPayload(state, input.payloadId)
  const current = laraVersion(state, schedule.laraVersionId)
  if (!payload || !current) return state
  const snapshot = { ...pickLara(current), [input.field]: laraValue(payload, input.field) }
  const done = LARA_FIELDS.every((field) => laraValue(snapshot, field) === laraValue(payload, field))
  return appendLaraVersion(state, schedule, {
    snapshot,
    source: done ? 'SYNC' : 'USER',
    payloadId: payload.id,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function editLaraFields(
  state: ScheduleState,
  input: { scheduleId: string; payloadId?: string; fields: Partial<LaraSnapshot>; reason: string; updatedBy: string; updatedAt: string },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const current = laraVersion(state, schedule.laraVersionId) ?? emptyLaraSnapshot()
  const snapshot = { ...pickLara(current as LaraSnapshot), ...input.fields }
  let next = appendLaraVersion(state, schedule, {
    snapshot,
    source: 'USER',
    payloadId: input.payloadId ?? null,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  const version = laraVersion(next, freshSchedule(next, schedule.id).laraVersionId)
  if (!input.payloadId || !version) return next
  for (const field of LARA_FIELDS) {
    if (input.fields[field] == null) continue
    next = appendDecision(next, {
      scheduleId: schedule.id,
      side: 'LARA',
      payloadId: input.payloadId,
      field,
      action: 'EDIT',
      versionId: version.id,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    })
  }
  return next
}

export function acceptTerminalField(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; field: TerminalField; updatedBy: string; updatedAt: string },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const payload = terminalPayload(state, input.payloadId)
  const current = currentTerminal(state, schedule)
  if (!payload || !current) return state
  const snapshot = { ...pickTerminal(current), [input.field]: terminalValue(payload, input.field) }
  const done = TERMINAL_FIELDS.every((field) => terminalValue(snapshot, field) === terminalValue(payload, field))
  const method = matchOf(state, schedule)?.method ?? 'AUTO'
  const saved = appendTerminalVersion(state, schedule, {
    snapshot,
    source: done ? 'SYNC' : 'USER',
    payloadId: payload.id,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  return appendMatch(saved.state, {
    schedule: freshSchedule(saved.state, schedule.id),
    terminalVersionId: saved.version.id,
    method: done ? 'AUTO' : method,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function acceptTerminalPayload(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; updatedBy: string; updatedAt: string; method?: MatchMethod },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const payload = terminalPayload(state, input.payloadId)
  if (!payload) return state
  const saved = appendTerminalVersion(state, schedule, {
    snapshot: pickTerminal(payload),
    source: 'SYNC',
    payloadId: payload.id,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  let next = appendMatch(saved.state, {
    schedule: freshSchedule(saved.state, schedule.id),
    terminalVersionId: saved.version.id,
    method: input.method ?? 'AUTO',
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  const queryId = payload.queryId
  if (queryId && !shapeDecided(next, schedule.id, queryId)) {
    next = appendDecision(next, {
      scheduleId: schedule.id,
      side: 'TERMINAL',
      payloadId: queryId,
      field: TERMINAL_SHAPE,
      action: 'EDIT',
      versionId: saved.version.id,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    })
  }
  return next
}

export function editTerminalFields(
  state: ScheduleState,
  input: { scheduleId: string; payloadId?: string; fields: Partial<TerminalSnapshot>; reason: string; updatedBy: string; updatedAt: string },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const current = currentTerminal(state, schedule) ?? emptyTerminalSnapshot()
  const snapshot = { ...pickTerminal(current), ...input.fields }
  const saved = appendTerminalVersion(state, schedule, {
    snapshot,
    source: 'USER',
    payloadId: input.payloadId ?? null,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  let next = appendMatch(saved.state, {
    schedule: freshSchedule(saved.state, schedule.id),
    terminalVersionId: saved.version.id,
    method: 'USER',
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  if (!input.payloadId) return next
  for (const field of TERMINAL_FIELDS) {
    if (input.fields[field] == null) continue
    next = appendDecision(next, {
      scheduleId: schedule.id,
      side: 'TERMINAL',
      payloadId: input.payloadId,
      field,
      action: 'EDIT',
      versionId: saved.version.id,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    })
  }
  return next
}

function freshSchedule(state: ScheduleState, scheduleId: string) {
  return state.schedules.find((schedule) => schedule.id === scheduleId)!
}

function isAutoBound(state: ScheduleState, schedule: VesselSchedule) {
  const match = matchOf(state, schedule)
  return Boolean(match?.terminalVersionId && match.method === 'AUTO')
}

function latestSyncIsAuto(state: ScheduleState, scheduleId: string) {
  const query = latestSettledQuery(state, scheduleId)
  if (!query || query.status !== 'FOUND') return false
  return payloadsForQuery(state, query.id).length === 1
}

function boundMappingStatus(method: MatchMethod | undefined) {
  return method === 'USER' ? 'Manual matched' : 'Auto matched'
}

function incomingMappingStatus(shape: TerminalShape | null, method?: MatchMethod) {
  if (shape === 'none') return 'No terminal record'
  if (shape === 'many') return 'Multiple terminal records'
  return boundMappingStatus(method)
}

function sameIdentity(left: TerminalSnapshot, right: TerminalSnapshot) {
  return left.exportVoyage === right.exportVoyage
    && left.importVoyage === right.importVoyage
    && left.terminalName === right.terminalName
}

function latestLaraPayload(state: ScheduleState, scheduleId: string) {
  return [...state.laraPayloads].reverse().find((payload) => payload.scheduleId === scheduleId)
}

function latestSettledQuery(state: ScheduleState, scheduleId: string) {
  return [...state.terminalQueries].reverse().find(
    (item) => item.scheduleId === scheduleId && (item.status === 'FOUND' || item.status === 'NOT_FOUND'),
  )
}

function payloadsForQuery(state: ScheduleState, queryId: string) {
  return state.terminalPayloads.filter((payload) => payload.queryId === queryId)
}

export function reviewSchedule(state: ScheduleState, scheduleId: string, policy: SyncPolicy = defaultSyncPolicy()): ScheduleReview {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  const fields: FieldReview[] = []
  if (!schedule) return emptyReview(scheduleId)
  const query = latestSettledQuery(state, scheduleId)
  const terminalPayloads = query?.status === 'FOUND' ? payloadsForQuery(state, query.id) : []
  const terminal = currentTerminal(state, schedule)
  const bound = hasBoundMatch(state, scheduleId)
  if (bound && terminal && query && !shapeDecided(state, scheduleId, query.id)) {
    if (query.status === 'NOT_FOUND' || terminalPayloads.length > 1) {
      const shape: TerminalShape = query.status === 'NOT_FOUND' ? 'none' : 'many'
      const shapeFields: FieldReview[] = []
      if (policy.watched.has(watchKey('MATCH', MATCH_FIELD))) {
        const match = matchOf(state, schedule)
        const previousStatus = boundMappingStatus(match?.method)
        const incomingStatus = incomingMappingStatus(shape)
        if (previousStatus !== incomingStatus) {
          shapeFields.push({
            side: 'MATCH',
            field: MATCH_FIELD,
            previousValue: previousStatus,
            incomingValue: incomingStatus,
            status: 'pending',
            payloadId: query.id,
          })
        }
      }
      return {
        scheduleId,
        pending: true,
        changed: shapeFields.length > 0,
        fields: shapeFields,
        shape,
        candidateCount: terminalPayloads.length,
        queryId: query.id,
      }
    }
  }
  const currentLara = laraVersion(state, schedule.laraVersionId)
  const payload = latestLaraPayload(state, scheduleId)
  if (currentLara && payload && bound) {
    const previous = laraVersionsOf(state, scheduleId).find((version) => version.seq === currentLara.seq - 1)
    const held = heldLaraFields(state, schedule)
    for (const field of LARA_FIELDS) {
      const incoming = laraValue(payload, field)
      const value = laraValue(currentLara, field)
      const prior = laraValue(previous, field)
      const key = watchKey('LARA', field)
      if (!policy.watched.has(key)) continue
      if (!countsAsChange(key, value, incoming, policy) && value === prior) continue
      if (!latestSyncIsAuto(state, scheduleId) && !isAutoBound(state, schedule) && held.has(field) && countsAsChange(key, value, incoming, policy) && !laraDecided(state, scheduleId, field, incoming)) {
        fields.push({ side: 'LARA', field, previousValue: value, incomingValue: incoming, status: 'pending', payloadId: payload.id })
      } else if (previous && currentLara.payloadId === payload.id && value !== prior && countsAsChange(key, prior, value, policy)) {
        fields.push({ side: 'LARA', field, previousValue: prior, incomingValue: value, status: 'applied', payloadId: payload.id })
      }
    }
  }
  const sole = terminalPayloads.length === 1 ? terminalPayloads[0] : undefined
  const match = matchOf(state, schedule)
  if (bound && sole && terminal) {
    const versions = terminalVersionsOf(state, scheduleId)
    const previous = versions.find((version) => version.seq === terminal.seq - 1)
    const held = heldTerminalFields(state, schedule)
    for (const field of TERMINAL_FIELDS) {
      const incoming = terminalValue(sole, field)
      const value = terminalValue(terminal, field)
      const prior = terminalValue(previous, field)
      const key = watchKey('TERMINAL', field)
      if (!policy.watched.has(key)) continue
      if (!latestSyncIsAuto(state, scheduleId) && match?.method !== 'AUTO' && held.has(field) && countsAsChange(key, value, incoming, policy) && !terminalDecided(state, scheduleId, field, incoming)) {
        fields.push({ side: 'TERMINAL', field, previousValue: value, incomingValue: incoming, status: 'pending', payloadId: sole.id })
      } else if (previous && terminal.payloadId === sole.id && value !== prior && countsAsChange(key, prior, value, policy)) {
        fields.push({ side: 'TERMINAL', field, previousValue: prior, incomingValue: value, status: 'applied', payloadId: sole.id })
      }
    }
    const identityChanged = !sameIdentity(terminal, sole)
    if (identityChanged && policy.watched.has(watchKey('MATCH', MATCH_FIELD)) && match && terminal.payloadId === sole.id) {
      const priorMatch = state.matches.filter((item) => item.scheduleId === scheduleId && item.seq < match.seq).at(-1)
      const previousStatus = boundMappingStatus(priorMatch?.method ?? match.method)
      const incomingStatus = boundMappingStatus(match.method)
      if (previousStatus !== incomingStatus) {
        fields.push({
          side: 'MATCH',
          field: MATCH_FIELD,
          previousValue: previousStatus,
          incomingValue: incomingStatus,
          status: 'applied',
          payloadId: sole.id,
        })
      }
    }
  }
  return {
    scheduleId,
    pending: fields.some((field) => field.status === 'pending'),
    changed: fields.length > 0,
    fields,
    shape: null,
    candidateCount: terminalPayloads.length,
    queryId: query?.id ?? null,
  }
}

export function laraFieldHistory(state: ScheduleState, scheduleId: string, field: LaraField): FieldHistoryRow[] {
  const versions = laraVersionsOf(state, scheduleId)
  const rows: FieldHistoryRow[] = []
  for (let index = 0; index < versions.length; index += 1) {
    const version = versions[index]!
    const previous = versions[index - 1]
    const nextValue = laraValue(version, field)
    const previousValue = laraValue(previous, field)
    if (previous && previousValue === nextValue) continue
    if (!previous && !nextValue) continue
    rows.push({
      seq: version.seq,
      previousValue,
      nextValue,
      source: version.source,
      reason: version.reason,
      updatedBy: version.updatedBy,
      updatedAt: version.updatedAt,
    })
  }
  return rows
}

export function terminalFieldHistory(state: ScheduleState, scheduleId: string, field: TerminalField): FieldHistoryRow[] {
  const versions = terminalVersionsOf(state, scheduleId)
  const rows: FieldHistoryRow[] = []
  for (let index = 0; index < versions.length; index += 1) {
    const version = versions[index]!
    const previous = versions[index - 1]
    const nextValue = terminalValue(version, field)
    const previousValue = terminalValue(previous, field)
    if (previous && previousValue === nextValue) continue
    if (!previous && !nextValue) continue
    rows.push({
      seq: version.seq,
      previousValue,
      nextValue,
      source: version.source,
      reason: version.reason,
      updatedBy: version.updatedBy,
      updatedAt: version.updatedAt,
    })
  }
  return rows
}

export function matchHistory(state: ScheduleState, scheduleId: string) {
  return state.matches.filter((match) => match.scheduleId === scheduleId).sort((a, b) => a.seq - b.seq)
}
