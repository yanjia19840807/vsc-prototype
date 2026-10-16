import {
  displayedTerminalField,
  manualField,
  manualTerminalOf,
  TERMINAL_FIELDS,
} from '@/domain/schedule-model/display'
import { appendFieldChanges } from '@/domain/schedule-model/history'
import { isLinkTarget, nextId } from '@/domain/schedule-model/state'
import type {
  BindingMode,
  BindingSource,
  FieldHistoryCause,
  ScheduleState,
  TerminalBinding,
  VesselCall,
} from '@/domain/schedule-model/types'

type BindingShape = { mode: BindingMode; candidateId: string | null } | null

export function setTerminalBinding(
  state: ScheduleState,
  input: {
    call: VesselCall
    mode: BindingMode
    candidateId: string | null
    source: BindingSource
    cause: FieldHistoryCause
    reason?: string
    updatedBy: string
    updatedAt: string
  },
) {
  if (isLinkTarget(state, input.call.id)) return state
  const current = state.bindings.find((binding) => binding.callId === input.call.id) ?? null
  const before = shapeOf(current)
  const after: BindingShape = { mode: input.mode, candidateId: input.candidateId }
  if (sameShape(before, after) && current?.source === input.source) return state

  let next = state
  if (!current) {
    const issued = nextId(next, 'binding')
    const binding: TerminalBinding = {
      id: issued.id,
      callId: input.call.id,
      mode: input.mode,
      candidateId: input.candidateId,
      source: input.source,
      reason: input.reason ?? '',
      updatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    }
    next = { ...issued.state, bindings: [...issued.state.bindings, binding] }
  } else {
    next = {
      ...next,
      bindings: next.bindings.map((binding) =>
        binding.id === current.id
          ? {
              ...binding,
              mode: input.mode,
              candidateId: input.candidateId,
              source: input.source,
              reason: input.reason ?? binding.reason,
              updatedBy: input.updatedBy,
              updatedAt: input.updatedAt,
            }
          : binding,
      ),
    }
  }
  return recordBindingDiff(state, next, input.call, before, after, input)
}

export function clearAutoBinding(
  state: ScheduleState,
  call: VesselCall,
  at: string,
  by: string,
) {
  const current = state.bindings.find((binding) => binding.callId === call.id)
  if (!current || current.source === 'MANUAL') return state
  const before = shapeOf(current)
  const next = { ...state, bindings: state.bindings.filter((binding) => binding.id !== current.id) }
  return recordBindingDiff(state, next, call, before, null, {
    cause: 'BINDING',
    reason: '',
    updatedBy: by,
    updatedAt: at,
  })
}

function recordBindingDiff(
  beforeState: ScheduleState,
  afterState: ScheduleState,
  call: VesselCall,
  before: BindingShape,
  after: BindingShape,
  meta: { cause: FieldHistoryCause; reason?: string; updatedBy: string; updatedAt: string },
) {
  const manualFields = manualTerminalOf(afterState, call)?.fields
  const association = [
    { field: 'mode', originalValue: before?.mode ?? '', updatedValue: after?.mode ?? '' },
    { field: 'candidateId', originalValue: before?.candidateId ?? '', updatedValue: after?.candidateId ?? '' },
  ]
  const displayed = TERMINAL_FIELDS.filter((field) => !manualField(manualFields, field)).map((field) => ({
    field,
    originalValue: displayedTerminalField(beforeState, call, field),
    updatedValue: displayedTerminalField(afterState, call, field),
  }))
  return appendFieldChanges(afterState, [
    ...association.map((change) => ({ callId: call.id, ...change, cause: meta.cause, reason: meta.reason, updatedBy: meta.updatedBy, updatedAt: meta.updatedAt })),
    ...displayed.map((change) => ({ callId: call.id, ...change, cause: 'BINDING' as const, reason: meta.reason, updatedBy: meta.updatedBy, updatedAt: meta.updatedAt })),
  ])
}

function shapeOf(binding: TerminalBinding | null): BindingShape {
  if (!binding) return null
  return { mode: binding.mode, candidateId: binding.candidateId }
}

function sameShape(before: BindingShape, after: BindingShape) {
  return before?.mode === after?.mode && before?.candidateId === after?.candidateId
}
