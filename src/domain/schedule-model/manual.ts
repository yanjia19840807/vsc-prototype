import { setTerminalBinding } from '@/domain/schedule-model/binding'
import {
  assertEditable,
  displayedLaraField,
  displayedTerminalField,
  LARA_FIELDS,
  laraRecordOf,
  laraSourceValue,
  TERMINAL_FIELDS,
  terminalSourceValue,
  candidateOf,
  bindingOf,
  type LaraField,
  type TerminalField,
} from '@/domain/schedule-model/display'
import { appendFieldChanges } from '@/domain/schedule-model/history'
import { nextId } from '@/domain/schedule-model/state'
import type { ManualField, ScheduleState, VesselCall } from '@/domain/schedule-model/types'

export function editLaraField(
  state: ScheduleState,
  input: { callId: string; field: LaraField; manualValue: string; reason: string; updatedBy: string; updatedAt: string },
) {
  const call = requireEditable(state, input.callId)
  if (!LARA_FIELDS.includes(input.field)) throw new Error('Unknown LARA field')
  const originalValue = displayedLaraField(state, call, input.field)
  const sourceBaseline = laraSourceValue(laraRecordOf(state, call), input.field)
  const saved = upsertManualLaraField(state, call, {
    field: input.field,
    manualValue: input.manualValue,
    sourceBaseline,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  return appendFieldChanges(saved.state, [
    {
      callId: call.id,
      field: input.field,
      originalValue,
      updatedValue: input.manualValue,
      cause: 'USER',
      reason: input.reason,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    },
  ])
}

export function editTerminalField(
  state: ScheduleState,
  input: { callId: string; field: TerminalField; manualValue: string; reason: string; updatedBy: string; updatedAt: string },
) {
  const call = requireEditable(state, input.callId)
  if (!TERMINAL_FIELDS.includes(input.field)) throw new Error('Unknown terminal field')
  const originalValue = displayedTerminalField(state, call, input.field)
  const binding = bindingOf(state, call.id)
  const sourceBaseline =
    binding?.mode === 'CANDIDATE' ? terminalSourceValue(candidateOf(state, binding.candidateId), input.field) : ''
  const saved = upsertManualTerminalField(state, call, {
    field: input.field,
    manualValue: input.manualValue,
    sourceBaseline,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  return appendFieldChanges(saved.state, [
    {
      callId: call.id,
      field: input.field,
      originalValue,
      updatedValue: input.manualValue,
      cause: 'USER',
      reason: input.reason,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    },
  ])
}

/** Enter a whole terminal schedule when the call has no candidate. */
export function supplementTerminal(
  state: ScheduleState,
  input: {
    callId: string
    fields: Partial<Record<TerminalField, string>>
    reason: string
    updatedBy: string
    updatedAt: string
  },
) {
  const call = requireEditable(state, input.callId)
  let next = state
  const changes: Array<{ field: string; originalValue: string; updatedValue: string }> = []
  for (const field of TERMINAL_FIELDS) {
    const value = input.fields[field]
    if (value == null) continue
    const originalValue = displayedTerminalField(next, call, field)
    const saved = upsertManualTerminalField(next, freshCall(next, call.id), {
      field,
      manualValue: value,
      sourceBaseline: '',
      reason: input.reason,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    })
    next = saved.state
    changes.push({ field, originalValue, updatedValue: value })
  }
  next = setTerminalBinding(next, {
    call: freshCall(next, call.id),
    mode: 'MANUAL',
    candidateId: null,
    source: 'MANUAL',
    cause: 'USER',
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
  return appendFieldChanges(
    next,
    changes.map((change) => ({
      callId: call.id,
      ...change,
      cause: 'USER' as const,
      reason: input.reason,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    })),
  )
}

export function confirmTerminalCandidate(
  state: ScheduleState,
  input: { callId: string; candidateId: string; reason: string; updatedBy: string; updatedAt: string },
) {
  const call = requireEditable(state, input.callId)
  const candidate = state.terminalCandidates.find((item) => item.id === input.candidateId)
  if (!candidate) throw new Error('Terminal candidate was not found')
  const query = state.terminalQueries.find((item) => item.id === candidate.queryId)
  if (!query || query.internalVoyage !== call.internalVoyage || query.poolLocation !== call.poolLocation) {
    throw new Error('Terminal candidate belongs to another call')
  }
  return setTerminalBinding(state, {
    call,
    mode: 'CANDIDATE',
    candidateId: candidate.id,
    source: 'MANUAL',
    cause: 'USER',
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  })
}

export function restoreLaraField(
  state: ScheduleState,
  input: { callId: string; field: LaraField; reason: string; updatedBy: string; updatedAt: string },
) {
  const call = requireEditable(state, input.callId)
  const originalValue = displayedLaraField(state, call, input.field)
  const removed = removeManualField(state, 'lara', call, input.field)
  const updatedValue = displayedLaraField(removed, freshCall(removed, call.id), input.field)
  return appendFieldChanges(removed, [
    {
      callId: call.id,
      field: input.field,
      originalValue,
      updatedValue,
      cause: 'USER',
      reason: input.reason,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    },
  ])
}

export function acceptLaraSource(
  state: ScheduleState,
  input: { callId: string; field: LaraField; reason: string; updatedBy: string; updatedAt: string },
) {
  const call = requireEditable(state, input.callId)
  const latest = laraSourceValue(laraRecordOf(state, call), input.field)
  return editLaraField(state, { ...input, manualValue: latest })
}

export function createManualCall(
  state: ScheduleState,
  input: {
    internalVoyage: string
    poolLocation: string
    fields: Partial<Record<LaraField, string>>
    reason: string
    updatedBy: string
    updatedAt: string
  },
) {
  const issued = nextId(state, 'call')
  const manualIssued = nextId(issued.state, 'manual-lara')
  const call: VesselCall = {
    id: issued.id,
    origin: 'MANUAL',
    internalVoyage: input.internalVoyage,
    poolLocation: input.poolLocation,
    portCode: input.fields.portCode ?? '',
    laraRecordId: null,
    platformOmit: false,
    manualLaraId: manualIssued.id,
    manualTerminalId: null,
  }
  const fields: ManualField[] = []
  for (const field of LARA_FIELDS) {
    const value = input.fields[field]
    if (!value) continue
    fields.push({
      field,
      manualValue: value,
      sourceBaseline: '',
      reason: input.reason,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    })
  }
  if (input.internalVoyage) {
    fields.push(blankField('internalVoyage', input.internalVoyage, input))
  }
  if (input.poolLocation) {
    fields.push(blankField('poolLocation', input.poolLocation, input))
  }
  let next: ScheduleState = {
    ...manualIssued.state,
    calls: [...manualIssued.state.calls, call],
    manualLaras: [...manualIssued.state.manualLaras, { id: manualIssued.id, callId: call.id, fields }],
  }
  return appendFieldChanges(
    next,
    fields.map((field) => ({
      callId: call.id,
      field: field.field,
      originalValue: '',
      updatedValue: field.manualValue,
      cause: 'USER' as const,
      reason: input.reason,
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    })),
  )
}

export function deleteManualCall(state: ScheduleState, callId: string) {
  const call = requireEditable(state, callId)
  if (call.origin !== 'MANUAL') throw new Error('Only a manual call can be deleted')
  if (state.laraLinks.some((link) => link.sourceCallId === callId)) {
    throw new Error('A linked manual call stays inactive and cannot be deleted')
  }
  return {
    ...state,
    calls: state.calls.filter((item) => item.id !== callId),
    bindings: state.bindings.filter((item) => item.callId !== callId),
  }
}

function blankField(
  field: string,
  manualValue: string,
  input: { reason: string; updatedBy: string; updatedAt: string },
): ManualField {
  return {
    field,
    manualValue,
    sourceBaseline: '',
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  }
}

function upsertManualLaraField(state: ScheduleState, call: VesselCall, field: ManualField) {
  return upsertManual(state, call, 'lara', field)
}

function upsertManualTerminalField(state: ScheduleState, call: VesselCall, field: ManualField) {
  return upsertManual(state, call, 'terminal', field)
}

function upsertManual(state: ScheduleState, call: VesselCall, side: 'lara' | 'terminal', field: ManualField) {
  const idField = side === 'lara' ? 'manualLaraId' : 'manualTerminalId'
  const collection = side === 'lara' ? 'manualLaras' : 'manualTerminals'
  const existingId = call[idField]
  if (!existingId) {
    const issued = nextId(state, side === 'lara' ? 'manual-lara' : 'manual-terminal')
    const manual = { id: issued.id, callId: call.id, fields: [field] }
    return {
      state: {
        ...issued.state,
        [collection]: [...issued.state[collection], manual],
        calls: issued.state.calls.map((item) => (item.id === call.id ? { ...item, [idField]: issued.id } : item)),
      },
    }
  }
  return {
    state: {
      ...state,
      [collection]: state[collection].map((manual) => {
        if (manual.id !== existingId) return manual
        const fields = manual.fields.some((item) => item.field === field.field)
          ? manual.fields.map((item) => (item.field === field.field ? field : item))
          : [...manual.fields, field]
        return { ...manual, fields }
      }),
    },
  }
}

function removeManualField(state: ScheduleState, side: 'lara' | 'terminal', call: VesselCall, field: string) {
  const collection = side === 'lara' ? 'manualLaras' : 'manualTerminals'
  const manualId = side === 'lara' ? call.manualLaraId : call.manualTerminalId
  return {
    ...state,
    [collection]: state[collection].map((manual) =>
      manual.id === manualId ? { ...manual, fields: manual.fields.filter((item) => item.field !== field) } : manual,
    ),
  }
}

function freshCall(state: ScheduleState, callId: string) {
  return state.calls.find((item) => item.id === callId)!
}

function requireEditable(state: ScheduleState, callId: string) {
  const call = state.calls.find((item) => item.id === callId)
  if (!call) throw new Error('Vessel call was not found')
  assertEditable(state, call)
  return call
}
