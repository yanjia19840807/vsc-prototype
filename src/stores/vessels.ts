import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { CURRENT_USER, PORTS } from '@/mock/ports'
import { portCanCallFeituo } from '@/features/terminal-coverage/model'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { createInitialVessels, refreshSharedTerminal } from '@/mock/vessels'
import type {
  HistoryDetail,
  HistoryEntry,
  HistoryTrigger,
  HistoryType,
  MatchChange,
  MatchingStatus,
  ScheduleRefresh,
  TerminalSchedule,
  VesselRecord,
  VolumeData,
  WorkflowStatus,
} from '@/types/vsp'
import type { ManualVesselInput } from '@/features/vessel-schedule/manual-vessel-schemas'
import { appendScheduleLogs, changesFromDetails, createRefresh, traceFromHistory } from '@/domain/schedule-trace'
import { isLaraLinkTarget, laraLinkKey } from '@/features/vessel-schedule/lara-link'
import { formatApiDateTime, formatDateTime } from '@/lib/vessel-utils'

function maintainedRegion(pointCode: string) {
  const port = useTerminalCoverageStore().ports.find((row) => row.portCode === pointCode)
  if (port) return port.regionCode
  return PORTS.find((row) => row.code === pointCode)?.region ?? ''
}

function matchingStatusForManualAdd(pointCode: string): MatchingStatus {
  return portCanCallFeituo(useTerminalCoverageStore().ports, pointCode)
    ? 'Pending match'
    : 'No terminal record'
}

function laraVesselTypeOf(v: VesselRecord): ManualVesselInput['vesselType'] {
  if (v.groupKind === 'Partner Vessel') return 'Partner vsl'
  if (v.groupKind === '3PF') return '3PF'
  return 'Group vsl'
}

function laraIdentity(
  type: ManualVesselInput['vesselType'],
): Pick<VesselRecord, 'groupKind' | 'vesselType' | 'oaFlag'> {
  if (type === 'Partner vsl') {
    return { groupKind: 'Partner Vessel', vesselType: 'MV', oaFlag: 'non-OA' }
  }
  if (type === '3PF') {
    return { groupKind: '3PF', vesselType: '3PF', oaFlag: 'non-OA' }
  }
  return { groupKind: 'Group Vessel', vesselType: 'MV', oaFlag: 'OA' }
}

function emptyTerminalSchedule(vessel: VesselRecord): TerminalSchedule {
  return {
    status: null,
    vesselNameEn: vessel.vesselName,
    vesselNameCn: null,
    shipCode: vessel.shipCode || null,
    shipName: null,
    agentCode: vessel.agentCode || null,
    agentName: null,
    lineCode: null,
    terminal: null,
    portsEn: vessel.portsOfCall || null,
    portsCn: null,
    eta: null,
    ata: null,
    etb: null,
    atb: null,
    etd: null,
    atd: null,
    cyOpen: null,
    cyClosing: null,
    portCloseDate: null,
    customsCloseDate: null,
    updateTime: null,
    ivoyage: null,
    evoyage: null,
  }
}

export type ScheduleFilters = {
  regions: string[]
  pointCodes: string[]
  years: string[]
  vesselTypes: string[]
  oaFlags: string[]
  pics: string[]
  workflowStatuses: string[]
  voyageStatuses: string[]
  groupKinds: string[]
  matchingStatuses: string[]
  globalSearch: string
  laraEtbFrom: string
  laraEtbTo: string
  laraEtdFrom: string
  laraEtdTo: string
  tmlAtdFrom: string
  tmlAtdTo: string
  completedFrom: string
  completedTo: string
}

const emptyFilters = (): ScheduleFilters => ({
  regions: [],
  pointCodes: [],
  years: [],
  vesselTypes: [],
  oaFlags: [],
  pics: [],
  workflowStatuses: [],
  voyageStatuses: [],
  groupKinds: [],
  matchingStatuses: [],
  globalSearch: '',
  laraEtbFrom: '',
  laraEtbTo: '',
  laraEtdFrom: '',
  laraEtdTo: '',
  tmlAtdFrom: '',
  tmlAtdTo: '',
  completedFrom: '',
  completedTo: '',
})

function inRange(iso: string, from: string, to: string) {
  if (!iso) return !(from || to)
  const t = new Date(iso).getTime()
  if (from && t < new Date(from).getTime()) return false
  if (to && t > new Date(to + 'T23:59:59').getTime()) return false
  return true
}

export const useVesselStore = defineStore('vessels', () => {
  const vessels = ref<VesselRecord[]>(createInitialVessels())
  const refreshes = ref<ScheduleRefresh[]>(traceFromHistory(vessels.value))
  const filters = ref<ScheduleFilters>(emptyFilters())
  const selectedIds = ref<string[]>([])
  const lastRefreshTime = ref(formatDateTime(new Date().toISOString()))
  const refreshFailed = ref(false)
  const sortKey = ref<string>('laraEtd')
  const sortDir = ref<'asc' | 'desc'>('asc')

  const activeVessels = computed(() =>
    vessels.value.filter((v) => v.workflowStatus !== 'Completed' || !v.completedDate),
  )

  const historyVessels = computed(() =>
    vessels.value.filter((v) => v.workflowStatus === 'Completed' && Boolean(v.completedDate)),
  )

  function applyFilters(list: VesselRecord[]) {
    const f = filters.value
    const q = f.globalSearch.trim().toLowerCase()
    return list.filter((v) => {
      if (f.regions.length && !f.regions.includes(v.region)) return false
      if (f.pointCodes.length && !f.pointCodes.includes(v.pointCode)) return false
      if (f.years.length && !f.years.includes(String(v.year))) return false
      if (f.vesselTypes.length && !f.vesselTypes.includes(v.vesselType)) return false
      if (f.oaFlags.length && !f.oaFlags.includes(v.oaFlag)) return false
      if (f.pics.length && !f.pics.includes(v.pic)) return false
      if (f.workflowStatuses.length && !f.workflowStatuses.includes(v.workflowStatus)) return false
      if (f.voyageStatuses.length && !f.voyageStatuses.includes(v.voyageStatus)) return false
      if (f.groupKinds.length && !f.groupKinds.includes(v.groupKind)) return false
      if (f.matchingStatuses.length && !f.matchingStatuses.includes(v.matchingStatus)) return false
      if (!inRange(v.laraEtb, f.laraEtbFrom, f.laraEtbTo)) return false
      if (!inRange(v.laraEtd, f.laraEtdFrom, f.laraEtdTo)) return false
      if (!inRange(v.tmlAtd, f.tmlAtdFrom, f.tmlAtdTo)) return false
      if (!inRange(v.completedDate || '', f.completedFrom, f.completedTo)) return false
      if (q) {
        const hay = [
          v.service,
          v.vesselName,
          v.terminalSchedule?.vesselNameCn,
          v.laraVoyage,
          v.localVoyage,
          v.externalVoyage,
          v.terminalName,
          v.remark,
          v.owner,
          v.pic,
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }

  function listActive() {
    return applyFilters(
      vessels.value.filter((v) => {
        if (v.workflowStatus !== 'Completed') return true
        return !v.completedDate
      }),
    )
  }

  const filteredActive = computed(() => sortList(listActive()))

  const filteredHistory = computed(() => sortList(applyFilters(historyVessels.value)))

  function sortList(list: VesselRecord[]) {
    const key = sortKey.value as keyof VesselRecord
    const dir = sortDir.value === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const av = String(a[key] ?? '')
      const bv = String(b[key] ?? '')
      return av.localeCompare(bv) * dir
    })
  }

  function byId(id: string) {
    return vessels.value.find((v) => v.id === id)
  }

  function refreshById(id: string) {
    return refreshes.value.find((item) => item.id === id)
  }

  function recordTerminalRefresh(
    vessel: VesselRecord,
    input: {
      trigger: ScheduleRefresh['trigger']
      at: string
      result?: ScheduleRefresh['result']
      failureSource?: ScheduleRefresh['failureSource']
      changes?: HistoryDetail[]
    },
  ) {
    const refresh = createRefresh({
      source: 'Terminal',
      trigger: input.trigger,
      refreshTime: input.at,
      updatedBy: input.trigger === 'Manual' ? CURRENT_USER : 'System',
      result: input.result,
      failureSource: input.failureSource,
      vessel,
    })
    refreshes.value.unshift(refresh)
    appendScheduleLogs(vessel, changesFromDetails(input.changes ?? []), {
      updateSource: 'System Sync',
      refreshId: refresh.id,
      updatedTime: input.at,
      updatedBy: 'System',
    })
    return refresh
  }

  function pushLog(v: VesselRecord, action: string, detail?: string) {
    v.activityLog.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      user: CURRENT_USER,
      action,
      detail,
    })
  }

  function pushHistory(
    v: VesselRecord,
    input: {
      type: HistoryType
      trigger?: HistoryTrigger
      by?: string
      reason?: string
      summary: string
      details?: HistoryDetail[]
      at?: string
    },
  ) {
    appendScheduleLogs(v, changesFromDetails(input.details ?? []), {
      updateSource: 'Manual Update',
      updatedTime: input.at ?? new Date().toISOString(),
      updatedBy: input.by ?? CURRENT_USER,
      reason: input.reason,
      match: input.type === 'Manual match',
    })
  }

  function clearFilters() {
    filters.value = emptyFilters()
  }

  function toggleSelect(id: string) {
    if (selectedIds.value.includes(id)) {
      selectedIds.value = selectedIds.value.filter((x) => x !== id)
    } else {
      selectedIds.value = [...selectedIds.value, id]
    }
  }

  function selectMany(ids: string[]) {
    selectedIds.value = [...new Set([...selectedIds.value, ...ids])]
  }

  function deselectMany(ids: string[]) {
    const drop = new Set(ids)
    selectedIds.value = selectedIds.value.filter((id) => !drop.has(id))
  }

  function clearSelection() {
    selectedIds.value = []
  }

  function takeVessels(ids: string[]) {
    const now = new Date().toISOString()
    const ok: string[] = []
    const fail: string[] = []
    for (const id of ids) {
      const v = byId(id)
      if (!v) continue
      if (v.owner && v.owner !== CURRENT_USER) {
        fail.push(v.vesselName)
        continue
      }
      v.owner = CURRENT_USER
      v.takeBy = CURRENT_USER
      v.takeTime = now
      if (v.workflowStatus === 'New') v.workflowStatus = 'In Progress'
      v.tasks.forEach((t) => {
        if (!t.owner) t.owner = CURRENT_USER
        if (t.status === 'New') t.status = 'In Progress'
      })
      pushLog(v, 'Take vessel')
      ok.push(v.vesselName)
    }
    return { ok, fail }
  }

  function reassign(id: string, newOwner: string, reason: string) {
    const v = byId(id)
    if (!v) return
    const prev = v.owner
    v.owner = newOwner
    v.takeBy = newOwner
    v.takeTime = new Date().toISOString()
    pushLog(v, 'Reassign', `${prev || '—'} → ${newOwner}; ${reason}`)
  }

  function releaseTake(id: string) {
    const v = byId(id)
    if (!v) return false
    const started = v.tasks.some((t) => t.checkpoints.some((c) => c.completed))
    if (started) return false
    v.owner = undefined
    v.takeBy = undefined
    v.takeTime = undefined
    if (v.workflowStatus === 'In Progress') v.workflowStatus = 'New'
    pushLog(v, 'Release Take')
    return true
  }

  function rememberOverride(v: VesselRecord, field: string, source: string, manual: string, reason: string) {
    if (source === manual) return
    v.manualOverrides[field] = {
      source,
      manual,
      reason,
      by: CURRENT_USER,
      at: new Date().toISOString(),
    }
  }

  function bindSchedule(v: VesselRecord, schedule: TerminalSchedule, source: VesselRecord['terminalSource']) {
    v.terminalSchedule = schedule
    v.terminalSource = source
    v.externalVoyage = schedule.evoyage ?? ''
    v.externalExportVoyage = schedule.evoyage ?? ''
    v.externalImportVoyage = schedule.ivoyage ?? ''
    v.localVoyage = schedule.evoyage ?? ''
    v.tmlEta = schedule.eta ?? ''
    v.tmlAta = schedule.ata ?? ''
    v.tmlEtb = schedule.etb ?? ''
    v.tmlAtb = schedule.atb ?? ''
    v.tmlEtd = schedule.etd ?? ''
    v.tmlAtd = schedule.atd ?? ''
    v.cyOpen = schedule.cyOpen ?? ''
    v.cyCutoff = schedule.cyClosing ?? ''
    v.portCloseDate = schedule.portCloseDate ?? ''
    v.customsCloseDate = schedule.customsCloseDate ?? ''
    v.terminalScheduleStatus = schedule.status ?? ''
    if (schedule.shipCode) v.shipCode = schedule.shipCode
    if (schedule.agentCode) v.agentCode = schedule.agentCode
    if (schedule.portsCn || schedule.portsEn) {
      v.portsOfCall = schedule.portsCn || schedule.portsEn || v.portsOfCall
    }
    v.rowNotFound = false
    v.notFoundFields = []
  }

  function selectionLabel(schedule: TerminalSchedule | null | undefined) {
    if (!schedule) return 'Unconfirmed'
    return `Export ${schedule.evoyage || '—'} · Import ${schedule.ivoyage || '—'} · ${schedule.terminal || '—'}`
  }

  /** Confirmed rows keep their relationship label. Everything else is still unconfirmed. */
  function previousMatchLabel(v: VesselRecord) {
    if (v.matchingStatus === 'Manual matched' || v.matchingStatus === 'Auto matched') {
      return selectionLabel(v.terminalSchedule)
    }
    return 'Unconfirmed'
  }

  function rememberMatch(v: VesselRecord, from: string, to: string, reason: string, at: string) {
    if (from === to) return
    const change: MatchChange = {
      id: `match-${Date.now()}`,
      at,
      by: CURRENT_USER,
      reason,
      fromSelection: from,
      toSelection: to,
    }
    v.matchHistory = v.matchHistory ?? []
    v.matchHistory.unshift(change)
  }

  /** Bind one Freightower candidate and keep the rest available for a later change. */
  function confirmCandidateMatch(
    id: string,
    input: {
      candidate: TerminalSchedule
      reason: string
      remediation?: 'selectMatch' | 'reviewMatch'
      /** Cell edits on the selected row, original candidate value → saved value. */
      fieldChanges?: HistoryDetail[]
      /** Full candidate list after inline edits, including rows that were not selected. */
      candidates?: TerminalSchedule[]
    },
  ) {
    const v = byId(id)
    if (!v) return
    const reason = input.reason.trim()
    const at = new Date().toISOString()
    const fromSelection = previousMatchLabel(v)
    const fieldChanges = (input.fieldChanges ?? []).filter((change) => change.from !== change.to)
    for (const change of fieldChanges) {
      rememberOverride(v, change.field, change.from, change.to, reason)
    }
    bindSchedule(v, { ...input.candidate }, 'freightower')
    v.matchingStatus = 'Manual matched'
    v.manualRemediation = input.remediation
      ?? (v.terminalCandidates.length > 1 ? 'selectMatch' : 'reviewMatch')
    const nextCandidates = input.candidates?.length
      ? input.candidates
      : v.terminalCandidates.length
        ? v.terminalCandidates
        : [input.candidate]
    v.terminalCandidates = nextCandidates.map((row) => ({ ...row }))
    const toSelection = selectionLabel(v.terminalSchedule)
    const details: HistoryDetail[] = [...fieldChanges]
    if (fromSelection !== toSelection) {
      details.push({ field: 'Match', from: fromSelection, to: toSelection })
      rememberMatch(v, fromSelection, toSelection, reason, at)
    }
    if (details.length) {
      pushHistory(v, {
        type: fieldChanges.length ? 'Manual terminal' : 'Manual match',
        reason,
        summary: fieldChanges.length ? 'Terminal row updated' : `${fromSelection} → ${toSelection}`,
        details,
        at,
      })
    }
    refreshSharedTerminal(vessels.value)
    pushLog(v, `Selected terminal ${toSelection}`, reason)
  }

  function updateVolumes(id: string, volumes: VolumeData) {
    const v = byId(id)
    if (!v) return
    v.volumes = { ...volumes }
    pushLog(v, 'Update volumes')
  }

  function toggleCheckpoint(vesselId: string, taskId: string, checkpointId: string) {
    const v = byId(vesselId)
    if (!v) return
    const task = v.tasks.find((t) => t.id === taskId)
    const cp = task?.checkpoints.find((c) => c.id === checkpointId)
    if (!task || !cp) return
    cp.completed = !cp.completed
    cp.completedBy = cp.completed ? CURRENT_USER : undefined
    cp.completedAt = cp.completed ? new Date().toISOString() : undefined
    const allDone = task.checkpoints.every((c) => c.completed || !c.required)
    task.status = allDone ? 'Completed' : 'In Progress'
    if (v.tasks.every((t) => t.status === 'Completed')) {
      v.workflowStatus = 'Completed'
      v.completedDate = new Date().toISOString()
    } else if (v.workflowStatus === 'Completed') {
      v.workflowStatus = 'In Progress'
      v.completedDate = undefined
    } else if (v.workflowStatus === 'New') {
      v.workflowStatus = 'In Progress'
    }
    pushLog(v, cp.completed ? 'Checkpoint completed' : 'Checkpoint reopened', cp.name)
  }

  function setCheckpointRemark(
    vesselId: string,
    taskId: string,
    checkpointId: string,
    remark: string,
  ) {
    const v = byId(vesselId)
    const task = v?.tasks.find((t) => t.id === taskId)
    const cp = task?.checkpoints.find((c) => c.id === checkpointId)
    if (!v || !cp) return
    cp.remark = remark
    pushLog(v, 'Checkpoint remark', `${cp.name}: ${remark || '—'}`)
  }

  function setRemark(id: string, remark: string) {
    const v = byId(id)
    if (!v) return
    v.remark = remark
    pushLog(v, 'Update remark', remark)
  }

  function reopenTask(vesselId: string, taskId: string, reason: string) {
    const v = byId(vesselId)
    const task = v?.tasks.find((t) => t.id === taskId)
    if (!v || !task) return
    task.revision += 1
    task.reopenReason = reason
    task.status = 'Reopened'
    task.checkpoints.forEach((c) => {
      c.completed = false
      c.completedAt = undefined
      c.completedBy = undefined
    })
    v.workflowStatus = 'Reopened'
    v.completedDate = undefined
    pushLog(v, 'Reopen task', `${task.name} Rev.${task.revision}: ${reason}`)
  }

  function setVesselField(v: VesselRecord, field: string, value: string) {
    const row = v as VesselRecord & Record<string, string>
    row[field] = value
  }

  function setManualOverride(
    id: string,
    field: string,
    source: string,
    manual: string,
    reason: string,
  ) {
    const v = byId(id)
    if (!v) return
    v.manualOverrides[field] = { source, manual, reason, by: CURRENT_USER, at: new Date().toISOString() }
    setVesselField(v, field, manual)
    pushHistory(v, {
      type: 'Manual edit',
      reason,
      summary: '1 field updated',
      details: [{ field, from: source, to: manual }],
    })
    pushLog(v, 'Manual override', `${field}: ${source} → ${manual} (${reason})`)
  }

  function resolveDiff(
    id: string,
    field: string,
    choice: 'keep' | 'restore' | 'update',
    latestSource: string,
  ) {
    const v = byId(id)
    if (!v) return
    const ov = v.manualOverrides[field]
    if (!ov) return
    if (choice === 'keep') {
      pushLog(v, 'Keep manual value', field)
    } else if (choice === 'restore') {
      const previous = ov.manual
      setVesselField(v, field, latestSource)
      delete v.manualOverrides[field]
      pushHistory(v, {
        type: 'Manual edit',
        reason: 'Restore source value',
        summary: '1 field updated',
        details: [{ field, from: previous, to: latestSource }],
      })
      pushLog(v, 'Restore source value', field)
    } else {
      const previous = ov.manual
      ov.manual = latestSource
      ov.source = latestSource
      setVesselField(v, field, latestSource)
      pushHistory(v, {
        type: 'Manual edit',
        reason: 'Update manual to latest source',
        summary: '1 field updated',
        details: [{ field, from: previous, to: latestSource }],
      })
      pushLog(v, 'Update manual to latest source', field)
    }
  }

  function refresh(simulateFail = false) {
    if (simulateFail) {
      refreshFailed.value = true
      return false
    }
    refreshFailed.value = false
    lastRefreshTime.value = formatDateTime(new Date().toISOString())
    vessels.value.forEach((v) => {
      v.lastRefreshTime = lastRefreshTime.value
    })
    return true
  }

  /** Manual terminal sync. One Refresh per API call, even when no field changes. */
  function syncSchedules() {
    const refreshTime = new Date().toISOString()
    lastRefreshTime.value = formatDateTime(refreshTime)
    refreshFailed.value = false
    let changed = 0
    for (const vessel of vessels.value) {
      if (isLaraLinkTarget(vessel)) continue
      vessel.lastRefreshTime = refreshTime
      const schedule = vessel.terminalSchedule
      const etdLocked = Boolean(vessel.manualOverrides.etd || vessel.manualOverrides.tmlEtd || vessel.manualOverrides.terminalEtd)
      const selectionLocked = vessel.matchingStatus === 'Manual matched' || (vessel.matchHistory?.length ?? 0) > 0
      if (
        !useTerminalCoverageStore().canCallFeituo(vessel.pointCode)
        || vessel.rowNotFound
        || !schedule?.etd
        || etdLocked
        || vessel.terminalSource === 'manual'
        || selectionLocked
      ) {
        continue
      }
      const original = schedule.etd
      const next = new Date(original)
      if (Number.isNaN(next.getTime())) {
        recordTerminalRefresh(vessel, {
          trigger: 'Manual',
          at: refreshTime,
          result: 'Failed',
          failureSource: 'Terminal',
        })
        continue
      }
      next.setHours(next.getHours() + 1)
      const updated = formatApiDateTime(next)
      const details: HistoryDetail[] = updated === original
        ? []
        : [{ field: 'etd', from: original, to: updated }]
      if (details.length) {
        schedule.etd = updated
        schedule.updateTime = formatApiDateTime(refreshTime)
        vessel.tmlEtd = updated
        vessel.fieldHistory.unshift({
          field: 'etd',
          refreshTime,
          originalValue: original,
          updatedValue: updated,
        })
        changed += 1
      }
      recordTerminalRefresh(vessel, { trigger: 'Manual', at: refreshTime, changes: details })
    }
    return changed
  }

  function setSort(key: string) {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortKey.value = key
      sortDir.value = 'asc'
    }
  }

  function updateWorkflow(id: string, status: WorkflowStatus) {
    const v = byId(id)
    if (!v) return
    v.workflowStatus = status
    if (status === 'Completed') v.completedDate = new Date().toISOString()
    pushLog(v, 'Update workflow status', status)
  }

  function syncRegionForPoint(pointCode: string, regionCode: string) {
    for (const vessel of vessels.value) {
      if (vessel.pointCode === pointCode) vessel.region = regionCode
    }
  }

  function clearRegion(code: string) {
    const key = code.trim().toUpperCase()
    for (const vessel of vessels.value) {
      if (vessel.region === key) vessel.region = ''
    }
  }

  function addManualVessel(input: ManualVesselInput) {
    const id = `manual-${Date.now()}`
    const remark =
      input.remark?.trim() || 'Manually added — pending link to LARA'
    const record = {
      ...createInitialVessels()[0]!,
      id,
      ...laraIdentity(input.vesselType),
      brand: input.brand,
      vesselOperator: '',
      vesselName: input.vesselName,
      service: input.service.trim(),
      pointCode: input.pointCode,
      region: maintainedRegion(input.pointCode),
      terminalName: '',
      poolLocation: input.poolLocation.trim(),
      laraVoyage: input.voyage.trim(),
      externalVoyage: '',
      localVoyage: '',
      externalImportVoyage: '',
      externalExportVoyage: '',
      laraEtb: input.etb,
      laraEtd: input.etd,
      tmlEta: '',
      tmlAta: '',
      tmlEtb: '',
      tmlAtb: '',
      tmlEtd: '',
      tmlAtd: '',
      cyOpen: '',
      cyCutoff: '',
      portCloseDate: '',
      customsCloseDate: '',
      terminalScheduleStatus: '',
      shipCode: '',
      agentCode: '',
      portsOfCall: '',
      matchingStatus: matchingStatusForManualAdd(input.pointCode),
      sharedTerminal: false,
      terminalSource: null,
      voyageStatus: input.voyageStatus,
      terminalCandidates: [],
      matchHistory: [],
      history: [] as HistoryEntry[],
      scheduleLogs: [],
      fieldHistory: [],
      manualOverrides: {},
      laraSyncTime: new Date().toISOString(),
      lastRefreshTime: '',
      workflowStatus: 'New' as const,
      owner: undefined,
      takeBy: undefined,
      takeTime: undefined,
      completedDate: undefined,
      omit: input.voyageStatus === 'Omit',
      apiCovered: useTerminalCoverageStore().ports.find((row) => row.portCode === input.pointCode)?.apiCovered ?? false,
      createdManually: true,
      laraLinked: false,
      activityLog: [
        {
          id: `log-${Date.now()}`,
          at: new Date().toISOString(),
          user: CURRENT_USER,
          action: 'Manual add vessel',
        },
      ],
      tasks: [
        {
          id: 'ps-main',
          name: 'Post sailing checklist',
          status: 'New' as const,
          revision: 0,
          checkpoints: [
            { id: 'cp-0', name: 'Verify ATD', required: true, completed: false },
            { id: 'cp-1', name: 'Enter container volumes', required: true, completed: false },
            { id: 'cp-2', name: 'SLC/SDC file ready', required: true, completed: false },
            { id: 'cp-3', name: 'LTK receipt check', required: true, completed: false },
          ],
        },
      ],
      remark,
      terminalSchedule: null,
    }
    vessels.value.unshift(record)
    pushHistory(record, {
      type: 'Manual create',
      reason: input.remark?.trim() || undefined,
      summary: 'Vessel created manually',
      details: [
        { field: 'laraVoyage', from: '', to: input.voyage.trim() },
        { field: 'vesselName', from: '', to: input.vesselName.trim() },
        { field: 'pointCode', from: '', to: input.pointCode },
        { field: 'vesselType', from: '', to: input.vesselType },
        { field: 'brand', from: '', to: input.brand },
        { field: 'service', from: '', to: input.service.trim() },
        { field: 'laraPoolLocation', from: '', to: input.poolLocation.trim() },
        { field: 'laraEtb', from: '', to: input.etb },
        { field: 'laraEtd', from: '', to: input.etd },
        { field: 'voyageStatus', from: '', to: input.voyageStatus },
      ],
    })
    pushLog(record, 'Manual add vessel', remark)
    return record
  }

  function updateManualVessel(id: string, input: ManualVesselInput) {
    const v = byId(id)
    if (!v?.createdManually) return
    const details: HistoryDetail[] = []
    const assign = (field: string, from: string, to: string) => {
      if (from === to) return
      rememberOverride(v, field, from, to, input.remark?.trim() || '')
      details.push({ field, from, to })
    }
    const nextType = laraIdentity(input.vesselType)
    assign('laraVoyage', v.laraVoyage, input.voyage.trim())
    assign('vesselName', v.vesselName, input.vesselName.trim())
    assign('pointCode', v.pointCode, input.pointCode)
    assign('vesselType', laraVesselTypeOf(v), input.vesselType)
    assign('brand', v.brand ?? '', input.brand)
    assign('service', v.service, input.service.trim())
    assign('laraPoolLocation', v.poolLocation, input.poolLocation.trim())
    assign('laraEtb', v.laraEtb, input.etb)
    assign('laraEtd', v.laraEtd, input.etd)
    assign('voyageStatus', v.voyageStatus, input.voyageStatus)
    Object.assign(v, nextType)
    v.brand = input.brand
    v.vesselName = input.vesselName.trim()
    v.service = input.service.trim()
    v.pointCode = input.pointCode
    v.region = maintainedRegion(input.pointCode)
    v.apiCovered = useTerminalCoverageStore().ports.find((row) => row.portCode === input.pointCode)?.apiCovered ?? v.apiCovered
    if (v.createdManually && (v.matchingStatus === 'Pending match' || v.matchingStatus === 'No terminal record')) {
      v.matchingStatus = matchingStatusForManualAdd(input.pointCode)
    }
    v.poolLocation = input.poolLocation.trim()
    v.laraVoyage = input.voyage.trim()
    v.laraEtb = input.etb
    v.laraEtd = input.etd
    v.voyageStatus = input.voyageStatus
    v.omit = input.voyageStatus === 'Omit'
    v.remark = input.remark?.trim() ?? ''
    pushHistory(v, {
      type: 'Manual edit',
      reason: input.remark?.trim() || undefined,
      summary: details.length
        ? details.length === 1
          ? '1 field updated'
          : `${details.length} fields updated`
        : 'Manual vessel reviewed with no field changes',
      details,
    })
    pushLog(v, 'Manual edit vessel', input.remark?.trim() || undefined)
  }

  function removeManualVessel(id: string) {
    const v = byId(id)
    if (!v?.createdManually || v.laraLinked) return false
    vessels.value = vessels.value.filter((row) => row.id !== id)
    selectedIds.value = selectedIds.value.filter((selected) => selected !== id)
    return true
  }

  function linkManualVesselToLara(
    id: string,
    input: { targetId: string; reason?: string },
  ) {
    const source = byId(id)
    const target = byId(input.targetId)
    if (!source?.createdManually || source.laraLinked || source.laraLinkTargetId) return false
    if (!target || target.id === source.id || target.createdManually) return false
    if (isLaraLinkTarget(target)) return false
    const reason = input.reason?.trim() || ''
    const at = new Date().toISOString()
    const key = laraLinkKey(target)
    const sourceKey = laraLinkKey(source)
    const previousStatus = target.matchingStatus
    source.laraLinkTargetId = target.id
    source.laraLinked = true
    target.laraLinkSourceId = source.id
    target.laraLinkPreviousStatus = previousStatus
    target.matchingStatus = 'Linked'
    pushHistory(source, {
      type: 'Manual edit',
      reason: reason || undefined,
      summary: 'Linked to LARA',
      details: [{ field: 'laraLink', from: '', to: key }],
      at,
    })
    pushHistory(target, {
      type: 'Manual edit',
      reason: reason || undefined,
      summary: 'Marked as Linked',
      details: [
        { field: 'laraLinkSource', from: '', to: sourceKey },
        { field: 'mappingStatus', from: previousStatus, to: 'Linked' },
      ],
      at,
    })
    pushLog(source, 'Link to LARA', key)
    pushLog(target, 'Linked as LARA target', key)
    return true
  }

  function unlinkManualVesselFromLara(id: string, input?: { reason?: string }) {
    const source = byId(id)
    const targetId = source?.laraLinkTargetId
    if (!source || !targetId) return false
    const target = byId(targetId)
    const reason = input?.reason?.trim() || ''
    const at = new Date().toISOString()
    const key = target ? laraLinkKey(target) : ''
    const sourceKey = laraLinkKey(source)
    const restored = target?.laraLinkPreviousStatus && target.laraLinkPreviousStatus !== 'Linked'
      ? target.laraLinkPreviousStatus
      : 'Pending match'
    if (target) {
      target.matchingStatus = restored
      target.laraLinkSourceId = undefined
      target.laraLinkPreviousStatus = undefined
      pushHistory(target, {
        type: 'Manual edit',
        reason: reason || undefined,
        summary: 'LARA link removed',
        details: [
          { field: 'laraLinkSource', from: sourceKey, to: '' },
          { field: 'mappingStatus', from: 'Linked', to: restored },
        ],
        at,
      })
      pushLog(target, 'LARA link removed', key)
    }
    source.laraLinkTargetId = undefined
    source.laraLinked = false
    pushHistory(source, {
      type: 'Manual edit',
      reason: reason || undefined,
      summary: 'LARA link removed',
      details: [{ field: 'laraLink', from: key, to: '' }],
      at,
    })
    pushLog(source, 'Unlink LARA', key)
    return true
  }

  function addManualTerminal(
    id: string,
    info: {
      terminal: string
      evoyage: string
      ivoyage: string
      etb: string
      etd: string
      atb: string
      atd: string
      cyOpen: string
      cyClosing: string
      reason: string
    },
  ) {
    const v = byId(id)
    if (!v) return
    const reason = info.reason.trim()
    const previous = v.terminalSchedule
    const schedule: TerminalSchedule = {
      ...emptyTerminalSchedule(v),
      terminal: info.terminal,
      evoyage: info.evoyage,
      ivoyage: info.ivoyage,
      etb: info.etb,
      etd: info.etd,
      atb: info.atb,
      atd: info.atd,
      cyOpen: info.cyOpen,
      cyClosing: info.cyClosing,
      updateTime: formatApiDateTime(new Date().toISOString()),
    }
    const fields: Array<[string, string, string]> = [
      ['terminal', previous?.terminal ?? '', schedule.terminal ?? ''],
      ['evoyage', previous?.evoyage ?? '', schedule.evoyage ?? ''],
      ['ivoyage', previous?.ivoyage ?? '', schedule.ivoyage ?? ''],
      ['etb', previous?.etb ?? '', schedule.etb ?? ''],
      ['etd', previous?.etd ?? '', schedule.etd ?? ''],
      ['atb', previous?.atb ?? '', schedule.atb ?? ''],
      ['atd', previous?.atd ?? '', schedule.atd ?? ''],
      ['cyOpen', previous?.cyOpen ?? '', schedule.cyOpen ?? ''],
      ['cyClosing', previous?.cyClosing ?? '', schedule.cyClosing ?? ''],
    ]
    const fromSelection = previousMatchLabel(v)
    const at = new Date().toISOString()
    const details: HistoryDetail[] = []
    for (const [field, source, manual] of fields) {
      rememberOverride(v, field, source, manual, reason)
      if (source !== manual) details.push({ field, from: source, to: manual })
    }
    bindSchedule(v, schedule, 'manual')
    v.matchingStatus = 'Manual matched'
    v.terminalCandidates = []
    v.terminalName = info.terminal || v.terminalName
    const toSelection = selectionLabel(v.terminalSchedule)
    if (fromSelection !== toSelection) {
      details.push({ field: 'Match', from: fromSelection, to: toSelection })
      rememberMatch(v, fromSelection, toSelection, reason, at)
    }
    if (details.length) {
      pushHistory(v, {
        type: 'Manual terminal',
        reason,
        summary: details.length === 1 ? '1 field updated' : `${details.length} fields updated`,
        details,
        at,
      })
    }
    refreshSharedTerminal(vessels.value)
    pushLog(v, 'Manual add terminal information', reason)
  }

  function saveReviewMatch(
    id: string,
    input: {
      lara: HistoryDetail[]
      terminal: HistoryDetail[]
      rows: TerminalSchedule[]
      selectedIndex: number | null
      reason: string
    },
  ) {
    const v = byId(id)
    if (!v) return
    const reason = input.reason.trim()
    const at = new Date().toISOString()
    for (const change of input.lara) {
      if (change.field === 'vesselName') v.vesselName = change.to
      else if (change.field === 'service') v.service = change.to
      else if (change.field === 'brand') v.brand = change.to
      else if (change.field === 'laraEtb') v.laraEtb = change.to
      else if (change.field === 'laraEtd') v.laraEtd = change.to
      else if (change.field === 'voyageStatus') {
        v.voyageStatus = change.to === 'Omit' ? 'Omit' : 'Active'
        v.omit = change.to === 'Omit'
      } else if (change.field === 'vesselType') {
        v.groupKind = change.to === 'Partner vsl' ? 'Partner Vessel' : change.to === '3PF' ? '3PF' : 'Group Vessel'
      }
      rememberOverride(v, change.field, change.from, change.to, reason)
    }
    if (input.lara.length) {
      pushHistory(v, {
        type: 'Manual edit',
        reason,
        summary: input.lara.length === 1 ? '1 field updated' : `${input.lara.length} fields updated`,
        details: input.lara,
        at,
      })
    }
    for (const change of input.terminal) rememberOverride(v, change.field, change.from, change.to, reason)
    const fromSelection = previousMatchLabel(v)
    v.terminalCandidates = input.rows.map((row) => ({ ...row }))
    if (input.selectedIndex == null || !input.rows[input.selectedIndex]) {
      v.terminalSchedule = null
      v.terminalSource = null
      v.matchingStatus = input.rows.length ? 'Pending match' : 'No terminal record'
      v.manualRemediation = input.rows.length ? 'reviewMatch' : 'addTerminal'
    } else {
      const selected = input.rows[input.selectedIndex]!
      bindSchedule(v, { ...selected }, 'manual')
      v.matchingStatus = 'Manual matched'
      v.manualRemediation = 'reviewMatch'
    }
    const toSelection = selectionLabel(v.terminalSchedule)
    const terminalDetails = [...input.terminal]
    if (fromSelection !== toSelection) {
      terminalDetails.push({ field: 'Match', from: fromSelection, to: toSelection })
      rememberMatch(v, fromSelection, toSelection, reason, at)
    }
    if (terminalDetails.length) {
      const matchOnly = terminalDetails.length === 1 && terminalDetails[0]?.field === 'Match'
      pushHistory(v, {
        type: matchOnly ? 'Manual match' : 'Manual terminal',
        reason,
        summary: matchOnly ? `${fromSelection} → ${toSelection}` : 'Terminal row updated',
        details: terminalDetails,
        at,
      })
    }
    refreshSharedTerminal(vessels.value)
  }

  /** Persist edited terminal fields before confirming a review match. */
  function saveTerminalOverrides(
    id: string,
    input: {
      schedule: TerminalSchedule
      vesselOperator?: string
      reason: string
      /** Confirm the match in the same activity log as the field edits. */
      includeMatch?: boolean
      remediation?: 'selectMatch' | 'reviewMatch'
    },
  ) {
    const v = byId(id)
    if (!v) return
    const reason = input.reason.trim()
    const at = new Date().toISOString()
    const fromSelection = previousMatchLabel(v)
    const previous = v.terminalSchedule
    const next = { ...input.schedule }
    const keys = Object.keys(next) as Array<keyof TerminalSchedule>
    const details: HistoryDetail[] = []
    for (const key of keys) {
      const from = String(previous?.[key] ?? '')
      const to = String(next[key] ?? '')
      if (from === to) continue
      rememberOverride(v, String(key), from, to, reason)
      details.push({ field: String(key), from, to })
    }
    if (input.vesselOperator != null && input.vesselOperator !== v.vesselOperator) {
      rememberOverride(v, 'vesselOperator', v.vesselOperator, input.vesselOperator, reason)
      details.push({ field: 'vesselOperator', from: v.vesselOperator, to: input.vesselOperator })
      v.vesselOperator = input.vesselOperator
    }
    bindSchedule(v, next, previous ? (v.terminalSource ?? 'manual') : 'manual')
    if (input.includeMatch) {
      v.matchingStatus = 'Manual matched'
      v.manualRemediation = input.remediation ?? 'reviewMatch'
    } else if (v.terminalSource === 'manual') {
      v.manualRemediation = 'addTerminal'
    }
    const toSelection = selectionLabel(v.terminalSchedule)
    if (fromSelection !== toSelection) {
      details.push({ field: 'Match', from: fromSelection, to: toSelection })
      rememberMatch(v, fromSelection, toSelection, reason, at)
    }
    if (details.length) {
      pushHistory(v, {
        type: 'Manual terminal',
        reason,
        summary: details.length === 1 ? '1 field updated' : `${details.length} fields updated`,
        details,
        at,
      })
    }
    pushLog(v, 'Terminal fields edited', reason || undefined)
  }

  /** Full terminal draft from Add Terminal Information. */
  function addManualTerminalFromDraft(
    id: string,
    input: { schedule: TerminalSchedule; vesselOperator?: string; reason: string },
  ) {
    const v = byId(id)
    if (!v) return
    const reason = input.reason.trim()
    const at = new Date().toISOString()
    const fromSelection = previousMatchLabel(v)
    const previous = v.terminalSchedule
    const schedule = { ...input.schedule }
    const keys = Object.keys(schedule) as Array<keyof TerminalSchedule>
    const details: HistoryDetail[] = []
    for (const key of keys) {
      const from = String(previous?.[key] ?? '')
      const to = String(schedule[key] ?? '')
      if (from === to) continue
      rememberOverride(v, String(key), from, to, reason)
      details.push({ field: String(key), from, to })
    }
    if (input.vesselOperator && input.vesselOperator !== v.vesselOperator) {
      rememberOverride(v, 'vesselOperator', v.vesselOperator, input.vesselOperator, reason)
      details.push({ field: 'vesselOperator', from: v.vesselOperator, to: input.vesselOperator })
      v.vesselOperator = input.vesselOperator
    }
    bindSchedule(v, schedule, 'manual')
    v.matchingStatus = 'Manual matched'
    v.manualRemediation = 'addTerminal'
    v.terminalCandidates = []
    if (schedule.terminal) v.terminalName = schedule.terminal
    const toSelection = selectionLabel(v.terminalSchedule)
    if (fromSelection !== toSelection) {
      details.push({ field: 'Match', from: fromSelection, to: toSelection })
      rememberMatch(v, fromSelection, toSelection, reason, at)
    }
    if (details.length) {
      pushHistory(v, {
        type: 'Manual terminal',
        reason,
        summary: details.length === 1 ? '1 field updated' : `${details.length} fields updated`,
        details,
        at,
      })
    }
    refreshSharedTerminal(vessels.value)
    pushLog(v, 'Manual add terminal information', reason)
  }

  return {
    vessels,
    refreshes,
    refreshById,
    filters,
    selectedIds,
    lastRefreshTime,
    refreshFailed,
    sortKey,
    sortDir,
    activeVessels,
    historyVessels,
    filteredActive,
    filteredHistory,
    byId,
    clearFilters,
    toggleSelect,
    selectMany,
    deselectMany,
    clearSelection,
    takeVessels,
    reassign,
    releaseTake,
    confirmCandidateMatch,
    updateVolumes,
    toggleCheckpoint,
    setCheckpointRemark,
    setRemark,
    reopenTask,
    setManualOverride,
    resolveDiff,
    refresh,
    syncSchedules,
    setSort,
    updateWorkflow,
    addManualVessel,
    updateManualVessel,
    syncRegionForPoint,
    clearRegion,
    removeManualVessel,
    linkManualVesselToLara,
    unlinkManualVesselFromLara,
    addManualTerminal,
    addManualTerminalFromDraft,
    saveTerminalOverrides,
    saveReviewMatch,
    pushLog,
  }
})
