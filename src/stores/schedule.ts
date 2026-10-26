import { defineStore } from 'pinia'
import { ref } from 'vue'

import { seedSchedule } from '@/domain/schedule-model/seed'
import {
  acceptLaraField,
  acceptTerminalField,
  acceptTerminalPayload,
  adoptNoTerminal,
  displayedLara,
  displayedTerminal,
  editLaraFields,
  editTerminalFields,
  keepLaraField,
  keepMatch,
  keepTerminalField,
  keepTerminalShape,
  laraFieldHistory,
  matchHistory,
  defaultSyncPolicy,
  reviewCall,
  terminalFieldHistory,
  watchKey,
  type CallReview,
  type FieldHistoryRow,
  type LaraField,
  type SyncPolicy,
  type TerminalField,
} from '@/domain/schedule-model'
import { bindingFor } from '@/features/vessel-schedule/sync-columns'
import { CURRENT_USER } from '@/mock/ports'
import { useListSettingsStore } from '@/stores/list-settings'
import { useVesselStore } from '@/stores/vessels'

export type SyncChoice = {
  side: 'LARA' | 'TERMINAL' | 'MATCH'
  field: string
  payloadId: string
  previousValue: string
  incomingValue: string
  typed: string
}

const COMPARED_STATUSES = new Set(['Auto matched', 'Manual matched'])

export const useScheduleStore = defineStore('schedule', () => {
  const vessels = useVesselStore()
  const listSettings = useListSettingsStore()
  const seeded = seedSchedule(vessels.vessels)
  const state = ref(seeded.state)
  for (const patch of seeded.patches) vessels.patchDisplay(patch.id, patch.fields)

  function policy(): SyncPolicy {
    const setting = listSettings.active
    if (!setting) return defaultSyncPolicy()
    const watched = new Set<string>()
    for (const id of setting.watchedFields) {
      const binding = bindingFor(id)
      if (binding) watched.add(watchKey(binding.side, binding.field))
    }
    const dayThreshold: Record<string, number> = {}
    for (const [id, days] of Object.entries(setting.watchedDayThresholds ?? {})) {
      const binding = bindingFor(id)
      if (!binding || days <= 0) continue
      dayThreshold[watchKey(binding.side, binding.field)] = days
    }
    return { watched, dayThreshold }
  }

  function review(callId: string): CallReview {
    const vessel = vessels.byId(callId)
    const result = reviewCall(state.value, callId, policy())
    if (!vessel || !COMPARED_STATUSES.has(vessel.matchingStatus)) {
      return { callId, pending: false, changed: false, fields: [], shape: null, candidateCount: 0, queryId: null }
    }
    return result
  }

  function candidates(callId: string) {
    const queryId = review(callId).queryId
    if (!queryId) return []
    return state.value.terminalPayloads.filter((payload) => payload.queryId === queryId)
  }

  function keepShape(callId: string) {
    const queryId = review(callId).queryId
    if (!queryId) return
    const at = new Date().toISOString()
    state.value = keepTerminalShape(state.value, { callId, queryId, updatedBy: CURRENT_USER, updatedAt: at })
  }

  function adoptNone(callId: string) {
    const queryId = review(callId).queryId
    if (!queryId) return
    const at = new Date().toISOString()
    state.value = adoptNoTerminal(state.value, { callId, queryId, updatedBy: CURRENT_USER, updatedAt: at })
    project(callId, true)
  }

  function adoptCandidate(callId: string, payloadId: string) {
    const at = new Date().toISOString()
    state.value = acceptTerminalPayload(state.value, {
      callId,
      payloadId,
      updatedBy: CURRENT_USER,
      updatedAt: at,
      method: 'USER',
    })
    project(callId)
  }

  function history(callId: string, columnId: string): FieldHistoryRow[] {
    const binding = bindingFor(columnId)
    if (!binding) return []
    if (binding.side === 'LARA') return laraFieldHistory(state.value, callId, binding.field)
    if (binding.side === 'TERMINAL') return terminalFieldHistory(state.value, callId, binding.field)
    return matchHistory(state.value, callId).map((match, index, all) => {
      const version = state.value.terminalVersions.find((item) => item.id === match.terminalVersionId)
      const prior = state.value.terminalVersions.find((item) => item.id === all[index - 1]?.terminalVersionId)
      return {
        seq: match.seq,
        previousValue: [prior?.terminalName, prior?.exportVoyage].filter(Boolean).join(' · '),
        nextValue: [version?.terminalName, version?.exportVoyage].filter(Boolean).join(' · ') || 'Unmatched',
        source: match.method === 'USER' ? 'USER' : 'SYNC',
        reason: match.reason,
        updatedBy: match.updatedBy,
        updatedAt: match.updatedAt,
      }
    })
  }

  function confirm(callId: string, choices: SyncChoice[]) {
    const at = new Date().toISOString()
    let next = state.value
    const match = choices.find((choice) => choice.side === 'MATCH')
    for (const choice of choices.filter((item) => item.side === 'LARA')) {
      next = settleLara(next, callId, choice, at)
    }
    if (match && match.typed.trim() === match.incomingValue) {
      next = acceptTerminalPayload(next, { callId, payloadId: match.payloadId, updatedBy: CURRENT_USER, updatedAt: at })
    } else {
      if (match) next = keepMatch(next, { callId, payloadId: match.payloadId, updatedBy: CURRENT_USER, updatedAt: at })
      for (const choice of choices.filter((item) => item.side === 'TERMINAL')) {
        next = settleTerminal(next, callId, choice, at)
      }
    }
    state.value = next
    project(callId)
  }

  function project(callId: string, clearTerminal = false) {
    const call = state.value.calls.find((item) => item.id === callId)
    if (!call) return
    const lara = displayedLara(state.value, call)
    const terminal = displayedTerminal(state.value, call)
    const fields: Parameters<typeof vessels.patchDisplay>[1] = {
      laraVoyage: lara.laraVoyage,
      pointCode: lara.pointCode,
      laraPoolLocation: lara.laraPoolLocation,
      multipleCallNumber: lara.multipleCallNumber,
      vesselName: lara.vesselName,
      vesselOperator: lara.vesselOperator,
      brand: lara.brand,
      service: lara.service,
      acPartner: lara.acPartner,
      laraEta: lara.laraEta,
      laraEtb: lara.laraEtb,
      laraEtd: lara.laraEtd,
      cutoff: lara.cutoff,
    }
    const versionId = state.value.matches.find((match) => match.id === call.matchId)?.terminalVersionId
    if (versionId) {
      fields.vesselOperator = terminal.vesselOperator
      fields.tmlEta = terminal.eta
      fields.tmlAta = terminal.ata
      fields.tmlEtb = terminal.etb
      fields.tmlAtb = terminal.atb
      fields.tmlEtd = terminal.etd
      fields.tmlAtd = terminal.atd
      fields.cyOpen = terminal.cyOpen
      fields.cyCutoff = terminal.cyCutoff
      fields.terminalName = terminal.terminalName
      fields.terminalScheduleStatus = terminal.vesselStatus
      fields.vesselNameCn = terminal.vesselNameCn
      fields.terminalUpdateTime = terminal.updateTime
      fields.externalVoyage = terminal.exportVoyage
      fields.externalExportVoyage = terminal.exportVoyage
      fields.externalImportVoyage = terminal.importVoyage
      fields.localVoyage = terminal.exportVoyage
    } else if (clearTerminal) {
      fields.tmlEta = ''
      fields.tmlAta = ''
      fields.tmlEtb = ''
      fields.tmlAtb = ''
      fields.tmlEtd = ''
      fields.tmlAtd = ''
      fields.cyOpen = ''
      fields.cyCutoff = ''
      fields.terminalScheduleStatus = ''
      fields.vesselNameCn = ''
      fields.terminalUpdateTime = ''
      fields.externalVoyage = ''
      fields.externalExportVoyage = ''
      fields.externalImportVoyage = ''
      fields.localVoyage = ''
      vessels.markNoTerminal(callId)
    }
    vessels.patchDisplay(callId, fields)
  }

  return { review, history, confirm, candidates, keepShape, adoptNone, adoptCandidate }
})

function settleLara(state: ReturnType<typeof seedSchedule>['state'], callId: string, choice: SyncChoice, at: string) {
  const typed = choice.typed.trim()
  if (typed === choice.incomingValue) {
    return acceptLaraField(state, { callId, payloadId: choice.payloadId, field: choice.field as LaraField, updatedBy: CURRENT_USER, updatedAt: at })
  }
  if (!typed || typed === choice.previousValue) {
    return keepLaraField(state, { callId, payloadId: choice.payloadId, field: choice.field as LaraField, updatedBy: CURRENT_USER, updatedAt: at })
  }
  return editLaraFields(state, {
    callId,
    payloadId: choice.payloadId,
    fields: { [choice.field]: typed },
    reason: 'Confirmed sync value',
    updatedBy: CURRENT_USER,
    updatedAt: at,
  })
}

function settleTerminal(state: ReturnType<typeof seedSchedule>['state'], callId: string, choice: SyncChoice, at: string) {
  const typed = choice.typed.trim()
  if (typed === choice.incomingValue) {
    return acceptTerminalField(state, { callId, payloadId: choice.payloadId, field: choice.field as TerminalField, updatedBy: CURRENT_USER, updatedAt: at })
  }
  if (!typed || typed === choice.previousValue) {
    return keepTerminalField(state, { callId, payloadId: choice.payloadId, field: choice.field as TerminalField, updatedBy: CURRENT_USER, updatedAt: at })
  }
  return editTerminalFields(state, {
    callId,
    payloadId: choice.payloadId,
    fields: { [choice.field]: typed },
    reason: 'Confirmed sync value',
    updatedBy: CURRENT_USER,
    updatedAt: at,
  })
}
