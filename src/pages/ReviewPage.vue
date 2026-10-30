<script setup lang="ts">
import { computed, nextTick, provide, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { brandFromVoyage } from '@/domain/lara-brand'
import DataSection from '@/components/DataSection.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  canAddTerminalRecord,
  canEditTerminalDraft,
  canSelectTerminalRecord,
  terminalEditMode,
} from '@/features/vessel-schedule/review-access'
import { mappingAlertVariant, mappingHeaderAlert } from '@/features/vessel-schedule/mapping-header'
import { type ScheduleQuickAction } from '@/features/vessel-schedule/mismatch-actions'
import SchedulePlatformFields from '@/features/vessel-schedule/SchedulePlatformFields.vue'
import ScheduleRecordHeading from '@/features/vessel-schedule/ScheduleRecordHeading.vue'
import VesselAdjustMenu from '@/features/vessel-schedule/VesselAdjustMenu.vue'
import VesselQuickActions from '@/features/vessel-schedule/VesselQuickActions.vue'
import SyncFieldAlert from '@/features/vessel-schedule/SyncFieldAlert.vue'
import PendingFieldChoice from '@/features/vessel-schedule/PendingFieldChoice.vue'
import { columnIdForReview, reviewForColumn } from '@/features/vessel-schedule/sync-columns'
import { syncCellKey } from '@/features/vessel-schedule/sync-review'
import { useScheduleStore, type SyncChoice } from '@/stores/schedule'
import {
  CANDIDATE_COLUMN_DEFS,
  datetimeInputValue,
  datetimeToIso,
  displayDraftValue,
  draftKeyForColumn,
  draftToSchedule,
  terminalPanelColumns,
  emptyTerminalDraft,
  scheduleToDraft,
  type TerminalDraft,
  type TerminalDraftKey,
} from '@/features/vessel-schedule/mismatch-fields'
import { formatDateTime } from '@/lib/vessel-utils'
import { useTabsStore } from '@/stores/tabs'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'
import type { TerminalPayload } from '@/domain/schedule-model/types'
import type { HistoryDetail, TerminalSchedule, VesselRecord } from '@/types/vsp'

const route = useRoute()
const router = useRouter()
const store = useVesselStore()
const schedule = useScheduleStore()
provide(syncCellKey, (scheduleId, columnId) => {
  const field = reviewForColumn(schedule.review(scheduleId).fields, columnId)
  if (!field || field.side === 'MATCH') return null
  return { field }
})
const coverage = useTerminalCoverageStore()
const tabs = useTabsStore()
const vessel = computed(() => store.byId(String(route.params.id)))

const CALCULATED_LARA = new Set(['voyageStatus', 'vesselType', 'terminal9code'])
const HIDDEN_LARA = new Set(['voyageStatus'])
/** Candidate tables and two-column compare need more than 2xl. */
const REVIEW_DIALOG_CLASS = 'max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[calc(100%-4rem)]'

const LARA_COLUMNS: { id: string; label: string; kind: 'text' | 'datetime' }[] = [
  { id: 'laraVoyage', label: 'Voyage', kind: 'text' },
  { id: 'pointCode', label: 'Port', kind: 'text' },
  { id: 'laraPoolLocation', label: 'Pool location', kind: 'text' },
  { id: 'vesselName', label: 'Vessel name', kind: 'text' },
  { id: 'brand', label: 'Brand', kind: 'text' },
  { id: 'service', label: 'Service', kind: 'text' },
  { id: 'laraEta', label: 'ETA', kind: 'datetime' },
  { id: 'laraEtb', label: 'ETB', kind: 'datetime' },
  { id: 'laraEtd', label: 'ETD', kind: 'datetime' },
  { id: 'voyageStatus', label: 'Voyage status', kind: 'text' },
  { id: 'vesselType', label: 'Vessel type', kind: 'text' },
  { id: 'terminal9code', label: 'Terminal 9code', kind: 'text' },
]

type TerminalRow = {
  id: string
  source: 'sync' | 'manual'
  /** Index in the terminal records stored when the page opened. Null for a row added here. */
  originIndex: number | null
  draft: TerminalDraft
  baseline: TerminalDraft | null
  editing: boolean
  editSnapshot: TerminalDraft | null
}

type PendingSync = {
  source: 'LARA' | 'Terminal'
  at: string
  changes: HistoryDetail[]
}

type PendingMatch = {
  at: string
  from: string
  to: string
  auto: boolean
}

const laraEditing = ref(false)
const laraOrigin = ref<Record<string, string>>({})
const laraSource = ref<Record<string, string>>({})
const laraValues = ref<Record<string, string>>({})
const laraBaseline = ref<Record<string, string>>({})
const originDrafts = ref<TerminalDraft[]>([])
const sourceDrafts = ref<TerminalDraft[]>([])
const committedDrafts = ref<TerminalDraft[]>([])
const rows = ref<TerminalRow[]>([])
const formRowId = ref<string | null>(null)
const selectedId = ref<string | null>(null)
const loggedMatchLabel = ref('Unconfirmed')
const pendingSyncs = ref<PendingSync[]>([])
const pendingMatches = ref<PendingMatch[]>([])
const confirmOpen = ref(false)
const initialSelectedId = ref<string | null>(null)
const initialPayloadId = ref<string | null>(null)
const pickedPayloadId = ref<string | null>(null)
const comparisonDismissed = ref(false)
const dialogPayloadId = ref<string | null>(null)
const syncSide = ref<'LARA' | 'Terminal' | null>(null)
const terminalFields = terminalPanelColumns()
const selectOpen = ref(false)
const shapeOpen = ref(false)
const pendingSelectId = ref<string | null>(null)
const replaceOpen = ref(false)
const remark = ref('')
const quickAction = ref<ScheduleQuickAction | null>(null)
const syncDrafts = ref<Record<string, string>>({})
const fieldChoices = ref<Record<string, 'previous' | 'sync'>>({})
const recordChoice = ref<'current' | 'sync' | null>(null)
const compareOpen = ref(false)
const comparePayloadId = ref<string | null>(null)
let rowSeq = 0

function syncKey(side: string, field: string) {
  return `${side}:${field}`
}

function laraRaw(current: VesselRecord, id: string) {
  if (id === 'laraVoyage') return current.laraVoyage
  if (id === 'pointCode') return current.pointCode
  if (id === 'laraPoolLocation') return current.laraPoolLocation
  if (id === 'multipleCallNumber') return current.multipleCallNumber
  if (id === 'vesselOperator') return current.vesselOperator
  if (id === 'acPartner') return current.acPartner
  if (id === 'cutoff') return current.cutoff
  if (id === 'vesselName') return current.vesselName
  if (id === 'service') return current.service
  if (id === 'brand') return brandFromVoyage(current.laraVoyage) || current.brand || ''
  if (id === 'laraEta') return current.laraEta
  if (id === 'laraEtb') return current.laraEtb
  if (id === 'laraEtd') return current.laraEtd
  if (id === 'voyageStatus') return current.voyageStatus
  if (id === 'vesselType') return current.vesselTypeLabel
  if (id === 'terminal9code') return current.terminal9code
  return ''
}

function laraLatest(current: VesselRecord, id: string) {
  return current.manualOverrides[id]?.source ?? laraRaw(current, id)
}

function displayLara(id: string, kind: 'text' | 'datetime') {
  if (id === 'vesselType') return vessel.value?.vesselTypeLabel || '—'
  if (id === 'terminal9code') return vessel.value?.terminal9code || '—'
  const raw = laraValues.value[id] ?? ''
  if (!raw) return '—'
  return kind === 'datetime' ? formatDateTime(raw) : raw
}

function sameSchedule(a: TerminalSchedule | null | undefined, draft: TerminalDraft) {
  if (!a) return false
  return (a.evoyage ?? '') === draft.evoyage && (a.terminal ?? '') === draft.terminal && (a.etd ?? '') === draft.etd
}

function cloneDraft(draft: TerminalDraft): TerminalDraft {
  return { ...draft }
}

function sameDraft(a: TerminalDraft, b: TerminalDraft) {
  return (Object.keys(a) as TerminalDraftKey[]).every((key) => a[key] === b[key])
}

function terminalRecords(current: VesselRecord) {
  if (current.terminalCandidates.length) return current.terminalCandidates
  if (current.terminalSchedule) return [current.terminalSchedule]
  return []
}

function sourceDraftFor(current: VesselRecord, schedule: TerminalSchedule) {
  const draft = scheduleToDraft(schedule, current)
  if (!sameSchedule(current.terminalSchedule, draft)) return draft
  for (const key of Object.keys(draft) as TerminalDraftKey[]) {
    const override = current.manualOverrides[key]
    if (override) draft[key] = override.source
  }
  return draft
}

function rowFromDraft(draft: TerminalDraft, source: TerminalRow['source'], originIndex: number | null): TerminalRow {
  const copy = cloneDraft(draft)
  return {
    id: `row-${rowSeq++}`,
    source,
    originIndex,
    draft: copy,
    baseline: cloneDraft(copy),
    editing: false,
    editSnapshot: null,
  }
}

function rowSource(current: VesselRecord, draft: TerminalDraft): TerminalRow['source'] {
  return current.terminalSource === 'manual' && sameSchedule(current.terminalSchedule, draft) ? 'manual' : 'sync'
}

function matchLabel(row: TerminalRow | null | undefined) {
  if (!row) return 'Unconfirmed'
  return `Export ${row.draft.evoyage || '—'} · Import ${row.draft.ivoyage || '—'} · ${row.draft.terminal || '—'}`
}

function diffLara(from: Record<string, string>, to: Record<string, string>): HistoryDetail[] {
  return LARA_COLUMNS.filter((column) => !CALCULATED_LARA.has(column.id))
    .filter((column) => (from[column.id] ?? '') !== (to[column.id] ?? ''))
    .map((column) => ({
      field: column.id,
      from: from[column.id] ?? '',
      to: to[column.id] ?? '',
    }))
}

function draftDiff(from: TerminalDraft, to: TerminalDraft): HistoryDetail[] {
  return (Object.keys(from) as TerminalDraftKey[])
    .filter((key) => from[key] !== to[key])
    .map((key) => ({ field: key, from: from[key], to: to[key] }))
}

function indexDiff(before: TerminalDraft[], after: TerminalDraft[]): HistoryDetail[] {
  return before.flatMap((draft, index) => filledDiff(draft, after[index] ?? emptyTerminalDraft()))
}

function persistedTerminalChanges(): HistoryDetail[] {
  const details: HistoryDetail[] = []
  const used = new Set<number>()
  for (const row of rows.value) {
    if (row.originIndex == null) {
      details.push(...filledDiff(emptyTerminalDraft(), row.draft))
      continue
    }
    used.add(row.originIndex)
    const origin = originDrafts.value[row.originIndex]
    if (origin) details.push(...filledDiff(origin, row.draft))
  }
  originDrafts.value.forEach((draft, index) => {
    if (!used.has(index)) details.push(...filledDiff(draft, emptyTerminalDraft()))
  })
  return details
}

function filledDiff(draft: TerminalDraft, next: TerminalDraft) {
  return draftDiff(draft, next).filter((detail) => detail.from !== detail.to)
}

function init(current: VesselRecord) {
  const origin = Object.fromEntries(LARA_COLUMNS.map((column) => [column.id, laraRaw(current, column.id)]))
  const source = Object.fromEntries(LARA_COLUMNS.map((column) => [column.id, laraLatest(current, column.id)]))
  laraOrigin.value = origin
  laraSource.value = source
  laraBaseline.value = { ...origin }
  laraValues.value = { ...origin }
  laraEditing.value = false
  const stored = terminalRecords(current).map((schedule) => scheduleToDraft(schedule, current))
  const latest = terminalRecords(current).map((schedule) => sourceDraftFor(current, schedule))
  originDrafts.value = stored.map(cloneDraft)
  sourceDrafts.value = latest.map(cloneDraft)
  committedDrafts.value = stored.map(cloneDraft)
  rows.value = stored.map((draft, index) => rowFromDraft(draft, rowSource(current, draft), index))
  const matched = rows.value.find((row) => sameSchedule(current.terminalSchedule, row.draft))
  selectedId.value = matched?.id ?? (rows.value.length === 1 ? rows.value[0]!.id : null)
  loggedMatchLabel.value = matchLabel(matched)
  formRowId.value = null
  pendingSyncs.value = []
  pendingMatches.value = []
  confirmOpen.value = false
  syncSide.value = null
  remark.value = ''
  initialSelectedId.value = selectedId.value
  const opened = schedule.review(current.id)
  initialPayloadId.value = opened.comparedPayloadId
  pickedPayloadId.value = opened.comparedPayloadId
  comparisonDismissed.value = false
  dialogPayloadId.value = opened.comparedPayloadId
  fieldChoices.value = {}
  recordChoice.value = null
  compareOpen.value = false
  comparePayloadId.value = null
  const drafts: Record<string, string> = {}
  for (const field of schedule.review(current.id).fields) {
    if (field.status !== 'pending' || field.side !== 'MATCH') continue
    drafts[syncKey(field.side, field.field)] = field.previousValue
  }
  syncDrafts.value = drafts
}

if (vessel.value) init(vessel.value)

const pendingSyncFields = computed(() => {
  const current = vessel.value
  if (!current) return []
  return schedule.review(current.id).fields.filter((field) => field.status === 'pending')
})

function syncChoices(): SyncChoice[] {
  return pendingSyncFields.value.map((field) => ({
    side: field.side,
    field: field.field,
    payloadId: field.payloadId,
    previousValue: field.previousValue,
    incomingValue: field.incomingValue,
    typed: syncDrafts.value[syncKey(field.side, field.field)] ?? field.previousValue,
  }))
}

const selectedRow = computed(() => rows.value.find((row) => row.id === selectedId.value) ?? null)
const comparable = computed(() => {
  const status = vessel.value?.matchingStatus
  return status === 'Auto matched' || status === 'Manual matched' || status === 'Pending match'
})
const editMode = computed(() => (vessel.value ? terminalEditMode(vessel.value) : 'none'))
const currentReview = computed(() => (vessel.value ? schedule.review(vessel.value.id) : null))
const showSelect = computed(() => {
  const current = vessel.value
  const review = currentReview.value
  return Boolean(current && review && canSelectTerminalRecord(current, review))
})
const showAdd = computed(() => {
  const current = vessel.value
  const review = currentReview.value
  return Boolean(current && review && canAddTerminalRecord(current, review))
})

function addedManualRow() {
  return rows.value.find((row) => row.source === 'manual' && !row.baseline) ?? null
}

function draftEditable(key: TerminalDraftKey) {
  if (activeRow.value?.source === 'manual' && !activeRow.value.baseline) return true
  return vessel.value ? canEditTerminalDraft(vessel.value, key) : false
}
const activeRow = computed(() => selectedRow.value ?? (rows.value.length === 1 ? rows.value[0]! : null))
const structure = computed(() => {
  const current = vessel.value
  if (!current || !comparable.value) return null
  return schedule.review(current.id).shape
})
const keepingCurrent = computed(() => structure.value === 'none' && !addedManualRow())
const fieldCompare = computed(() => {
  if (!comparable.value) return false
  if (pendingSyncFields.value.some((field) => field.side !== 'MATCH')) return true
  if (structure.value) return false
  return rows.value.length <= 1
})

const headerAlert = computed(() => {
  const current = vessel.value
  if (!current) return null
  const review = schedule.review(current.id)
  const matchField = review.fields.find((item) => item.side === 'MATCH')
  return mappingHeaderAlert(current, {
    shape: review.shape,
    candidateCount: review.candidateCount,
    previousStatus: matchField?.previousValue,
  })
})

const showingComparison = computed(() => (
  structure.value === 'many' && Boolean(pickedPayloadId.value) && !comparisonDismissed.value
))

const choiceFields = computed(() => pendingSyncFields.value.filter((field) => (
  field.side !== 'MATCH' && !(showingComparison.value && field.side === 'TERMINAL')
)))

const NON_AUTO_INCOMING = new Set(['ETA gap > 3 days', 'No external voyage'])

/** One saved record, and this sync's only record is no longer an automatic match. */
const soleIncoming = computed(() => {
  const current = vessel.value
  const review = currentReview.value
  if (!current || !review || review.shape || review.candidateCount !== 1) return null
  if (choiceFields.value.length) return null
  const match = review.fields.find((field) => field.side === 'MATCH' && field.field === 'match' && field.status === 'pending')
  if (!match || !NON_AUTO_INCOMING.has(match.incomingValue)) return null
  const payloads = schedule.candidates(current.id)
  return payloads.find((payload) => payload.id === match.payloadId) ?? (payloads.length === 1 ? payloads[0]! : null)
})

/** Saved record is still on screen, and none of the returned records is the default comparison. */
const openManyChoice = computed(() => {
  const current = vessel.value
  const review = currentReview.value
  return Boolean(current?.terminalSchedule && review?.shape === 'many' && !review.comparedPayloadId)
})

/** Saved record is still on screen, and one returned record is the default comparison. */
const matchedManyChoice = computed(() => {
  const current = vessel.value
  const review = currentReview.value
  return Boolean(current?.terminalSchedule && review?.shape === 'many' && review.comparedPayloadId)
})

/** Manual matched, then this sync no longer agrees. Compared in a dialog, not on the page. */
const manualCompare = computed(() => {
  const current = vessel.value
  const review = currentReview.value
  return Boolean(
    current?.terminalSchedule
    && current.matchingStatus === 'Pending match'
    && review
    && review.candidateCount > 0,
  )
})

const showAlertActions = computed(() => {
  if (manualCompare.value) return false
  return Boolean(
    openManyChoice.value
    || matchedManyChoice.value
    || choiceFields.value.length
    || soleIncoming.value,
  )
})

const reviewAlert = computed(() => {
  const status = vessel.value?.matchingStatus ?? ''
  const variant = mappingAlertVariant(status)
  if (manualCompare.value) {
    return {
      variant,
      title: 'Review',
      text: 'Compare the saved terminal record with this sync. Choose Keep current or Use this sync, then confirm.',
    }
  }
  if (soleIncoming.value) {
    return {
      variant,
      title: 'Review',
      text: 'This sync is no longer an automatic match. Choose Keep current or Use this sync, then confirm.',
    }
  }
  if (openManyChoice.value) {
    return {
      variant,
      title: 'Multiple terminal records',
      text: 'None of the returned records matches the current voyages. Choose Keep current or select a record before confirming.',
    }
  }
  if (matchedManyChoice.value) {
    return {
      variant,
      title: 'Multiple terminal records',
      text: 'One returned record matches the current voyages, but other fields differ. Choose Keep current, or select another record.',
    }
  }
  if (choiceFields.value.length) {
    return {
      variant,
      title: 'Field differences',
      text: 'Choose Keep current or Use this sync. The same choice applies to every field that differs.',
    }
  }
  if (headerAlert.value) return headerAlert.value
  return {
    variant,
    title: 'Review',
    text: 'Confirm the terminal record for this schedule.',
  }
})

function offerForColumn(columnId: string) {
  if (!fieldCompare.value || showingComparison.value) return undefined
  return pendingSyncFields.value.find((field) => field.side !== 'MATCH' && columnIdForReview(field) === columnId)
}

function offerForDraft(key: TerminalDraftKey) {
  return pendingSyncFields.value.find((field) => {
    if (field.side !== 'TERMINAL') return false
    return draftKeyForColumn(columnIdForReview(field)) === key
  })
}

function offerLabel(value: string, kind: string) {
  if (!value) return '—'
  return kind === 'datetime' ? formatDateTime(value) : value
}

function payloadText(payload: { exportVoyage: string; importVoyage: string; vesselNameCn: string; terminalName: string; vesselStatus: string; eta: string; ata: string; etb: string; atb: string; etd: string; atd: string; cyOpen: string; cyCutoff: string; updateTime: string }, columnId: string) {
  const raw: Record<string, string> = {
    evoyage: payload.exportVoyage,
    ivoyage: payload.importVoyage,
    vesselNameCn: payload.vesselNameCn,
    terminal: payload.terminalName,
    status: payload.vesselStatus,
    eta: payload.eta,
    ata: payload.ata,
    etb: payload.etb,
    atb: payload.atb,
    etd: payload.etd,
    atd: payload.atd,
    cyOpen: payload.cyOpen,
    cyClosing: payload.cyCutoff,
    updateTime: payload.updateTime,
  }
  const value = raw[columnId] ?? ''
  if (!value) return '—'
  const column = CANDIDATE_COLUMN_DEFS.find((item) => item.id === columnId)
  return column?.kind === 'datetime' ? formatDateTime(value) : value
}

function payloadDraftValue(payload: TerminalPayload, key: TerminalDraftKey) {
  switch (key) {
    case 'evoyage': return payload.exportVoyage
    case 'ivoyage': return payload.importVoyage
    case 'vesselNameCn': return payload.vesselNameCn
    case 'terminal': return payload.terminalName
    case 'status': return payload.vesselStatus
    case 'cyClosing': return payload.cyCutoff
    case 'eta': return payload.eta
    case 'ata': return payload.ata
    case 'etb': return payload.etb
    case 'atb': return payload.atb
    case 'etd': return payload.etd
    case 'atd': return payload.atd
    case 'cyOpen': return payload.cyOpen
    case 'updateTime': return payload.updateTime
    case 'vesselOperator': return payload.vesselOperator
    default: return null
  }
}

function comparedPayload() {
  if (!showingComparison.value || !pickedPayloadId.value) return null
  return shapeCandidates.value.find((payload) => payload.id === pickedPayloadId.value) ?? null
}

/** A payload chosen in this review, different from the one already open for comparison. */
function switchedPayload() {
  const payload = comparedPayload()
  if (!payload || payload.id === initialPayloadId.value) return null
  return payload
}

function selectedRecordSentence(payload: TerminalPayload) {
  const parts = [
    payload.exportVoyage ? `Export ${payload.exportVoyage}` : '',
    payload.importVoyage ? `Import ${payload.importVoyage}` : '',
    payload.terminalName,
  ].filter(Boolean)
  const who = parts.length ? ` (${parts.join(' · ')})` : ''
  return `The selected record${who} will be adopted as the latest values.`
}

function recordValueChoice(): 'previous' | 'sync' | null {
  if (recordChoice.value === 'sync') return 'sync'
  if (recordChoice.value === 'current') return 'previous'
  return null
}

function recordFieldDiff(columnId: string) {
  const payload = soleIncoming.value
  const row = activeRow.value
  const key = draftKeyForColumn(columnId)
  if (!payload || !row || !key) return null
  const incoming = payloadDraftValue(payload, key)
  if (incoming == null) return null
  const previous = row.draft[key]
  if (previous === incoming) return null
  const column = terminalFields.find((item) => item.id === columnId)
  const kind = column?.kind === 'datetime' ? 'datetime' : 'text'
  return { previous: offerLabel(previous, kind), incoming: offerLabel(incoming, kind) }
}

function readonlyDiff(columnId: string) {
  const payload = comparedPayload()
  const row = activeRow.value
  const key = draftKeyForColumn(columnId)
  if (!payload || !row || !key) return null
  const incoming = payloadDraftValue(payload, key)
  if (incoming == null) return null
  const previous = row.draft[key]
  if (previous === incoming) return null
  const column = terminalFields.find((item) => item.id === columnId)
  const kind = column?.kind === 'datetime' ? 'datetime' : 'text'
  return { previous: offerLabel(previous, kind), incoming: offerLabel(incoming, kind) }
}

function rememberChoice(field: { side: string; field: string }, value: string) {
  syncDrafts.value[syncKey(field.side, field.field)] = value
}

function chooseColumn(columnId: string, choice: 'previous' | 'sync') {
  const field = offerForColumn(columnId)
  if (!field) return
  fieldChoices.value = { ...fieldChoices.value, [syncKey(field.side, field.field)]: choice }
  const value = choice === 'sync' ? field.incomingValue : field.previousValue
  rememberChoice(field, value)
  if (field.side === 'LARA') {
    laraValues.value[columnId] = value
    return
  }
  const key = draftKeyForColumn(columnId)
  if (key && activeRow.value) activeRow.value.draft[key] = value
}

function chooseAll(choice: 'previous' | 'sync') {
  for (const field of choiceFields.value) {
    chooseColumn(columnIdForReview(field), choice)
  }
}

function choicePayload() {
  const current = vessel.value
  if (!current) return null
  const payloads = schedule.candidates(current.id)
  const payloadId = choiceFields.value.find((field) => field.side === 'TERMINAL')?.payloadId
    ?? initialPayloadId.value
    ?? currentReview.value?.comparedPayloadId
  if (payloadId) return payloads.find((payload) => payload.id === payloadId) ?? null
  return payloads.length === 1 ? payloads[0]! : null
}

function chooseRecord(choice: 'current' | 'sync') {
  recordChoice.value = choice
  chooseAll(choice === 'current' ? 'previous' : 'sync')
}

function unchosenPendingFields() {
  return choiceFields.value.filter((field) => !fieldChoices.value[syncKey(field.side, field.field)])
}

function onLaraInput(columnId: string, value: string) {
  laraValues.value[columnId] = value
}

function onTerminalInput(key: TerminalDraftKey, value: string) {
  const row = activeRow.value
  if (!row) return
  row.draft[key] = value
}

function startLaraEdit() {
  laraEditing.value = true
}

function cancelLaraEdit() {
  laraValues.value = { ...laraBaseline.value }
  laraEditing.value = false
}

function selectRow(row: TerminalRow) {
  if (formRowId.value === row.id) {
    if (!row.editing) formRowId.value = null
    return
  }
  formRowId.value = row.id
}

function startRowEdit(row: TerminalRow) {
  if (!row.editSnapshot) row.editSnapshot = cloneDraft(row.draft)
  row.editing = true
}

function cancelRowEdit(row: TerminalRow) {
  if (row.editSnapshot) row.draft = cloneDraft(row.editSnapshot)
  row.editing = false
  row.editSnapshot = null
  const emptyNew = row.source === 'manual' && !row.baseline && !Object.values(row.draft).some((value) => value.trim())
  if (emptyNew) deleteRow(row)
}

function addRow() {
  if (!showAdd.value) return
  const existing = addedManualRow()
  if (existing) {
    selectedId.value = existing.id
    formRowId.value = existing.id
    return
  }
  const draft = emptyTerminalDraft()
  const row: TerminalRow = {
    id: `row-${rowSeq++}`,
    source: 'manual',
    originIndex: null,
    draft,
    baseline: null,
    editing: true,
    editSnapshot: cloneDraft(draft),
  }
  rows.value.push(row)
  selectedId.value = row.id
  formRowId.value = row.id
}

function deleteRow(row: TerminalRow) {
  if (row.source !== 'manual') return
  rows.value = rows.value.filter((item) => item.id !== row.id)
  if (selectedId.value === row.id) {
    const restored = rows.value.find((item) => item.id === initialSelectedId.value)
    selectedId.value = restored?.id ?? (rows.value.length === 1 ? rows.value[0]!.id : null)
  }
  if (formRowId.value === row.id) formRowId.value = null
}

function rowDirty(row: TerminalRow) {
  if (!row.baseline) return Object.values(row.draft).some((value) => value.trim())
  return (Object.keys(row.draft) as TerminalDraftKey[]).some((key) => row.draft[key] !== row.baseline?.[key])
}

function setMatch(row: TerminalRow, checked: boolean) {
  selectedId.value = checked ? row.id : null
}

function rowSignature(draft: TerminalDraft) {
  return [draft.evoyage, draft.ivoyage, draft.terminal, draft.etd].join('\u0000')
}

function lockedFields() {
  return new Set(Object.keys(vessel.value?.manualOverrides ?? {}))
}

function applyLaraSync() {
  const next = { ...laraValues.value }
  for (const column of LARA_COLUMNS) {
    if (CALCULATED_LARA.has(column.id)) continue
    if (comparable.value && offerForColumn(column.id)) continue
    next[column.id] = laraSource.value[column.id] ?? next[column.id]
    laraBaseline.value[column.id] = next[column.id] ?? ''
  }
  const changes = diffLara(laraValues.value, next)
  if (changes.length) {
    pendingSyncs.value.push({ source: 'LARA', at: new Date().toISOString(), changes })
  }
  laraValues.value = next
}

function applyProtectedTerminalSync() {
  const row = activeRow.value
  if (!row || row.originIndex == null) return
  const source = sourceDrafts.value[row.originIndex]
  if (!source) return
  const changes: HistoryDetail[] = []
  for (const key of Object.keys(row.draft) as TerminalDraftKey[]) {
    if (offerForDraft(key)) continue
    const from = row.draft[key]
    const to = source[key]
    if (from === to) continue
    row.draft[key] = to
    if (row.baseline) row.baseline[key] = to
    const origin = originDrafts.value[row.originIndex]
    if (origin) origin[key] = to
    changes.push({ field: key, from, to })
  }
  if (changes.length) pendingSyncs.value.push({ source: 'Terminal', at: new Date().toISOString(), changes })
}

function applyTerminalSync() {
  if (comparable.value) {
    if (structure.value) return
    applyProtectedTerminalSync()
    return
  }
  const previous = selectedRow.value ? rowSignature(selectedRow.value.draft) : ''
  const changes = indexDiff(originDrafts.value, sourceDrafts.value)
  pendingSyncs.value.push({ source: 'Terminal', at: new Date().toISOString(), changes })
  const nextDrafts = sourceDrafts.value.map(cloneDraft)
  originDrafts.value = nextDrafts.map(cloneDraft)
  committedDrafts.value = nextDrafts.map(cloneDraft)
  rows.value = nextDrafts.map((draft, index) => rowFromDraft(draft, 'sync', index))
  formRowId.value = null
  if (rows.value.length === 0) {
    selectedId.value = null
  } else if (rows.value.length > 1) {
    selectedId.value = rows.value.find((row) => rowSignature(row.draft) === previous)?.id ?? null
  } else {
    selectedId.value = rows.value[0]!.id
  }
}

function formDirty() {
  return Boolean(laraManualChanges().length || createdDetails().length || updatedDetails().length || manualMatch())
}

function requestSync(side: 'LARA' | 'Terminal') {
  const current = vessel.value
  if (!current) return
  if (side === 'Terminal' && !coverage.canCallFeituo(current.pointCode)) {
    toast.error('This port has no terminal coverage, so no terminal request is sent')
    return
  }
  if (formDirty()) {
    syncSide.value = side
    return
  }
  if (side === 'LARA') applyLaraSync()
  else applyTerminalSync()
}

function openSelect() {
  pendingSelectId.value = selectedId.value
  selectOpen.value = true
}

function openMatchDialog() {
  if (rows.value.length > 1) {
    openSelect()
    return
  }
  dialogPayloadId.value = comparisonDismissed.value ? null : pickedPayloadId.value
  shapeOpen.value = true
}

function pickDialogPayload(id: string) {
  dialogPayloadId.value = id
  applyDialogPayload()
}

function pickSelectRow(id: string) {
  pendingSelectId.value = id
  useSelection()
}

function keepCurrentRecord() {
  recordChoice.value = 'current'
  comparisonDismissed.value = true
  pickedPayloadId.value = null
  dialogPayloadId.value = null
}

function openCompare() {
  const payloads = shapeCandidates.value
  if (payloads.length === 1) {
    comparePayloadId.value = payloads[0]!.id
  } else if (recordChoice.value === 'sync' && pickedPayloadId.value) {
    comparePayloadId.value = pickedPayloadId.value
  } else {
    comparePayloadId.value = null
  }
  compareOpen.value = true
}

function savedTerminalDraft() {
  const row = activeRow.value
  if (row?.baseline) return row.baseline
  return row?.draft ?? null
}

function compareFieldText(columnId: string) {
  const key = draftKeyForColumn(columnId)
  const column = terminalFields.find((item) => item.id === columnId)
  const kind = column?.kind === 'datetime' ? 'datetime' : 'text'
  const savedDraft = savedTerminalDraft()
  const saved = savedDraft && key ? displayDraftValue(savedDraft, key, kind) : '—'
  const payload = shapeCandidates.value.find((item) => item.id === comparePayloadId.value) ?? null
  const raw = payload && key ? payloadDraftValue(payload, key) : null
  const incoming = raw == null || raw === ''
    ? '—'
    : kind === 'datetime'
      ? formatDateTime(raw)
      : raw
  return { saved, incoming, differs: saved !== incoming }
}

function applyPayloadToDraft(payload: TerminalPayload) {
  const row = activeRow.value
  if (!row) return
  for (const column of terminalFields) {
    const key = draftKeyForColumn(column.id)
    if (!key) continue
    const incoming = payloadDraftValue(payload, key)
    if (incoming != null) row.draft[key] = incoming
  }
}

function restoreSavedDraft() {
  const row = activeRow.value
  if (!row?.baseline) return
  row.draft = cloneDraft(row.baseline)
}

function applyCompare(choice: 'current' | 'sync') {
  if (choice === 'sync') {
    const payload = shapeCandidates.value.find((item) => item.id === comparePayloadId.value)
    if (!payload) return
    comparisonDismissed.value = true
    pickedPayloadId.value = payload.id
    recordChoice.value = 'sync'
    applyPayloadToDraft(payload)
    chooseAll('sync')
  } else {
    comparisonDismissed.value = true
    pickedPayloadId.value = null
    dialogPayloadId.value = null
    recordChoice.value = 'current'
    restoreSavedDraft()
    chooseAll('previous')
  }
  compareOpen.value = false
}

function applyDialogPayload() {
  if (!dialogPayloadId.value) {
    comparisonDismissed.value = true
    pickedPayloadId.value = null
  } else {
    comparisonDismissed.value = false
    pickedPayloadId.value = dialogPayloadId.value
    recordChoice.value = null
  }
  shapeOpen.value = false
}

function useSelection() {
  const next = pendingSelectId.value ?? initialSelectedId.value
  if (!next) {
    selectOpen.value = false
    return
  }
  if (next === selectedId.value) {
    selectOpen.value = false
    return
  }
  const current = activeRow.value
  if (current && rowDirty(current)) {
    replaceOpen.value = true
    return
  }
  selectedId.value = next
  selectOpen.value = false
}

function replaceSelection() {
  const next = pendingSelectId.value
  if (!next) return
  const current = activeRow.value
  if (current) current.draft = cloneDraft(current.baseline ?? emptyTerminalDraft())
  selectedId.value = next
  replaceOpen.value = false
  selectOpen.value = false
}

function confirmSync() {
  const side = syncSide.value
  syncSide.value = null
  if (side === 'LARA') applyLaraSync()
  else if (side === 'Terminal') applyTerminalSync()
}

function laraManualChanges() {
  return diffLara(laraBaseline.value, laraValues.value)
}

function createdDetails() {
  const details: HistoryDetail[] = []
  for (const row of rows.value) {
    if (row.baseline) continue
    details.push(...filledDiff(emptyTerminalDraft(), row.draft))
  }
  return details
}

function updatedDetails() {
  if (manualCompare.value && recordChoice.value) return []
  const details: HistoryDetail[] = []
  for (const row of rows.value) {
    if (!row.baseline || !rowDirty(row)) continue
    details.push(...filledDiff(row.baseline, row.draft))
  }
  for (const draft of committedDrafts.value) {
    const kept = rows.value.some((row) => row.baseline && sameDraft(row.baseline, draft))
    if (!kept) details.push(...filledDiff(draft, emptyTerminalDraft()))
  }
  return details
}

function manualMatch(): PendingMatch | null {
  if (manualCompare.value && recordChoice.value) return null
  const current = vessel.value
  const selected = selectedRow.value
  const to = matchLabel(selected)
  if (
    comparable.value
    && current
    && selected?.baseline
    && sameSchedule(current.terminalSchedule, selected.baseline)
  ) {
    return null
  }
  if (to === loggedMatchLabel.value) return null
  return {
    at: new Date().toISOString(),
    from: loggedMatchLabel.value,
    to,
    auto: false,
  }
}

function fieldLabel(field: string) {
  return LARA_COLUMNS.find((column) => column.id === field)?.label
    ?? CANDIDATE_COLUMN_DEFS.find((column) => column.id === field)?.label
    ?? (field === 'vesselOperator' ? 'Vessel operator' : field)
}

function choiceFor(field: { side: string; field: string }) {
  return fieldChoices.value[syncKey(field.side, field.field)] ?? null
}

/** Confirm keeps the values on screen. Nothing was edited, and no field takes this sync. */
function adoptsCurrentValues() {
  if (
    switchedPayload()
    || pendingSyncs.value.length
    || pendingMatches.value.length
    || laraManualChanges().length
    || createdDetails().length
    || updatedDetails().length
    || manualMatch()
  ) return false
  return choiceFields.value.every((field) => choiceFor(field) !== 'sync')
}

const confirmCopy = computed(() => {
  const lines: string[] = []
  if (pendingSyncs.value.some((sync) => sync.source === 'LARA')) lines.push('LARA will be saved from the latest sync.')
  if (pendingSyncs.value.some((sync) => sync.source === 'Terminal')) {
    lines.push('Terminal records will be saved from the latest sync.')
  }
  const lara = laraManualChanges()
  if (lara.length) lines.push(`LARA: ${lara.map((change) => fieldLabel(change.field)).join(', ')}.`)
  const created = createdDetails()
  const updated = updatedDetails()
  if (created.length) lines.push('Terminal: new record added.')
  if (updated.length) lines.push('Terminal: record updated or removed.')
  for (const match of pendingMatches.value) {
    lines.push(match.to === 'Unconfirmed' ? 'Match: clear the current match.' : `Match: auto ${match.from} → ${match.to}.`)
  }
  const chosen = manualMatch()
  if (chosen) {
    lines.push(chosen.to === 'Unconfirmed' ? 'Match: cancel the current terminal match.' : `Match: ${chosen.from} → ${chosen.to}.`)
  } else if (hasReviewEdits() && selectedRow.value && !pendingMatches.value.length) {
    lines.push(`Match: keep ${matchLabel(selectedRow.value)}.`)
  }
  const keptFields = choiceFields.value.filter((field) => choiceFor(field) === 'previous')
  const syncFields = choiceFields.value.filter((field) => choiceFor(field) === 'sync')
  const adopted = switchedPayload()
  if (adopted) {
    lines.push(selectedRecordSentence(adopted))
  } else if (manualCompare.value && recordChoice.value === 'sync') {
    lines.push('This sync will be adopted as the latest values.')
  } else if (manualCompare.value && recordChoice.value === 'current') {
    lines.push('The current values will be adopted as the latest values.')
  } else if (soleIncoming.value && recordChoice.value === 'sync') {
    lines.push('This sync will be adopted as the latest values.')
  } else if ((soleIncoming.value || openManyChoice.value || matchedManyChoice.value) && recordChoice.value === 'current') {
    lines.push('The current values will be adopted as the latest values.')
  } else if (adoptsCurrentValues()) {
    lines.push('The current values will be adopted as the latest values.')
  } else if (keptFields.length && syncFields.length) {
    lines.push(`Current values will be adopted as the latest values for ${keptFields.map((field) => fieldLabel(field.field)).join(', ')}.`)
    lines.push(`This sync will be adopted for ${syncFields.map((field) => fieldLabel(field.field)).join(', ')}.`)
  } else if (syncFields.length) {
    lines.push('This sync will be adopted as the latest values.')
  } else if (keptFields.length) {
    lines.push('The current values will be adopted as the latest values.')
  }
  return {
    title: 'Confirm review',
    description: lines.join(' '),
    confirmLabel: 'Confirm',
  }
})

function hasReviewEdits() {
  return Boolean(
    pendingSyncs.value.length
    || pendingMatches.value.length
    || laraManualChanges().length
    || createdDetails().length
    || updatedDetails().length
    || manualMatch(),
  )
}

function hasChanges() {
  return hasReviewEdits() || pendingSyncFields.value.length > 0 || keepingCurrent.value
}

function closePage() {
  const next = tabs.close(route.path, route.fullPath)
  void router.push(next ?? '/search')
}

onBeforeRouteLeave(async () => {
  if (!confirmOpen.value && !syncSide.value && !compareOpen.value) return
  confirmOpen.value = false
  syncSide.value = null
  compareOpen.value = false
  await nextTick()
})

function openHistory() {
  const current = vessel.value
  if (!current) return
  void router.push(`/vessels/${current.id}/activity-log`)
}

function cancelEdits() {
  const current = vessel.value
  if (!current) return
  selectOpen.value = false
  shapeOpen.value = false
  replaceOpen.value = false
  pendingSelectId.value = null
  init(current)
}

function save() {
  const current = vessel.value
  if (!current) return
  if (!selectedRow.value || (structure.value === 'many' && !activeRow.value && !showingComparison.value)) {
    toast.error(showAdd.value ? 'Select or add a terminal record before confirming' : 'Select a terminal record before confirming')
    return
  }
  if (!hasChanges() && current.matchingStatus === 'Manual matched' && !showingComparison.value && !keepingCurrent.value) {
    toast.error('Nothing to confirm')
    return
  }
  if (manualCompare.value && recordChoice.value !== 'current' && recordChoice.value !== 'sync') {
    toast.error('Choose Keep current or Use this sync')
    return
  }
  if (choiceFields.value.length && recordChoice.value !== 'current' && recordChoice.value !== 'sync') {
    toast.error('Choose Keep current or Use this sync')
    return
  }
  if (unchosenPendingFields().length) {
    toast.error('Choose Keep current or Use this sync')
    return
  }
  if (soleIncoming.value && !recordChoice.value) {
    toast.error('Choose Keep current or Use this sync')
    return
  }
  if (openManyChoice.value && recordChoice.value !== 'current' && recordChoice.value !== 'sync' && !showingComparison.value) {
    toast.error('Choose Keep current or select a record')
    return
  }
  confirmOpen.value = true
}

async function confirmSave() {
  const current = vessel.value
  if (!current) return
  const selected = selectedRow.value
  if (!selected) {
    toast.error(showAdd.value ? 'Select or add a terminal record before confirming' : 'Select a terminal record before confirming')
    return
  }
  const fieldSync = choiceFields.value.length && recordChoice.value === 'sync' ? choicePayload() : null
  const chosenSync = recordChoice.value === 'sync'
    ? shapeCandidates.value.find((payload) => payload.id === pickedPayloadId.value) ?? null
    : null
  const adopted = chosenSync ?? switchedPayload() ?? (recordChoice.value === 'sync' ? (soleIncoming.value ?? fieldSync) : null)
  const row = draftToSchedule(selected.draft)
  const keptPayload = recordChoice.value === 'current' && (choiceFields.value.length || matchedManyChoice.value)
    ? choicePayload()
    : null
  if (
    keptPayload
    && !choiceFields.value.some((field) => field.side === 'TERMINAL' && field.field === 'terminalName')
  ) {
    row.terminal = keptPayload.terminalName
  }
  if (structure.value === 'many' && pickedPayloadId.value && !adopted) schedule.adoptCandidate(current.id, pickedPayloadId.value)
  if (keepingCurrent.value) schedule.keepShape(current.id)
  const keptBinding = keepingCurrent.value && !hasReviewEdits()
  const chosen = manualMatch()
  const matches = [...pendingMatches.value, ...(chosen ? [chosen] : [])]
  if (hasReviewEdits()) store.saveReviewMatch(current.id, {
    laraApply: diffLara(laraOrigin.value, laraValues.value),
    laraManual: laraManualChanges(),
    terminalApply: persistedTerminalChanges(),
    terminalCreated: createdDetails(),
    terminalUpdated: updatedDetails(),
    rows: rows.value.map((row) => draftToSchedule(row.draft)),
    selectedIndex: rows.value.findIndex((row) => row.id === selectedId.value),
    reason: remark.value,
    syncs: pendingSyncs.value.map((sync) => ({ ...sync, changes: [...sync.changes] })),
    matches,
  })
  if (keptBinding) store.recordKeptBinding(current.id, remark.value)
  const choices = syncChoices()
  if (choices.length) {
    schedule.confirm(current.id, choices)
    if (!hasReviewEdits()) {
      store.recordConfirmedFields(
        current.id,
        choices.filter((choice) => choice.side !== 'MATCH').map((choice) => ({
          field: choice.field,
          from: choice.previousValue,
          to: choice.typed,
        })),
        remark.value,
      )
    }
  }
  schedule.sealReviewed(
    current.id,
    row,
    adopted?.vesselOperator || selected.draft.vesselOperator,
    remark.value,
    adopted ? false : selected.source === 'manual',
    adopted ? { source: 'SYNC', payloadId: adopted.id, snapshot: adopted } : undefined,
  )
  confirmOpen.value = false
  toast.success('Review confirmed')
  await nextTick()
  closePage()
}

const syncCopy = computed(() => ({
  title: syncSide.value === 'Terminal' ? 'Sync latest Terminal' : 'Sync latest LARA',
  description: 'Unsaved edits will be lost. Latest values replace fields that are not waiting for confirmation.',
}))

const shapeCandidates = computed(() => (vessel.value ? schedule.candidates(vessel.value.id) : []))
</script>

<template>
  <div v-if="vessel" class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <PageBreadcrumb
        :items="[
          { label: 'Vessel schedule search', to: '/search' },
          { label: vessel.vesselName, to: `/vessels/${vessel.id}/view` },
          { label: 'Review' },
        ]"
      />
      <div class="flex flex-wrap items-center gap-2">
        <VesselAdjustMenu :vessel="vessel" size="default" hide-mismatch @pick="quickAction = $event" />
        <Button type="button" variant="outline" @click="openHistory">Activity logs</Button>
        <Button type="button" variant="outline" @click="requestSync('LARA')">Sync latest LARA</Button>
        <Button type="button" variant="outline" @click="requestSync('Terminal')">Sync latest Terminal</Button>
      </div>
    </div>
    <ScheduleRecordHeading :vessel="vessel" />
    <SchedulePlatformFields :vessel="vessel" />
    <Alert :variant="reviewAlert.variant">
      <AlertTitle>{{ reviewAlert.title }}</AlertTitle>
      <AlertDescription>
        <p v-if="vessel.remark">{{ vessel.remark }}</p>
        <p v-else>{{ reviewAlert.text }}</p>
      </AlertDescription>
      <div v-if="showAlertActions" class="mt-2 flex flex-wrap gap-2">
        <template v-if="!manualCompare && (openManyChoice || matchedManyChoice)">
          <Button
            type="button"
            variant="outline"
            class="text-foreground hover:text-foreground"
            :aria-pressed="recordChoice === 'current'"
            @click="keepCurrentRecord"
          >
            Keep current
          </Button>
        </template>
        <template v-if="!manualCompare && choiceFields.length">
          <Button
            type="button"
            variant="outline"
            class="text-foreground hover:text-foreground"
            :aria-pressed="recordChoice === 'current'"
            @click="chooseRecord('current')"
          >
            Keep current
          </Button>
          <Button
            type="button"
            variant="outline"
            class="text-foreground hover:text-foreground"
            :aria-pressed="recordChoice === 'sync'"
            @click="chooseRecord('sync')"
          >
            Use this sync
          </Button>
        </template>
        <template v-if="!manualCompare && soleIncoming">
          <Button
            type="button"
            variant="outline"
            class="text-foreground hover:text-foreground"
            :aria-pressed="recordChoice === 'current'"
            @click="recordChoice = 'current'"
          >
            Keep current
          </Button>
          <Button
            type="button"
            variant="outline"
            class="text-foreground hover:text-foreground"
            :aria-pressed="recordChoice === 'sync'"
            @click="recordChoice = 'sync'"
          >
            Use this sync
          </Button>
        </template>
      </div>
    </Alert>
    <div class="grid items-start gap-4 lg:grid-cols-2">
      <DataSection title="LARA">
        <dl>
          <template v-for="column in LARA_COLUMNS" :key="column.id">
            <template v-if="!HIDDEN_LARA.has(column.id)">
            <div class="grid gap-1 border-b py-2 sm:grid-cols-[11rem_1fr] sm:items-center">
              <div class="flex items-center gap-1 text-sm text-muted-foreground">
                {{ column.label }}
                <SyncFieldAlert v-if="fieldCompare && !offerForColumn(column.id)" :schedule-id="vessel.id" :column-id="column.id" />
              </div>
              <PendingFieldChoice
                v-if="offerForColumn(column.id) && recordChoice !== 'current' && !manualCompare"
                readonly
                :previous="offerLabel(offerForColumn(column.id)!.previousValue, column.kind)"
                :incoming="offerLabel(offerForColumn(column.id)!.incomingValue, column.kind)"
                :choice="recordValueChoice()"
              />
              <p v-else class="text-sm">{{ displayLara(column.id, column.kind) }}</p>
            </div>
            </template>
          </template>
        </dl>
      </DataSection>

      <DataSection title="Terminal">
        <template v-if="activeRow && !(manualCompare && !recordChoice)" #actions>
          <Button
            v-if="showSelect && !manualCompare"
            type="button"
            size="sm"
            @click="openMatchDialog"
          >
            Choose
          </Button>
          <Button
            v-if="manualCompare"
            type="button"
            size="sm"
            @click="openCompare"
          >
            Compare
          </Button>
          <Button
            v-if="activeRow.source === 'manual' && (editMode === 'all' || !activeRow.baseline)"
            type="button"
            variant="destructive"
            size="sm"
            @click="deleteRow(activeRow)"
          >
            Delete
          </Button>
        </template>
        <div
          v-if="!activeRow && !rows.length"
          class="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center"
        >
          <p class="text-sm font-medium">No terminal record</p>
          <p class="text-sm text-muted-foreground">Add a terminal record before confirming.</p>
          <Button
            v-if="showAdd"
            type="button"
            size="sm"
            @click="addRow"
          >
            Add
          </Button>
        </div>
        <div
          v-else-if="!activeRow"
          class="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center"
        >
          <p class="text-sm font-medium">Multiple terminal records</p>
          <p class="text-sm text-muted-foreground">{{ showAdd ? 'Choose one record, or add a new one.' : 'Choose one record.' }}</p>
          <Button
            v-if="showSelect && !manualCompare"
            type="button"
            size="sm"
            @click="openMatchDialog"
          >
            Choose
          </Button>
        </div>
        <div
          v-else-if="manualCompare && !recordChoice"
          class="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center"
        >
          <p class="text-sm text-muted-foreground">The terminal record stays hidden until a side is chosen.</p>
          <Button
            type="button"
            size="sm"
            @click="openCompare"
          >
            Compare
          </Button>
        </div>
        <div v-else>
          <dl>
            <template v-for="column in terminalFields" :key="column.id">
              <div
                v-if="draftKeyForColumn(column.id)"
                class="grid gap-1 border-b py-2 sm:grid-cols-[11rem_1fr] sm:items-center"
              >
                <div class="flex items-center gap-1 text-sm text-muted-foreground">
                  {{ column.label }}
                  <SyncFieldAlert v-if="fieldCompare && !manualCompare && !readonlyDiff(column.id) && !offerForColumn(column.id) && !recordFieldDiff(column.id)" :schedule-id="vessel.id" :column-id="column.id" />
                </div>
                <PendingFieldChoice
                  v-if="!manualCompare && recordFieldDiff(column.id) && recordChoice !== 'current'"
                  readonly
                  :previous="recordFieldDiff(column.id)!.previous"
                  :incoming="recordFieldDiff(column.id)!.incoming"
                  :choice="recordValueChoice()"
                />
                <PendingFieldChoice
                  v-else-if="!manualCompare && readonlyDiff(column.id) && recordChoice !== 'current'"
                  readonly
                  :previous="readonlyDiff(column.id)!.previous"
                  :incoming="readonlyDiff(column.id)!.incoming"
                  :choice="switchedPayload() ? 'sync' : null"
                />
                <PendingFieldChoice
                  v-else-if="!manualCompare && offerForColumn(column.id) && recordChoice !== 'current'"
                  readonly
                  :previous="offerLabel(offerForColumn(column.id)!.previousValue, column.kind)"
                  :incoming="offerLabel(offerForColumn(column.id)!.incomingValue, column.kind)"
                  :choice="recordValueChoice()"
                />
                <p v-else-if="manualCompare" class="text-sm">
                  {{ displayDraftValue(activeRow.draft, draftKeyForColumn(column.id)!, column.kind === 'datetime' ? 'datetime' : 'text') }}
                </p>
                <DateTimePicker
                  v-else-if="draftEditable(draftKeyForColumn(column.id)!) && column.kind === 'datetime'"
                  :model-value="datetimeInputValue(activeRow.draft[draftKeyForColumn(column.id)!])"
                  @update:model-value="onTerminalInput(draftKeyForColumn(column.id)!, datetimeToIso($event))"
                />
                <Input
                  v-else-if="draftEditable(draftKeyForColumn(column.id)!)"
                  :model-value="activeRow.draft[draftKeyForColumn(column.id)!]"
                  class="h-8"
                  @update:model-value="onTerminalInput(draftKeyForColumn(column.id)!, String($event))"
                />
                <p v-else class="text-sm">
                  {{ displayDraftValue(activeRow.draft, draftKeyForColumn(column.id)!, column.kind === 'datetime' ? 'datetime' : 'text') }}
                </p>
              </div>
            </template>
          </dl>
        </div>
      </DataSection>
    </div>
    <div class="space-y-4">
      <label class="grid w-full gap-1">
        <span class="text-sm text-muted-foreground">Remark</span>
        <Textarea v-model="remark" rows="2" class="w-full" placeholder="Saved as the activity log description" />
      </label>
      <div class="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" @click="cancelEdits">Cancel</Button>
        <Button type="button" variant="primary" @click="save">Confirm</Button>
      </div>
    </div>
    <VesselQuickActions
      :vessel="vessel"
      :action="quickAction"
      @close="quickAction = null"
    />
  </div>
  <Alert v-else variant="warning">
    <AlertDescription>This schedule record is no longer available.</AlertDescription>
  </Alert>

  <Dialog v-if="confirmOpen" :open="true" @update:open="confirmOpen = $event">
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>{{ confirmCopy.title }}</DialogTitle>
        <DialogDescription>{{ confirmCopy.description }}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" @click="confirmOpen = false">Back</Button>
        <Button type="button" variant="primary" @click="confirmSave">{{ confirmCopy.confirmLabel }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-if="syncSide" :open="true" @update:open="syncSide = $event ? syncSide : null">
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>{{ syncCopy.title }}</DialogTitle>
        <DialogDescription>{{ syncCopy.description }}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" @click="syncSide = null">Back</Button>
        <Button type="button" variant="primary" @click="confirmSync">Sync</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-if="selectOpen" :open="true" @update:open="selectOpen = $event">
    <DialogContent size="2xl" :class="REVIEW_DIALOG_CLASS">
      <DialogHeader>
        <DialogTitle>Select a terminal record</DialogTitle>
        <DialogDescription>Click a row to use it.</DialogDescription>
      </DialogHeader>
      <div class="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="whitespace-nowrap">Match</TableHead>
              <TableHead v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                {{ column.label }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="row in rows"
              :key="row.id"
              class="cursor-pointer"
              :data-state="pendingSelectId === row.id ? 'selected' : undefined"
              :class="pendingSelectId === row.id ? '!bg-accent' : undefined"
              @click="pickSelectRow(row.id)"
            >
              <TableCell class="whitespace-nowrap">{{ row.id === initialSelectedId ? 'Current' : '' }}</TableCell>
              <TableCell v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                {{ displayDraftValue(row.draft, column.id, column.kind) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" @click="selectOpen = false">Cancel</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-if="shapeOpen" :open="true" @update:open="shapeOpen = $event">
    <DialogContent size="2xl" :class="REVIEW_DIALOG_CLASS">
      <DialogHeader>
        <DialogTitle>Select a terminal record</DialogTitle>
        <DialogDescription>Click a row to use it.</DialogDescription>
      </DialogHeader>
      <div class="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="whitespace-nowrap">Match</TableHead>
              <TableHead v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                {{ column.label }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="payload in shapeCandidates"
              :key="payload.id"
              class="cursor-pointer"
              :data-state="dialogPayloadId === payload.id ? 'selected' : undefined"
              :class="dialogPayloadId === payload.id ? '!bg-accent' : undefined"
              @click="pickDialogPayload(payload.id)"
            >
              <TableCell class="whitespace-nowrap">{{ payload.id === initialPayloadId ? 'Current' : '' }}</TableCell>
              <TableCell v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                {{ payloadText(payload, column.id) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" @click="shapeOpen = false">Cancel</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-if="compareOpen" :open="true" @update:open="compareOpen = $event">
    <DialogContent size="2xl" :class="REVIEW_DIALOG_CLASS">
      <DialogHeader>
        <DialogTitle>Compare terminal records</DialogTitle>
        <DialogDescription>
          <template v-if="shapeCandidates.length > 1 && !comparePayloadId">
            The saved terminal record is above. Choose a record from this sync below.
          </template>
          <template v-else>
            The saved terminal record is on the left. This sync is on the right. Choose one whole record.
          </template>
        </DialogDescription>
      </DialogHeader>
      <div v-if="shapeCandidates.length > 1 && !comparePayloadId" class="grid items-start gap-4">
        <div class="min-w-0">
          <p class="mb-2 text-sm font-medium">Current</p>
          <dl class="grid grid-cols-2 gap-x-6">
            <div
              v-for="column in terminalFields"
              :key="column.id"
              v-show="draftKeyForColumn(column.id)"
              class="grid grid-cols-[9rem_1fr] items-center gap-2 border-b py-2"
            >
              <div class="text-sm text-muted-foreground">{{ column.label }}</div>
              <p class="text-sm">{{ compareFieldText(column.id).saved }}</p>
            </div>
          </dl>
        </div>
        <div class="min-w-0">
          <p class="mb-2 text-sm font-medium">This sync</p>
          <div class="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                    {{ column.label }}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="payload in shapeCandidates"
                  :key="payload.id"
                  class="cursor-pointer"
                  @click="comparePayloadId = payload.id"
                >
                  <TableCell v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                    {{ payloadText(payload, column.id) }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      <div v-else class="grid grid-cols-2 gap-x-6">
        <div class="flex h-11 items-center border-b">
          <p class="text-sm font-medium leading-none">Current</p>
        </div>
        <div class="flex h-11 items-center justify-between gap-2 border-b">
          <p class="text-sm font-medium leading-none">This sync</p>
          <Button
            v-if="shapeCandidates.length > 1"
            type="button"
            size="sm"
            class="shrink-0"
            @click="comparePayloadId = null"
          >
            Choose
          </Button>
        </div>
        <template v-for="column in terminalFields" :key="column.id">
          <template v-if="draftKeyForColumn(column.id)">
            <div class="grid grid-cols-[9rem_1fr] items-center gap-2 border-b py-2">
              <div class="text-sm text-muted-foreground">{{ column.label }}</div>
              <p class="text-sm" :class="compareFieldText(column.id).differs ? 'text-muted-foreground' : ''">
                {{ compareFieldText(column.id).saved }}
              </p>
            </div>
            <div class="grid grid-cols-[9rem_1fr] items-center gap-2 border-b py-2">
              <div class="text-sm text-muted-foreground">{{ column.label }}</div>
              <p class="text-sm" :class="compareFieldText(column.id).differs ? 'text-amber-800 dark:text-amber-200' : ''">
                {{ compareFieldText(column.id).incoming }}
              </p>
            </div>
          </template>
        </template>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" @click="compareOpen = false">Cancel</Button>
        <Button type="button" variant="outline" @click="applyCompare('current')">Keep current</Button>
        <Button type="button" variant="outline" :disabled="!comparePayloadId" @click="applyCompare('sync')">
          Use this sync
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-if="replaceOpen" :open="true" @update:open="replaceOpen = $event">
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Replace edits</DialogTitle>
        <DialogDescription>The edits in the form will be replaced by the selected record.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" @click="replaceOpen = false">Back</Button>
        <Button type="button" variant="primary" @click="replaceSelection">Replace</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
