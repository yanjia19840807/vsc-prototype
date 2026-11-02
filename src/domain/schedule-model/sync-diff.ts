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
  LaraPayload,
  LaraSnapshot,
  LaraVersion,
  Match,
  MatchMethod,
  PlatformLastSyncStatus,
  PlatformMatchingStatus,
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
  /** Candidate used for field comparison. A voyage match is only the default. */
  comparedPayloadId: string | null
  candidateCount: number
  queryId: string | null
}

export type SyncPolicy = {
  /**
   * Keys from `watchKey`. On a manual match, a change in one of these fields
   * keeps the saved value. After a manual match, a later multi-record sync
   * uses `dayThreshold` to decide which of these fields still need a choice.
   */
  watched: ReadonlySet<string>
  /** Day thresholds for watched date fields. Missing or 0 means any difference counts. */
  dayThreshold: Readonly<Record<string, number>>
}

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
  return { scheduleId, pending: false, changed: false, fields: [], shape: null, comparedPayloadId: null, candidateCount: 0, queryId: null }
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

/** Already-written LARA values. A terminal binding is not required. */
function writtenLaraDiffs(state: ScheduleState, schedule: VesselSchedule, policy: SyncPolicy): FieldReview[] {
  const current = laraVersion(state, schedule.laraVersionId)
  if (!current) return []
  const previous = laraVersionsOf(state, schedule.id).find((version) => version.seq === current.seq - 1)
  if (!previous) return []
  const fields: FieldReview[] = []
  for (const field of LARA_FIELDS) {
    const value = laraValue(current, field)
    const prior = laraValue(previous, field)
    const key = watchKey('LARA', field)
    if (!policy.watched.has(key) || !countsAsChange(key, prior, value, policy)) continue
    fields.push({
      side: 'LARA',
      field,
      previousValue: prior,
      incomingValue: value,
      status: 'applied',
      payloadId: current.payloadId ?? '',
    })
  }
  return fields
}

/** Already-written terminal values, including a value kept by manual review. */
function writtenTerminalDiffs(state: ScheduleState, schedule: VesselSchedule, policy: SyncPolicy): FieldReview[] {
  const current = currentTerminal(state, schedule)
  if (!current) return []
  const previous = terminalVersionsOf(state, schedule.id).find((version) => version.seq === current.seq - 1)
  if (!previous) return []
  const fields: FieldReview[] = []
  for (const field of TERMINAL_FIELDS) {
    const value = terminalValue(current, field)
    const prior = terminalValue(previous, field)
    const key = watchKey('TERMINAL', field)
    if (!policy.watched.has(key) || !countsAsChange(key, prior, value, policy)) continue
    fields.push({
      side: 'TERMINAL',
      field,
      previousValue: prior,
      incomingValue: value,
      status: 'applied',
      payloadId: current.payloadId ?? '',
    })
  }
  return fields
}

/** A pending choice is not a written difference. Drop the earlier version gap for that field until it is resolved. */
function withoutUnresolvedDiffs(fields: FieldReview[]): FieldReview[] {
  const pending = new Set(
    fields.filter((field) => field.status === 'pending').map((field) => `${field.side}:${field.field}`),
  )
  if (!pending.size) return fields
  return fields.filter((field) => field.status !== 'applied' || !pending.has(`${field.side}:${field.field}`))
}

function terminalVersionsOf(state: ScheduleState, scheduleId: string) {
  return state.terminalVersions.filter((version) => version.scheduleId === scheduleId).sort((a, b) => a.seq - b.seq)
}

function laraPayload(state: ScheduleState, id: string) {
  return state.laraPayloads.find((payload) => payload.id === id)
}

function terminalPayload(state: ScheduleState, id: string) {
  return state.terminalPayloads.find((payload) => payload.id === id)
}

function answeredQuery(state: ScheduleState, scheduleId: string, queryId: string) {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) return false
  return matchOf(state, schedule)?.queryId === queryId
}

function requireSchedule(state: ScheduleState, scheduleId: string) {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) throw new Error('Vessel schedule was not found')
  return schedule
}

function writeSchedule(state: ScheduleState, scheduleId: string, patch: Partial<VesselSchedule>) {
  return {
    ...state,
    schedules: state.schedules.map((schedule) => (schedule.id === scheduleId ? { ...schedule, ...patch } : schedule)),
  }
}

function updateSchedule(state: ScheduleState, scheduleId: string, patch: Partial<VesselSchedule>) {
  return refreshListProjection(writeSchedule(state, scheduleId, patch), scheduleId)
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
  input: { snapshot: TerminalSnapshot; source: 'SYNC' | 'USER'; payloadId: string | null; enteredManually?: boolean; reason: string; updatedBy: string; updatedAt: string },
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
    enteredManually: input.enteredManually ?? false,
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
    queryId?: string | null
    reason: string
    updatedBy: string
    updatedAt: string
  },
) {
  const lara = laraVersion(state, input.schedule.laraVersionId)
  if (!lara) return state
  const queryId = input.queryId ?? null
  const current = matchOf(state, input.schedule)
  if (
    current
    && current.terminalVersionId === input.terminalVersionId
    && current.method === input.method
    && current.laraVersionId === lara.id
    && current.queryId === queryId
  ) {
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
    queryId,
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

function isManualMatch(state: ScheduleState, schedule: VesselSchedule) {
  return matchOf(state, schedule)?.method === 'USER'
}

/** A person already changed this field, so a later difference needs review. */
function fieldWasModified(state: ScheduleState, scheduleId: string, side: 'LARA' | 'TERMINAL', field: string) {
  if (side === 'LARA') {
    const versions = laraVersionsOf(state, scheduleId)
    for (let index = 1; index < versions.length; index += 1) {
      const version = versions[index]!
      if (version.source !== 'USER') continue
      if (laraValue(version, field as LaraField) !== laraValue(versions[index - 1], field as LaraField)) return true
    }
    return false
  }
  const versions = terminalVersionsOf(state, scheduleId)
  for (let index = 1; index < versions.length; index += 1) {
    const version = versions[index]!
    if (version.source !== 'USER') continue
    if (terminalValue(version, field as TerminalField) !== terminalValue(versions[index - 1], field as TerminalField)) return true
  }
  return false
}

/** Saved terminal values already equal one auto-matchable record, so a prior manual edit no longer decides the binding. */
function agreesWithAutoMatch(state: ScheduleState, schedule: VesselSchedule, payload: TerminalPayload) {
  const siblings = state.terminalPayloads.filter((item) => item.queryId === payload.queryId)
  if (siblings.length !== 1) return false
  if (!TERMINAL_FIELDS.some((field) => fieldWasModified(state, schedule.id, 'TERMINAL', field))) return false
  const laraEta = laraVersion(state, schedule.laraVersionId)?.laraEta ?? ''
  return oneRecordStatus(laraEta, payload) === 'Auto matched'
}

function oneRecordStatus(laraEta: string, terminal: Pick<TerminalSnapshot, 'exportVoyage' | 'importVoyage' | 'eta'>) {
  if (!terminal.exportVoyage.trim() || !terminal.importVoyage.trim()) return 'No external voyage'
  const days = dayDistance(laraEta, terminal.eta)
  if (days == null || days > 3) return 'ETA gap > 3 days'
  return 'Auto matched'
}

/** Latest settled sync is many or none, and a non-manual match already accepted that. */
export function settledTerminalShape(state: ScheduleState, scheduleId: string): TerminalShape | null {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) return null
  const match = matchOf(state, schedule)
  if (match?.terminalVersionId) return null
  const query = latestSettledQuery(state, scheduleId)
  if (!query || !shapeSettled(state, scheduleId, query.id)) return null
  if (query.status === 'NOT_FOUND') return 'none'
  return payloadsForQuery(state, query.id).length > 1 ? 'many' : null
}

/** Status the list should show after the latest sync has been applied. */
export function displayedMatchingStatus(state: ScheduleState, scheduleId: string): PlatformMatchingStatus | null {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) return null
  const shape = settledTerminalShape(state, scheduleId)
  if (shape === 'many') return 'Multiple terminal records' as const
  if (shape === 'none') return 'No terminal record' as const
  const match = matchOf(state, schedule)
  if (!match?.terminalVersionId) return null
  if (match.method === 'USER') {
    return reviewSchedule(state, scheduleId).pending ? 'Pending match' as const : 'Manual matched' as const
  }
  const terminal = currentTerminal(state, schedule)
  if (!terminal) return null
  const laraEta = laraVersion(state, schedule.laraVersionId)?.laraEta ?? ''
  return oneRecordStatus(laraEta, terminal)
}

export function applyLaraPayload(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; updatedBy: string; updatedAt: string; policy?: SyncPolicy },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const payload = laraPayload(state, input.payloadId)
  if (!payload || payload.scheduleId !== schedule.id) throw new Error('LARA payload was not found')
  const current = laraVersion(state, schedule.laraVersionId) ?? emptyLaraSnapshot()
  const adopted: Partial<LaraSnapshot> = {}
  for (const field of LARA_FIELDS) {
    const incoming = laraValue(payload, field)
    const previous = laraValue(current, field)
    if (previous === incoming) continue
    adopted[field] = incoming as never
  }
  if (!Object.keys(adopted).length) return state
  const snapshot = { ...pickLara(current as LaraSnapshot), ...adopted }
  return appendLaraVersion(state, freshSchedule(state, schedule.id), {
    snapshot,
    source: 'SYNC',
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
  const current = currentTerminal(state, schedule) ?? emptyTerminalSnapshot()
  const manual = (input.method ?? matchOf(state, schedule)?.method) === 'USER'
  if (manual && !input.method) {
    if (sameTerminal(current, payload) && currentTerminal(state, schedule) && agreesWithAutoMatch(state, schedule, payload)) {
      const match = matchOf(state, schedule)
      if (match?.terminalVersionId) {
        return appendMatch(state, {
          schedule,
          terminalVersionId: match.terminalVersionId,
          method: 'AUTO',
          queryId: payload.queryId,
          reason: '',
          updatedBy: input.updatedBy,
          updatedAt: input.updatedAt,
        })
      }
    }
    return state
  }
  if (sameTerminal(current, payload) && currentTerminal(state, schedule)) return state
  const saved = appendTerminalVersion(state, schedule, {
    snapshot: pickTerminal(payload),
    source: 'SYNC',
    payloadId: payload.id,
    enteredManually: false,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  return appendMatch(saved.state, {
    schedule: freshSchedule(saved.state, schedule.id),
    terminalVersionId: saved.version.id,
    method: input.method ?? 'AUTO',
    queryId: payload.queryId,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

/** Drop a non-manual binding when the latest terminal sync is not one record. */
export function settleOpenShape(
  state: ScheduleState,
  input: { scheduleId: string; queryId: string; updatedBy: string; updatedAt: string },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  if (isManualMatch(state, schedule)) return state
  return appendMatch(state, {
    schedule,
    terminalVersionId: null,
    method: 'AUTO',
    queryId: input.queryId,
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
    queryId: null,
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

function shapeSettled(state: ScheduleState, scheduleId: string, queryId: string) {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) return false
  const match = matchOf(state, schedule)
  return Boolean(match && match.queryId === queryId && !match.terminalVersionId)
}

/** A review confirm keeps one terminal record and is always a manual match. */
export function confirmReviewedMatch(
  state: ScheduleState,
  input: {
    scheduleId: string
    snapshot: TerminalSnapshot
    enteredManually?: boolean
    reason: string
    updatedBy: string
    updatedAt: string
    source?: 'SYNC' | 'USER'
    payloadId?: string | null
  },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const current = currentTerminal(state, schedule)
  const match = matchOf(state, schedule)
  let next = state
  let versionId = match?.terminalVersionId ?? null
  if (!current || !versionId || !sameTerminal(current, input.snapshot)) {
    const saved = appendTerminalVersion(next, freshSchedule(next, schedule.id), {
      snapshot: input.snapshot,
      source: input.source ?? 'USER',
      payloadId: input.payloadId ?? null,
      enteredManually: input.enteredManually ?? current?.enteredManually ?? false,
      reason: input.reason,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    })
    next = saved.state
    versionId = saved.version.id
  }
  const query = latestSettledQuery(state, schedule.id)
  return appendMatch(next, {
    schedule: freshSchedule(next, schedule.id),
    terminalVersionId: versionId,
    method: 'USER',
    queryId: query?.id ?? null,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

/** Keep the current terminal version and record that this query was reviewed. */
export function keepReviewedQuery(
  state: ScheduleState,
  input: { scheduleId: string; queryId: string; updatedBy: string; updatedAt: string },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const match = matchOf(state, schedule)
  return appendMatch(state, {
    schedule,
    terminalVersionId: match?.terminalVersionId ?? null,
    method: 'USER',
    queryId: input.queryId,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function keepTerminalShape(
  state: ScheduleState,
  input: { scheduleId: string; queryId: string; updatedBy: string; updatedAt: string },
) {
  return keepReviewedQuery(state, input)
}

export function adoptNoTerminal(
  state: ScheduleState,
  input: { scheduleId: string; queryId: string; updatedBy: string; updatedAt: string },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  return appendMatch(state, {
    schedule,
    terminalVersionId: null,
    method: 'AUTO',
    queryId: input.queryId,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function keepLaraField(
  state: ScheduleState,
  _input: { scheduleId: string; payloadId: string; field: LaraField; updatedBy: string; updatedAt: string },
) {
  return state
}

export function keepTerminalField(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; field: TerminalField; updatedBy: string; updatedAt: string },
) {
  const payload = terminalPayload(state, input.payloadId)
  const queryId = payload?.queryId ?? input.payloadId
  return keepReviewedQuery(state, { scheduleId: input.scheduleId, queryId, updatedBy: input.updatedBy, updatedAt: input.updatedAt })
}

export function keepMatch(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; updatedBy: string; updatedAt: string },
) {
  const payload = terminalPayload(state, input.payloadId)
  const queryId = payload?.queryId ?? input.payloadId
  return keepReviewedQuery(state, { scheduleId: input.scheduleId, queryId, updatedBy: input.updatedBy, updatedAt: input.updatedAt })
}

export function acceptLaraField(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; field: LaraField; updatedBy: string; updatedAt: string },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const payload = laraPayload(state, input.payloadId)
  if (!payload) return state
  return appendLaraVersion(state, schedule, {
    snapshot: pickLara(payload),
    source: 'SYNC',
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
  return appendLaraVersion(state, schedule, {
    snapshot,
    source: 'USER',
    payloadId: input.payloadId ?? null,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function acceptTerminalField(
  state: ScheduleState,
  input: { scheduleId: string; payloadId: string; field: TerminalField; updatedBy: string; updatedAt: string },
) {
  return acceptTerminalPayload(state, {
    scheduleId: input.scheduleId,
    payloadId: input.payloadId,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
    method: 'USER',
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
    enteredManually: false,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  return appendMatch(saved.state, {
    schedule: freshSchedule(saved.state, schedule.id),
    terminalVersionId: saved.version.id,
    method: input.method ?? 'AUTO',
    queryId: payload.queryId,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function editTerminalFields(
  state: ScheduleState,
  input: { scheduleId: string; payloadId?: string; fields: Partial<TerminalSnapshot>; enteredManually?: boolean; reason: string; updatedBy: string; updatedAt: string },
) {
  const schedule = requireSchedule(state, input.scheduleId)
  const current = currentTerminal(state, schedule) ?? emptyTerminalSnapshot()
  const snapshot = { ...pickTerminal(current), ...input.fields }
  const saved = appendTerminalVersion(state, schedule, {
    snapshot,
    source: 'USER',
    payloadId: input.payloadId ?? null,
    enteredManually: input.enteredManually ?? currentTerminal(state, schedule)?.enteredManually ?? false,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  const payload = input.payloadId ? terminalPayload(state, input.payloadId) : undefined
  const keptQueryId = payload?.queryId ?? matchOf(state, schedule)?.queryId ?? null
  return appendMatch(saved.state, {
    schedule: freshSchedule(saved.state, schedule.id),
    terminalVersionId: saved.version.id,
    method: 'USER',
    queryId: keptQueryId,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

function freshSchedule(state: ScheduleState, scheduleId: string) {
  return state.schedules.find((schedule) => schedule.id === scheduleId)!
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

/** Latest terminal query that has a result. A call still in progress is not included. */
export function latestReturnedTerminalQuery(state: ScheduleState, scheduleId: string) {
  return [...state.terminalQueries].reverse().find(
    (item) => item.scheduleId === scheduleId && item.status !== 'PENDING',
  )
}

export const LAST_SYNC_STATUSES: readonly PlatformLastSyncStatus[] = [
  'Auto matched',
  'Multiple terminal records',
  'ETA gap > 3 days',
  'No external voyage',
  'No terminal record',
  'Failed',
]

export type LastSyncStatus = PlatformLastSyncStatus

/**
 * What the latest terminal sync itself produced.
 * Manual matched and Pending match are later human states, so they are not used here.
 */
export function displayedLastSyncStatus(state: ScheduleState, scheduleId: string): LastSyncStatus | null {
  const query = latestReturnedTerminalQuery(state, scheduleId)
  if (!query) return null
  if (query.status === 'FAILED') return 'Failed'
  if (query.status === 'NOT_FOUND') return 'No terminal record'
  const payloads = payloadsForQuery(state, query.id)
  if (payloads.length > 1) return 'Multiple terminal records'
  const sole = payloads[0]
  if (!sole) return 'No terminal record'
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  const laraEta = laraVersion(state, schedule?.laraVersionId)?.laraEta
    ?? latestLaraPayload(state, scheduleId)?.laraEta
    ?? ''
  return oneRecordStatus(laraEta, sole)
}

export type ReturnedTerminalQuery = {
  status: LastSyncStatus
  requestedAt: string
  respondedAt: string | null
  failureReason: string
  payloads: TerminalPayload[]
}

/** The query behind Last mapping status, with the records it returned. */
export function returnedTerminalQuery(state: ScheduleState, scheduleId: string): ReturnedTerminalQuery | null {
  const query = latestReturnedTerminalQuery(state, scheduleId)
  const status = displayedLastSyncStatus(state, scheduleId)
  if (!query || !status) return null
  return {
    status,
    requestedAt: query.requestedAt,
    respondedAt: query.respondedAt,
    failureReason: query.failureReason,
    payloads: payloadsForQuery(state, query.id),
  }
}

function isUserActor(by: string) {
  const name = by.trim()
  return Boolean(name) && name.toLowerCase() !== 'system'
}

/** Latest person who wrote a version or match. System syncs are not modifications. */
export function latestUserModification(state: ScheduleState, scheduleId: string): { by: string; at: string } | null {
  let by: string | null = null
  let at: string | null = null
  const consider = (nextBy: string, nextAt: string) => {
    if (!isUserActor(nextBy) || !nextAt || (at != null && nextAt < at)) return
    at = nextAt
    by = nextBy
  }
  for (const version of state.laraVersions) {
    if (version.scheduleId === scheduleId) consider(version.updatedBy, version.updatedAt)
  }
  for (const version of state.terminalVersions) {
    if (version.scheduleId === scheduleId) consider(version.updatedBy, version.updatedAt)
  }
  for (const match of state.matches) {
    if (match.scheduleId === scheduleId) consider(match.updatedBy, match.updatedAt)
  }
  if (!by || !at) return null
  return { by, at }
}

/** Rewrite the five list columns from the current versions, match, query, and decisions. */
export function refreshListProjection(state: ScheduleState, scheduleId: string) {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  if (!schedule) return state
  const latestQuery = [...state.terminalQueries].reverse().find((item) => item.scheduleId === scheduleId)
  const modified = latestModification(state, schedule)
  const next = {
    platformMatchingStatus: displayedMatchingStatus(state, scheduleId),
    platformLastSyncStatus: displayedLastSyncStatus(state, scheduleId),
    lastSyncAt: latestQuery?.requestedAt ?? null,
    lastModifiedBy: modified.by,
    lastModifiedAt: modified.at,
  }
  if (
    schedule.platformMatchingStatus === next.platformMatchingStatus
    && schedule.platformLastSyncStatus === next.platformLastSyncStatus
    && schedule.lastSyncAt === next.lastSyncAt
    && schedule.lastModifiedBy === next.lastModifiedBy
    && schedule.lastModifiedAt === next.lastModifiedAt
  ) return state
  return writeSchedule(state, scheduleId, next)
}

function latestModification(state: ScheduleState, schedule: VesselSchedule) {
  let by: string | null = null
  let at: string | null = null
  const consider = (nextBy: string, nextAt: string) => {
    if (!nextAt || (at != null && nextAt < at)) return
    at = nextAt
    by = nextBy
  }
  const lara = laraVersion(state, schedule.laraVersionId)
  if (lara) consider(lara.updatedBy, lara.updatedAt)
  const match = matchOf(state, schedule)
  if (match) {
    consider(match.updatedBy, match.updatedAt)
    const terminal = terminalVersion(state, match.terminalVersionId)
    if (terminal) consider(terminal.updatedBy, terminal.updatedAt)
  }
  return { by, at }
}

function payloadsForQuery(state: ScheduleState, queryId: string) {
  return state.terminalPayloads.filter((payload) => payload.queryId === queryId)
}

function voyageTwin(current: TerminalSnapshot, payloads: TerminalPayload[]) {
  const exportVoyage = current.exportVoyage.trim()
  const importVoyage = current.importVoyage.trim()
  if (!exportVoyage || !importVoyage) return undefined
  const hits = payloads.filter((payload) => payload.exportVoyage.trim() === exportVoyage && payload.importVoyage.trim() === importVoyage)
  return hits.length === 1 ? hits[0] : undefined
}

export function reviewSchedule(state: ScheduleState, scheduleId: string, policy: SyncPolicy = defaultSyncPolicy()): ScheduleReview {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  const fields: FieldReview[] = []
  if (!schedule) return emptyReview(scheduleId)
  const query = latestSettledQuery(state, scheduleId)
  const terminalPayloads = query?.status === 'FOUND' ? payloadsForQuery(state, query.id) : []
  const terminal = currentTerminal(state, schedule)
  const bound = hasBoundMatch(state, scheduleId)
  const twin = bound && terminal && isManualMatch(state, schedule) ? voyageTwin(terminal, terminalPayloads) : undefined
  if (bound && terminal && query && !answeredQuery(state, scheduleId, query.id) && isManualMatch(state, schedule)) {
    const ignoredEmptySync = query.status === 'NOT_FOUND'
    const needsChoice = !ignoredEmptySync && (query.status === 'NOT_FOUND' || (terminalPayloads.length > 1 && !twin))
    if (needsChoice) {
      const shape: TerminalShape = query.status === 'NOT_FOUND' ? 'none' : 'many'
      const shapeFields: FieldReview[] = [
        ...writtenLaraDiffs(state, schedule, policy),
        ...writtenTerminalDiffs(state, schedule, policy),
      ]
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
      const openFields = withoutUnresolvedDiffs(shapeFields)
      return {
        scheduleId,
        pending: true,
        changed: openFields.length > 0,
        fields: openFields,
        shape,
        comparedPayloadId: null,
        candidateCount: terminalPayloads.length,
        queryId: query.id,
      }
    }
  }
  if (!bound && query && shapeSettled(state, scheduleId, query.id)) {
    const settled: TerminalShape | null = query.status === 'NOT_FOUND' ? 'none' : terminalPayloads.length > 1 ? 'many' : null
    if (settled && policy.watched.has(watchKey('MATCH', MATCH_FIELD))) {
      const prior = [...state.matches].reverse().find((item) => item.scheduleId === scheduleId && item.terminalVersionId)
      const previousStatus = boundMappingStatus(prior?.method)
      const incomingStatus = incomingMappingStatus(settled)
      if (previousStatus !== incomingStatus) {
        fields.push({
          side: 'MATCH',
          field: MATCH_FIELD,
          previousValue: previousStatus,
          incomingValue: incomingStatus,
          status: 'applied',
          payloadId: query.id,
        })
      }
    }
  }
  fields.push(...writtenLaraDiffs(state, schedule, policy), ...writtenTerminalDiffs(state, schedule, policy))
  const resolvedMany = terminalPayloads.length > 1 ? twin : undefined
  const sole = terminalPayloads.length === 1 ? terminalPayloads[0] : resolvedMany
  const match = matchOf(state, schedule)
  if (bound && sole && terminal) {
    for (const field of TERMINAL_FIELDS) {
      const incoming = terminalValue(sole, field)
      const value = terminalValue(terminal, field)
      const manualHold = match?.method === 'USER' && value !== incoming && !answeredQuery(state, scheduleId, sole.queryId)
      if (manualHold && fieldWasModified(state, scheduleId, 'TERMINAL', field)) {
        fields.push({ side: 'TERMINAL', field, previousValue: value, incomingValue: incoming, status: 'pending', payloadId: sole.id })
      }
    }
    if (
      terminalPayloads.length === 1
      && isManualMatch(state, schedule)
      && !fields.some((field) => field.side === 'MATCH' && field.field === MATCH_FIELD)
    ) {
      const laraEta = latestLaraPayload(state, scheduleId)?.laraEta
        ?? laraVersion(state, schedule.laraVersionId)?.laraEta
        ?? ''
      const incomingStatus = oneRecordStatus(laraEta, sole)
      const previousStatus = boundMappingStatus(match?.method)
      if (incomingStatus !== 'Auto matched' && !answeredQuery(state, scheduleId, sole.queryId)) {
        fields.push({
          side: 'MATCH',
          field: MATCH_FIELD,
          previousValue: previousStatus,
          incomingValue: incomingStatus,
          status: 'pending',
          payloadId: sole.id,
        })
      }
    }
    const identityChanged = !sameIdentity(terminal, sole)
    if (
      identityChanged
      && policy.watched.has(watchKey('MATCH', MATCH_FIELD))
      && match
      && terminal.payloadId === sole.id
      && !fields.some((field) => field.side === 'MATCH' && field.field === MATCH_FIELD)
    ) {
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
  const identicalTwin = Boolean(twin && terminal && sameTerminal(terminal, twin))
  const manyOpen = Boolean(
    bound
    && terminal
    && query?.status === 'FOUND'
    && isManualMatch(state, schedule)
    && terminalPayloads.length > 1
    && !identicalTwin
    && query
    && !answeredQuery(state, scheduleId, query.id),
  )
  if (manyOpen && query) {
    const previousStatus = boundMappingStatus(match?.method)
    const incomingStatus = incomingMappingStatus('many')
    if (previousStatus !== incomingStatus && !fields.some((field) => field.side === 'MATCH' && field.field === MATCH_FIELD)) {
      fields.push({
        side: 'MATCH',
        field: MATCH_FIELD,
        previousValue: previousStatus,
        incomingValue: incomingStatus,
        status: 'pending',
        payloadId: query.id,
      })
    }
  }
  const openFields = withoutUnresolvedDiffs(fields)
  return {
    scheduleId,
    pending: openFields.some((field) => field.status === 'pending') || manyOpen,
    changed: openFields.length > 0,
    fields: openFields,
    shape: manyOpen ? 'many' : null,
    comparedPayloadId: identicalTwin ? null : (resolvedMany?.id ?? null),
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
