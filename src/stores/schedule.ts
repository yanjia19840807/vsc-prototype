import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { seedSchedule } from '@/domain/schedule-model/seed'
import {
  acceptLaraField,
  acceptTerminalField,
  acceptTerminalPayload,
  confirmReviewedMatch,
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
  pinTerminalCandidate,
  defaultSyncPolicy,
  displayedLastSyncStatus,
  displayedMatchingStatus,
  reviewSchedule,
  terminalFieldHistory,
  watchKey,
  type ScheduleReview,
  type FieldHistoryRow,
  type LaraField,
  type SyncPolicy,
  type TerminalField,
} from '@/domain/schedule-model'
import { scheduleNeedsReview } from '@/features/vessel-schedule/review-access'
import type { TerminalSchedule } from '@/types/vsp'
import { pickTerminal } from '@/domain/schedule-model/snapshot'
import type { TerminalSnapshot } from '@/domain/schedule-model/types'
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

export const useScheduleStore = defineStore('schedule', () => {
  const vessels = useVesselStore()
  const listSettings = useListSettingsStore()
  const seeded = seedSchedule(vessels.vessels)
  const state = ref(seeded.state)
  const payloadState = computed(() => state.value)
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

  function review(scheduleId: string): ScheduleReview {
    return reviewSchedule(state.value, scheduleId, policy())
  }

  function needsReview(scheduleId: string) {
    const vessel = vessels.byId(scheduleId)
    if (!vessel) return false
    return scheduleNeedsReview(vessel, review(scheduleId))
  }

  function candidates(scheduleId: string) {
    const queryId = review(scheduleId).queryId
    if (!queryId) return []
    return state.value.terminalPayloads.filter((payload) => payload.queryId === queryId)
  }

  function keepShape(scheduleId: string) {
    const queryId = review(scheduleId).queryId
    if (!queryId) return
    const at = new Date().toISOString()
    state.value = keepTerminalShape(state.value, { scheduleId, queryId, updatedBy: CURRENT_USER, updatedAt: at })
  }

  function adoptCandidate(scheduleId: string, payloadId: string) {
    const at = new Date().toISOString()
    const review = reviewSchedule(state.value, scheduleId, policy())
    const schedule = state.value.schedules.find((item) => item.id === scheduleId)
    const manual = schedule ? state.value.matches.find((item) => item.id === schedule.matchId)?.method === 'USER' : false
    if (review.shape === 'many' && manual) {
      state.value = pinTerminalCandidate(state.value, {
        scheduleId,
        payloadId,
        updatedBy: CURRENT_USER,
        updatedAt: at,
      })
      return
    }
    state.value = acceptTerminalPayload(state.value, {
      scheduleId,
      payloadId,
      updatedBy: CURRENT_USER,
      updatedAt: at,
      method: 'USER',
    })
    project(scheduleId)
  }

  function sealReviewed(
    scheduleId: string,
    row: TerminalSchedule,
    vesselOperator: string,
    reason: string,
    enteredManually = false,
    adopted?: { source: 'SYNC'; payloadId: string; snapshot: TerminalSnapshot },
  ) {
    const at = new Date().toISOString()
    const snapshot: TerminalSnapshot = adopted
      ? pickTerminal(adopted.snapshot)
      : {
          vesselOperator,
          exportVoyage: row.evoyage ?? '',
          importVoyage: row.ivoyage ?? '',
          vesselNameCn: row.vesselNameCn ?? '',
          terminalName: row.terminal ?? '',
          eta: row.eta ?? '',
          ata: row.ata ?? '',
          etb: row.etb ?? '',
          atb: row.atb ?? '',
          etd: row.etd ?? '',
          atd: row.atd ?? '',
          cyOpen: row.cyOpen ?? '',
          cyCutoff: row.cyClosing ?? '',
          vesselStatus: row.status ?? '',
          updateTime: row.updateTime ?? '',
        }
    state.value = confirmReviewedMatch(state.value, {
      scheduleId,
      snapshot,
      enteredManually: adopted ? false : enteredManually,
      reason,
      updatedBy: CURRENT_USER,
      updatedAt: at,
      source: adopted?.source,
      payloadId: adopted?.payloadId,
    })
    project(scheduleId)
  }

  function history(scheduleId: string, columnId: string): FieldHistoryRow[] {
    const binding = bindingFor(columnId)
    if (!binding) return []
    if (binding.side === 'LARA') return laraFieldHistory(state.value, scheduleId, binding.field)
    if (binding.side === 'TERMINAL') return terminalFieldHistory(state.value, scheduleId, binding.field)
    return matchHistory(state.value, scheduleId).map((match, index, all) => {
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

  function confirm(scheduleId: string, choices: SyncChoice[]) {
    const at = new Date().toISOString()
    let next = state.value
    const match = choices.find((choice) => choice.side === 'MATCH')
    for (const choice of choices.filter((item) => item.side === 'LARA')) {
      next = settleLara(next, scheduleId, choice, at)
    }
    if (match && match.typed.trim() === match.incomingValue) {
      next = acceptTerminalPayload(next, { scheduleId, payloadId: match.payloadId, updatedBy: CURRENT_USER, updatedAt: at })
    } else {
      if (match) next = keepMatch(next, { scheduleId, payloadId: match.payloadId, updatedBy: CURRENT_USER, updatedAt: at })
      for (const choice of choices.filter((item) => item.side === 'TERMINAL')) {
        next = settleTerminal(next, scheduleId, choice, at)
      }
    }
    state.value = next
    project(scheduleId)
  }

  function project(scheduleId: string, clearTerminal = false) {
    const schedule = state.value.schedules.find((item) => item.id === scheduleId)
    if (!schedule) return
    const lara = displayedLara(state.value, schedule)
    const terminal = displayedTerminal(state.value, schedule)
    const fields: Parameters<typeof vessels.patchDisplay>[1] = {
      lastSyncStatus: displayedLastSyncStatus(state.value, scheduleId) ?? '',
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
    const match = state.value.matches.find((item) => item.id === schedule.matchId)
    const versionId = match?.terminalVersionId
    const version = versionId ? state.value.terminalVersions.find((item) => item.id === versionId) : undefined
    const status = displayedMatchingStatus(state.value, scheduleId)
    if (status === 'Multiple terminal records' || status === 'No terminal record') {
      vessels.patchDisplay(scheduleId, fields)
      if (status === 'Multiple terminal records') vessels.markMultiple(scheduleId)
      else vessels.markNoTerminal(scheduleId)
      return
    }
    if (status === 'Manual matched' || status === 'Pending match') {
      fields.matchingStatus = status
    } else if (status) {
      fields.matchingStatus = status
      fields.terminalSource = 'freightower'
    }
    if (versionId) {
      fields.terminalSource = version?.enteredManually ? 'manual' : 'freightower'
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
      vessels.markNoTerminal(scheduleId)
    }
    vessels.patchDisplay(scheduleId, fields)
  }

  for (const schedule of state.value.schedules) project(schedule.id)

  return { review, needsReview, history, confirm, candidates, keepShape, adoptCandidate, sealReviewed, payloadState }
})

function settleLara(state: ReturnType<typeof seedSchedule>['state'], scheduleId: string, choice: SyncChoice, at: string) {
  const typed = choice.typed.trim()
  if (typed === choice.incomingValue) {
    return acceptLaraField(state, { scheduleId, payloadId: choice.payloadId, field: choice.field as LaraField, updatedBy: CURRENT_USER, updatedAt: at })
  }
  if (!typed || typed === choice.previousValue) {
    return keepLaraField(state, { scheduleId, payloadId: choice.payloadId, field: choice.field as LaraField, updatedBy: CURRENT_USER, updatedAt: at })
  }
  return editLaraFields(state, {
    scheduleId,
    payloadId: choice.payloadId,
    fields: { [choice.field]: typed },
    reason: 'Confirmed sync value',
    updatedBy: CURRENT_USER,
    updatedAt: at,
  })
}

function settleTerminal(state: ReturnType<typeof seedSchedule>['state'], scheduleId: string, choice: SyncChoice, at: string) {
  const typed = choice.typed.trim()
  if (typed === choice.incomingValue) {
    return acceptTerminalField(state, { scheduleId, payloadId: choice.payloadId, field: choice.field as TerminalField, updatedBy: CURRENT_USER, updatedAt: at })
  }
  if (!typed || typed === choice.previousValue) {
    return keepTerminalField(state, { scheduleId, payloadId: choice.payloadId, field: choice.field as TerminalField, updatedBy: CURRENT_USER, updatedAt: at })
  }
  return editTerminalFields(state, {
    scheduleId,
    payloadId: choice.payloadId,
    fields: { [choice.field]: typed },
    reason: 'Confirmed sync value',
    updatedBy: CURRENT_USER,
    updatedAt: at,
  })
}
