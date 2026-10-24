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
import { isLinkSource, isLinkTarget, nextId, parseTime } from '@/domain/schedule-model/state'
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
  VesselCall,
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

export type CallReview = {
  callId: string
  pending: boolean
  changed: boolean
  fields: FieldReview[]
  /** Set when an already matched call's latest sync is no longer one record. */
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
  'TERMINAL:etb',
  'TERMINAL:etd',
  'TERMINAL:atb',
  'TERMINAL:atd',
  'TERMINAL:cyOpen',
  'TERMINAL:cyCutoff',
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

function emptyReview(callId: string): CallReview {
  return { callId, pending: false, changed: false, fields: [], shape: null, candidateCount: 0, queryId: null }
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

export function matchOf(state: ScheduleState, call: VesselCall) {
  if (!call.matchId) return undefined
  return state.matches.find((match) => match.id === call.matchId)
}

export function currentTerminal(state: ScheduleState, call: VesselCall) {
  const match = matchOf(state, call)
  return terminalVersion(state, match?.terminalVersionId)
}

function laraVersionsOf(state: ScheduleState, callId: string) {
  return state.laraVersions.filter((version) => version.callId === callId).sort((a, b) => a.seq - b.seq)
}

function terminalVersionsOf(state: ScheduleState, callId: string) {
  return state.terminalVersions.filter((version) => version.callId === callId).sort((a, b) => a.seq - b.seq)
}

function heldLaraFields(state: ScheduleState, call: VesselCall) {
  const current = laraVersion(state, call.laraVersionId)
  const held = new Set<LaraField>()
  if (!current || current.source === 'SYNC') return held
  const prior = [...laraVersionsOf(state, call.id)].reverse().find((version) => version.source === 'SYNC' && version.seq < current.seq)
  const base = prior ?? emptyLaraSnapshot()
  for (const field of LARA_FIELDS) {
    if (laraValue(current, field) !== laraValue(base, field)) held.add(field)
  }
  return held
}

function heldTerminalFields(state: ScheduleState, call: VesselCall) {
  const current = currentTerminal(state, call)
  const held = new Set<TerminalField>()
  if (!current || current.source === 'SYNC') return held
  const prior = [...terminalVersionsOf(state, call.id)].reverse().find((version) => version.source === 'SYNC' && version.seq < current.seq)
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

function laraDecided(state: ScheduleState, callId: string, field: string, incoming: string) {
  return state.fieldDecisions.some((decision) => {
    if (decision.callId !== callId || decision.side !== 'LARA' || decision.field !== field) return false
    const payload = laraPayload(state, decision.payloadId)
    return Boolean(payload && laraValue(payload, field as LaraField) === incoming)
  })
}

function terminalDecided(state: ScheduleState, callId: string, field: string, incoming: string) {
  return state.fieldDecisions.some((decision) => {
    if (decision.callId !== callId || decision.side !== 'TERMINAL' || decision.field !== field) return false
    const payload = terminalPayload(state, decision.payloadId)
    return Boolean(payload && terminalValue(payload, field as TerminalField) === incoming)
  })
}

function matchDecided(state: ScheduleState, callId: string, incoming: TerminalSnapshot) {
  return state.fieldDecisions.some((decision) => {
    if (decision.callId !== callId || decision.field !== MATCH_FIELD) return false
    const payload = terminalPayload(state, decision.payloadId)
    return Boolean(payload && sameTerminal(payload, incoming))
  })
}

function requireCall(state: ScheduleState, callId: string) {
  const call = state.calls.find((item) => item.id === callId)
  if (!call) throw new Error('Vessel call was not found')
  return call
}

function updateCall(state: ScheduleState, callId: string, patch: Partial<VesselCall>) {
  return {
    ...state,
    calls: state.calls.map((call) => (call.id === callId ? { ...call, ...patch } : call)),
  }
}

function appendLaraVersion(
  state: ScheduleState,
  call: VesselCall,
  input: { snapshot: LaraSnapshot; source: 'SYNC' | 'USER'; payloadId: string | null; reason: string; updatedBy: string; updatedAt: string },
) {
  const seq = laraVersionsOf(state, call.id).length + 1
  const issued = nextId(state, 'lara-version')
  const version: LaraVersion = {
    ...pickLara(input.snapshot),
    id: issued.id,
    callId: call.id,
    seq,
    source: input.source,
    payloadId: input.payloadId,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  }
  return updateCall(
    { ...issued.state, laraVersions: [...issued.state.laraVersions, version] },
    call.id,
    { laraVersionId: version.id },
  )
}

function appendTerminalVersion(
  state: ScheduleState,
  call: VesselCall,
  input: { snapshot: TerminalSnapshot; source: 'SYNC' | 'USER'; payloadId: string | null; reason: string; updatedBy: string; updatedAt: string },
) {
  const seq = terminalVersionsOf(state, call.id).length + 1
  const issued = nextId(state, 'terminal-version')
  const version: TerminalVersion = {
    ...pickTerminal(input.snapshot),
    id: issued.id,
    callId: call.id,
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
    call: VesselCall
    terminalVersionId: string | null
    method: MatchMethod
    reason: string
    updatedBy: string
    updatedAt: string
  },
) {
  const lara = laraVersion(state, input.call.laraVersionId)
  if (!lara) return state
  const current = matchOf(state, input.call)
  if (current && current.terminalVersionId === input.terminalVersionId && current.method === input.method && current.laraVersionId === lara.id) {
    return state
  }
  const seq = state.matches.filter((match) => match.callId === input.call.id).length + 1
  const issued = nextId(state, 'match')
  const match: Match = {
    id: issued.id,
    callId: input.call.id,
    seq,
    laraVersionId: lara.id,
    terminalVersionId: input.terminalVersionId,
    method: input.method,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  }
  return updateCall(
    { ...issued.state, matches: [...issued.state.matches, match] },
    input.call.id,
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
  input: { callId: string; payloadId: string; updatedBy: string; updatedAt: string; policy?: SyncPolicy },
) {
  const call = requireCall(state, input.callId)
  if (isLinkSource(state, call.id) || isLinkTarget(state, call.id)) return state
  const payload = laraPayload(state, input.payloadId)
  if (!payload || payload.callId !== call.id) throw new Error('LARA payload was not found')
  const policy = input.policy ?? defaultSyncPolicy()
  const comparable = hasBoundMatch(state, call.id)
  const current = laraVersion(state, call.laraVersionId) ?? emptyLaraSnapshot()
  const held = heldLaraFields(state, call)
  const adopted: Partial<LaraSnapshot> = {}
  let pending = false
  for (const field of LARA_FIELDS) {
    const incoming = laraValue(payload, field)
    const previous = laraValue(current, field)
    const key = watchKey('LARA', field)
    if (!countsAsChange(key, previous, incoming, policy)) continue
    if (comparable && policy.watched.has(key) && held.has(field) && !laraDecided(state, call.id, field, incoming)) {
      pending = true
      continue
    }
    adopted[field] = incoming as never
  }
  if (!Object.keys(adopted).length) return state
  const snapshot = { ...pickLara(current as LaraSnapshot), ...adopted }
  return appendLaraVersion(state, freshCall(state, call.id), {
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
  input: { callId: string; payloadId: string; updatedBy: string; updatedAt: string; policy?: SyncPolicy; method?: MatchMethod },
) {
  const call = requireCall(state, input.callId)
  if (isLinkSource(state, call.id) || isLinkTarget(state, call.id)) return state
  const payload = terminalPayload(state, input.payloadId)
  if (!payload || payload.callId !== call.id) throw new Error('Terminal payload was not found')
  const policy = input.policy ?? defaultSyncPolicy()
  const match = matchOf(state, call)
  const current = currentTerminal(state, call) ?? emptyTerminalSnapshot()
  if (sameTerminal(current, payload) && currentTerminal(state, call) && !input.method) return state
  const held = heldTerminalFields(state, call)
  const adopted: Partial<TerminalSnapshot> = {}
  let pending = false
  for (const field of TERMINAL_FIELDS) {
    const incoming = terminalValue(payload, field)
    const previous = terminalValue(current, field)
    const key = watchKey('TERMINAL', field)
    if (!countsAsChange(key, previous, incoming, policy)) continue
    if (policy.watched.has(key) && held.has(field) && !terminalDecided(state, call.id, field, incoming)) {
      pending = true
      continue
    }
    adopted[field] = incoming
  }
  if (!Object.keys(adopted).length && pending) return state
  if (!Object.keys(adopted).length && currentTerminal(state, call)) return state
  const snapshot = { ...pickTerminal(current), ...adopted }
  const saved = appendTerminalVersion(state, call, {
    snapshot,
    source: pending ? 'USER' : 'SYNC',
    payloadId: payload.id,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  const method = input.method ?? (pending ? (match?.method ?? 'AUTO') : 'AUTO')
  return appendMatch(saved.state, {
    call: freshCall(saved.state, call.id),
    terminalVersionId: saved.version.id,
    method,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function clearAutoMatch(state: ScheduleState, callId: string, at: string, by: string) {
  const call = requireCall(state, callId)
  const match = matchOf(state, call)
  if (!match || match.method === 'USER' || !match.terminalVersionId) return state
  return appendMatch(state, {
    call,
    terminalVersionId: null,
    method: 'AUTO',
    reason: '',
    updatedBy: by,
    updatedAt: at,
  })
}

export function hasBoundMatch(state: ScheduleState, callId: string) {
  const call = state.calls.find((item) => item.id === callId)
  if (!call) return false
  const match = matchOf(state, call)
  return Boolean(match?.terminalVersionId && (match.method === 'AUTO' || match.method === 'USER'))
}

function shapeDecided(state: ScheduleState, callId: string, queryId: string) {
  return state.fieldDecisions.some(
    (decision) => decision.callId === callId && decision.field === TERMINAL_SHAPE && decision.payloadId === queryId,
  )
}

export function keepTerminalShape(
  state: ScheduleState,
  input: { callId: string; queryId: string; updatedBy: string; updatedAt: string },
) {
  if (shapeDecided(state, input.callId, input.queryId)) return state
  return appendDecision(state, {
    callId: input.callId,
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
  input: { callId: string; queryId: string; updatedBy: string; updatedAt: string },
) {
  const call = requireCall(state, input.callId)
  const match = matchOf(state, call)
  let next = state
  if (match?.terminalVersionId) {
    next = appendMatch(state, {
      call,
      terminalVersionId: null,
      method: 'AUTO',
      reason: '',
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    })
  }
  if (shapeDecided(next, input.callId, input.queryId)) return next
  return appendDecision(next, {
    callId: input.callId,
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
  input: { callId: string; payloadId: string; field: LaraField; updatedBy: string; updatedAt: string },
) {
  return appendDecision(state, {
    callId: input.callId,
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
  input: { callId: string; payloadId: string; field: TerminalField; updatedBy: string; updatedAt: string },
) {
  return appendDecision(state, {
    callId: input.callId,
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
  input: { callId: string; payloadId: string; updatedBy: string; updatedAt: string },
) {
  return appendDecision(state, {
    callId: input.callId,
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
  input: { callId: string; payloadId: string; field: LaraField; updatedBy: string; updatedAt: string },
) {
  const call = requireCall(state, input.callId)
  const payload = laraPayload(state, input.payloadId)
  const current = laraVersion(state, call.laraVersionId)
  if (!payload || !current) return state
  const snapshot = { ...pickLara(current), [input.field]: laraValue(payload, input.field) }
  const done = LARA_FIELDS.every((field) => laraValue(snapshot, field) === laraValue(payload, field))
  return appendLaraVersion(state, call, {
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
  input: { callId: string; payloadId?: string; fields: Partial<LaraSnapshot>; reason: string; updatedBy: string; updatedAt: string },
) {
  const call = requireCall(state, input.callId)
  const current = laraVersion(state, call.laraVersionId) ?? emptyLaraSnapshot()
  const snapshot = { ...pickLara(current as LaraSnapshot), ...input.fields }
  let next = appendLaraVersion(state, call, {
    snapshot,
    source: 'USER',
    payloadId: input.payloadId ?? null,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  const version = laraVersion(next, freshCall(next, call.id).laraVersionId)
  if (!input.payloadId || !version) return next
  for (const field of LARA_FIELDS) {
    if (input.fields[field] == null) continue
    next = appendDecision(next, {
      callId: call.id,
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
  input: { callId: string; payloadId: string; field: TerminalField; updatedBy: string; updatedAt: string },
) {
  const call = requireCall(state, input.callId)
  const payload = terminalPayload(state, input.payloadId)
  const current = currentTerminal(state, call)
  if (!payload || !current) return state
  const snapshot = { ...pickTerminal(current), [input.field]: terminalValue(payload, input.field) }
  const done = TERMINAL_FIELDS.every((field) => terminalValue(snapshot, field) === terminalValue(payload, field))
  const method = matchOf(state, call)?.method ?? 'AUTO'
  const saved = appendTerminalVersion(state, call, {
    snapshot,
    source: done ? 'SYNC' : 'USER',
    payloadId: payload.id,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  return appendMatch(saved.state, {
    call: freshCall(saved.state, call.id),
    terminalVersionId: saved.version.id,
    method: done ? 'AUTO' : method,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function acceptTerminalPayload(
  state: ScheduleState,
  input: { callId: string; payloadId: string; updatedBy: string; updatedAt: string; method?: MatchMethod },
) {
  const call = requireCall(state, input.callId)
  const payload = terminalPayload(state, input.payloadId)
  if (!payload) return state
  const saved = appendTerminalVersion(state, call, {
    snapshot: pickTerminal(payload),
    source: 'SYNC',
    payloadId: payload.id,
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  let next = appendMatch(saved.state, {
    call: freshCall(saved.state, call.id),
    terminalVersionId: saved.version.id,
    method: input.method ?? 'AUTO',
    reason: '',
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  const queryId = payload.queryId
  if (queryId && !shapeDecided(next, call.id, queryId)) {
    next = appendDecision(next, {
      callId: call.id,
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
  input: { callId: string; payloadId?: string; fields: Partial<TerminalSnapshot>; reason: string; updatedBy: string; updatedAt: string },
) {
  const call = requireCall(state, input.callId)
  const current = currentTerminal(state, call) ?? emptyTerminalSnapshot()
  const snapshot = { ...pickTerminal(current), ...input.fields }
  const saved = appendTerminalVersion(state, call, {
    snapshot,
    source: 'USER',
    payloadId: input.payloadId ?? null,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  let next = appendMatch(saved.state, {
    call: freshCall(saved.state, call.id),
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
      callId: call.id,
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

function freshCall(state: ScheduleState, callId: string) {
  return state.calls.find((call) => call.id === callId)!
}

function matchLabel(snapshot: TerminalSnapshot | null | undefined) {
  if (!snapshot) return ''
  return [snapshot.terminalName, snapshot.exportVoyage].filter(Boolean).join(' · ')
}

function sameIdentity(left: TerminalSnapshot, right: TerminalSnapshot) {
  return left.exportVoyage === right.exportVoyage
    && left.importVoyage === right.importVoyage
    && left.terminalCode === right.terminalCode
    && left.terminalName === right.terminalName
}

function latestLaraPayload(state: ScheduleState, callId: string) {
  return [...state.laraPayloads].reverse().find((payload) => payload.callId === callId)
}

function latestSettledQuery(state: ScheduleState, callId: string) {
  return [...state.terminalQueries].reverse().find(
    (item) => item.callId === callId && (item.status === 'FOUND' || item.status === 'NOT_FOUND'),
  )
}

function payloadsForQuery(state: ScheduleState, queryId: string) {
  return state.terminalPayloads.filter((payload) => payload.queryId === queryId)
}

export function reviewCall(state: ScheduleState, callId: string, policy: SyncPolicy = defaultSyncPolicy()): CallReview {
  const call = state.calls.find((item) => item.id === callId)
  const fields: FieldReview[] = []
  if (!call) return emptyReview(callId)
  const query = latestSettledQuery(state, callId)
  const terminalPayloads = query?.status === 'FOUND' ? payloadsForQuery(state, query.id) : []
  const terminal = currentTerminal(state, call)
  const bound = hasBoundMatch(state, callId)
  if (bound && terminal && query && !shapeDecided(state, callId, query.id)) {
    if (query.status === 'NOT_FOUND' || terminalPayloads.length > 1) {
      const shape: TerminalShape = query.status === 'NOT_FOUND' ? 'none' : 'many'
      const shapeFields: FieldReview[] = []
      if (policy.watched.has(watchKey('MATCH', MATCH_FIELD))) {
        shapeFields.push({
          side: 'MATCH',
          field: MATCH_FIELD,
          previousValue: matchLabel(terminal),
          incomingValue: shape === 'none' ? 'No terminal record' : `${terminalPayloads.length} terminal records`,
          status: 'pending',
          payloadId: query.id,
        })
      }
      return {
        callId,
        pending: true,
        changed: shapeFields.length > 0,
        fields: shapeFields,
        shape,
        candidateCount: terminalPayloads.length,
        queryId: query.id,
      }
    }
  }
  const currentLara = laraVersion(state, call.laraVersionId)
  const payload = latestLaraPayload(state, callId)
  if (currentLara && payload && bound) {
    const previous = laraVersionsOf(state, callId).find((version) => version.seq === currentLara.seq - 1)
    const held = heldLaraFields(state, call)
    for (const field of LARA_FIELDS) {
      const incoming = laraValue(payload, field)
      const value = laraValue(currentLara, field)
      const prior = laraValue(previous, field)
      const key = watchKey('LARA', field)
      if (!policy.watched.has(key)) continue
      if (!countsAsChange(key, value, incoming, policy) && value === prior) continue
      if (held.has(field) && countsAsChange(key, value, incoming, policy) && !laraDecided(state, callId, field, incoming)) {
        fields.push({ side: 'LARA', field, previousValue: value, incomingValue: incoming, status: 'pending', payloadId: payload.id })
      } else if (previous && currentLara.payloadId === payload.id && value !== prior && countsAsChange(key, prior, value, policy)) {
        fields.push({ side: 'LARA', field, previousValue: prior, incomingValue: value, status: 'applied', payloadId: payload.id })
      }
    }
  }
  const sole = terminalPayloads.length === 1 ? terminalPayloads[0] : undefined
  const match = matchOf(state, call)
  if (bound && sole && terminal) {
    const versions = terminalVersionsOf(state, callId)
    const previous = versions.find((version) => version.seq === terminal.seq - 1)
    const held = heldTerminalFields(state, call)
    for (const field of TERMINAL_FIELDS) {
      const incoming = terminalValue(sole, field)
      const value = terminalValue(terminal, field)
      const prior = terminalValue(previous, field)
      const key = watchKey('TERMINAL', field)
      if (!policy.watched.has(key)) continue
      if (held.has(field) && countsAsChange(key, value, incoming, policy) && !terminalDecided(state, callId, field, incoming)) {
        fields.push({ side: 'TERMINAL', field, previousValue: value, incomingValue: incoming, status: 'pending', payloadId: sole.id })
      } else if (previous && terminal.payloadId === sole.id && value !== prior && countsAsChange(key, prior, value, policy)) {
        fields.push({ side: 'TERMINAL', field, previousValue: prior, incomingValue: value, status: 'applied', payloadId: sole.id })
      }
    }
    const identityChanged = !sameIdentity(terminal, sole)
    if (
      identityChanged
      && match
      && terminal.payloadId === sole.id
      && policy.watched.has(watchKey('MATCH', MATCH_FIELD))
    ) {
      const priorMatch = state.matches.filter((item) => item.callId === callId && item.seq < match.seq).at(-1)
      const priorVersion = terminalVersion(state, priorMatch?.terminalVersionId)
      fields.push({
        side: 'MATCH',
        field: MATCH_FIELD,
        previousValue: matchLabel(priorVersion),
        incomingValue: matchLabel(terminal),
        status: 'applied',
        payloadId: sole.id,
      })
    }
  }
  return {
    callId,
    pending: fields.some((field) => field.status === 'pending'),
    changed: fields.length > 0,
    fields,
    shape: null,
    candidateCount: terminalPayloads.length,
    queryId: query?.id ?? null,
  }
}

export function laraFieldHistory(state: ScheduleState, callId: string, field: LaraField): FieldHistoryRow[] {
  const versions = laraVersionsOf(state, callId)
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

export function terminalFieldHistory(state: ScheduleState, callId: string, field: TerminalField): FieldHistoryRow[] {
  const versions = terminalVersionsOf(state, callId)
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

export function matchHistory(state: ScheduleState, callId: string) {
  return state.matches.filter((match) => match.callId === callId).sort((a, b) => a.seq - b.seq)
}
