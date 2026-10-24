<script setup lang="ts">
import { computed, nextTick, provide, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { brandFromVoyage } from '@/domain/lara-brand'
import DataSection from '@/components/DataSection.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import ReadonlyField from '@/components/ReadonlyField.vue'
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
import { mappingHeaderAlert } from '@/features/vessel-schedule/mapping-header'
import { type ScheduleQuickAction } from '@/features/vessel-schedule/mismatch-actions'
import ScheduleRecordHeading from '@/features/vessel-schedule/ScheduleRecordHeading.vue'
import VesselAdjustMenu from '@/features/vessel-schedule/VesselAdjustMenu.vue'
import VesselQuickActions from '@/features/vessel-schedule/VesselQuickActions.vue'
import SyncFieldAlert from '@/features/vessel-schedule/SyncFieldAlert.vue'
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
import type { HistoryDetail, MatchingStatus, TerminalSchedule, VesselRecord } from '@/types/vsp'

const route = useRoute()
const router = useRouter()
const store = useVesselStore()
const schedule = useScheduleStore()
provide(syncCellKey, (callId, columnId) => {
  const field = reviewForColumn(schedule.review(callId).fields, columnId)
  if (!field || field.side === 'MATCH') return null
  return { field }
})
const coverage = useTerminalCoverageStore()
const tabs = useTabsStore()
const vessel = computed(() => store.byId(String(route.params.id)))

const LARA_KEY = new Set(['laraVoyage', 'pointCode', 'laraPoolLocation', 'visitNo'])
const CALCULATED_LARA = new Set(['voyageStatus', 'vesselType', 'terminal9code'])
const HIDDEN_LARA = new Set(['voyageStatus'])

const LARA_COLUMNS: { id: string; label: string; kind: 'text' | 'datetime' }[] = [
  { id: 'laraVoyage', label: 'Voyage', kind: 'text' },
  { id: 'pointCode', label: 'Port', kind: 'text' },
  { id: 'laraPoolLocation', label: 'Pool location', kind: 'text' },
  { id: 'visitNo', label: 'Visit no', kind: 'text' },
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
  linkChoiceId?: string
  linkSource?: 'Official' | 'Temporary' | 'Both'
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
const syncSide = ref<'LARA' | 'Terminal' | null>(null)
const terminalFields = terminalPanelColumns()
const selectOpen = ref(false)
const shapeOpen = ref(false)
const pendingSelectId = ref<string | null>(null)
const replaceOpen = ref(false)
const remark = ref('')
const quickAction = ref<ScheduleQuickAction | null>(null)
const syncDrafts = ref<Record<string, string>>({})
let rowSeq = 0

function syncKey(side: string, field: string) {
  return `${side}:${field}`
}

function laraRaw(current: VesselRecord, id: string) {
  if (id === 'laraVoyage') return current.laraVoyage
  if (id === 'pointCode') return current.pointCode
  if (id === 'laraPoolLocation') return current.laraPoolLocation
  if (id === 'visitNo') return current.visitNo
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
  if (LARA_KEY.has(id)) return laraRaw(current, id)
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

function etdGapDays(lara: string, terminal: string) {
  if (!lara || !terminal) return null
  const left = new Date(lara).getTime()
  const right = new Date(terminal).getTime()
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null
  return Math.abs(left - right) / (24 * 60 * 60 * 1000)
}

function matchLabel(row: TerminalRow | null | undefined) {
  if (!row) return 'Unconfirmed'
  return `Export ${row.draft.evoyage || '—'} · Import ${row.draft.ivoyage || '—'} · ${row.draft.terminal || '—'}`
}

function diffLara(from: Record<string, string>, to: Record<string, string>): HistoryDetail[] {
  return LARA_COLUMNS.filter((column) => !LARA_KEY.has(column.id) && !CALCULATED_LARA.has(column.id))
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
  const drafts: Record<string, string> = {}
  for (const field of schedule.review(current.id).fields) {
    if (field.status !== 'pending') continue
    drafts[syncKey(field.side, field.field)] = field.previousValue
  }
  syncDrafts.value = drafts
  applyLinkTerminalRows(current)
}

function applyLinkTerminalRows(current: VesselRecord) {
  const review = current.linkReview
  if (!review || review.terminalMatched) return
  rows.value = review.terminalChoices.map((choice) => {
    const row = rowFromDraft(scheduleToDraft(choice.schedule, current), 'sync', null)
    row.linkChoiceId = choice.id
    row.linkSource = choice.source
    return row
  })
  const preferred = rows.value.find((row) => row.linkSource !== 'Temporary' && sameSchedule(current.terminalSchedule, row.draft))
    ?? rows.value.find((row) => row.linkSource !== 'Temporary')
    ?? rows.value[0]
  selectedId.value = preferred?.id ?? null
  loggedMatchLabel.value = matchLabel(preferred)
  const drafts = rows.value.map((row) => cloneDraft(row.draft))
  originDrafts.value = drafts.map(cloneDraft)
  committedDrafts.value = drafts.map(cloneDraft)
}

if (vessel.value) init(vessel.value)

const pendingSyncFields = computed(() => {
  const current = vessel.value
  if (!current) return []
  return schedule.review(current.id).fields.filter((field) => field.status === 'pending')
})

function syncChoices(): SyncChoice[] {
  return pendingSyncFields.value.filter((field) => field.side !== 'MATCH').map((field) => ({
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
  return status === 'Auto matched' || status === 'Manual matched'
})
const activeRow = computed(() => selectedRow.value ?? (rows.value.length === 1 ? rows.value[0]! : null))
const structure = computed(() => {
  const current = vessel.value
  if (!current || !comparable.value) return null
  return schedule.review(current.id).shape
})
const linkReview = computed(() => vessel.value?.linkReview ?? null)
const temporaryVessel = computed(() => {
  const id = linkReview.value?.temporaryId
  return id ? store.byId(id) : undefined
})
const linkTerminalOpen = computed(() => Boolean(linkReview.value && !linkReview.value.terminalMatched))
const fieldCompare = computed(() => {
  if (!comparable.value || structure.value) return false
  if (linkTerminalOpen.value) return true
  return rows.value.length <= 1
})

const linkTarget = computed(() => {
  const id = vessel.value?.laraLinkTargetId
  return id ? store.byId(id) : undefined
})

const headerAlert = computed(() => {
  const current = vessel.value
  if (!current) return null
  const review = schedule.review(current.id)
  return mappingHeaderAlert(current, { shape: review.shape, candidateCount: review.candidateCount })
})

const mappingAlert = computed(() => {
  const current = vessel.value
  if (!current) return null
  const review = schedule.review(current.id)
  if (review.shape) return null
  const field = review.fields.find((item) => item.side === 'MATCH')
  if (!field) return null
  return {
    variant: field.status === 'pending' ? 'warning' as const : 'info' as const,
    title: 'Mapping status',
    text: `${field.previousValue || '—'} → ${field.incomingValue || '—'}`,
  }
})

function linkOffer(columnId: string) {
  return linkReview.value?.laraDiffs.find((diff) => diff.field === columnId)
}

function useTemporary(columnId: string) {
  const diff = linkOffer(columnId)
  if (diff) onLaraInput(columnId, diff.temporary)
}

function keepFormal(columnId: string) {
  const diff = linkOffer(columnId)
  if (diff) onLaraInput(columnId, diff.official)
}

function offerForColumn(columnId: string) {
  if (!fieldCompare.value) return undefined
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

function payloadText(payload: { exportVoyage: string; importVoyage: string; terminalCode: string; terminalName: string; vesselStatus: string; eta: string; etb: string; etd: string; atb: string; atd: string; cyOpen: string; cyCutoff: string }, columnId: string) {
  const raw: Record<string, string> = {
    evoyage: payload.exportVoyage,
    ivoyage: payload.importVoyage,
    terminal: payload.terminalName || payload.terminalCode,
    status: payload.vesselStatus,
    eta: payload.eta,
    etb: payload.etb,
    etd: payload.etd,
    atb: payload.atb,
    atd: payload.atd,
    cyOpen: payload.cyOpen,
    cyClosing: payload.cyCutoff,
  }
  const value = raw[columnId] ?? ''
  if (!value) return '—'
  const column = CANDIDATE_COLUMN_DEFS.find((item) => item.id === columnId)
  return column?.kind === 'datetime' ? formatDateTime(value) : value
}

function payloadIsCurrent(payload: { exportVoyage: string; terminalCode: string; etd: string }) {
  const row = activeRow.value
  if (!row) return false
  return payload.exportVoyage === row.draft.evoyage && (payload.terminalCode === row.draft.terminal || !payload.terminalCode) && payload.etd === row.draft.etd
}

function rememberChoice(field: { side: string; field: string }, value: string) {
  syncDrafts.value[syncKey(field.side, field.field)] = value
}

function useLatest(columnId: string) {
  const field = offerForColumn(columnId)
  if (!field) return
  rememberChoice(field, field.incomingValue)
  if (field.side === 'LARA') {
    laraValues.value[columnId] = field.incomingValue
    return
  }
  const key = draftKeyForColumn(columnId)
  if (key && activeRow.value) activeRow.value.draft[key] = field.incomingValue
}

function keepCurrent(columnId: string) {
  const field = offerForColumn(columnId)
  if (!field) return
  rememberChoice(field, field.previousValue)
  if (field.side === 'LARA') {
    laraValues.value[columnId] = field.previousValue
    return
  }
  const key = draftKeyForColumn(columnId)
  if (key && activeRow.value) activeRow.value.draft[key] = field.previousValue
}

function onLaraInput(columnId: string, value: string) {
  laraValues.value[columnId] = value
  const field = offerForColumn(columnId)
  if (field) rememberChoice(field, value)
}

function onTerminalInput(key: TerminalDraftKey, value: string) {
  const row = activeRow.value
  if (!row) return
  row.draft[key] = value
  const field = offerForDraft(key)
  if (field) rememberChoice(field, value)
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
  if (selectedId.value === row.id) selectedId.value = null
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
    if (LARA_KEY.has(column.id) || CALCULATED_LARA.has(column.id)) continue
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
  if (!current || current.recordStatus === 'Inactive') {
    toast.error('An inactive record cannot be synced')
    return
  }
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

function useSelection() {
  const next = pendingSelectId.value
  if (!next || next === selectedId.value) {
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

function keepShape() {
  const current = vessel.value
  if (!current) return
  schedule.keepShape(current.id)
}

function adoptNone() {
  const current = vessel.value
  if (!current) return
  schedule.adoptNone(current.id)
  init(current)
}

function adoptListed(payloadId: string) {
  const current = vessel.value
  if (!current) return
  schedule.adoptCandidate(current.id, payloadId)
  init(current)
}

function statusAfterSave(current: VesselRecord): MatchingStatus {
  const chosen = manualMatch()
  if (chosen?.to === 'Unconfirmed') {
    return rows.value.length ? 'Multiple terminal records' : 'No terminal record'
  }
  const edited = Boolean(
    laraManualChanges().length
    || createdDetails().length
    || updatedDetails().length
    || chosen,
  )
  if (current.matchingStatus === 'Manual matched' || current.terminalSource === 'manual' || edited) {
    return 'Manual matched'
  }
  if (!selectedId.value) {
    return rows.value.length ? 'Multiple terminal records' : 'No terminal record'
  }
  if (rows.value.length > 1) return 'Multiple terminal records'
  const row = rows.value[0]
  if (!row || !row.draft.evoyage.trim() || !row.draft.ivoyage.trim()) return 'No external voyage'
  const gap = etdGapDays(laraValues.value.laraEtd ?? '', row.draft.etd)
  if (gap == null || gap > 3) return 'ETD gap > 3 days'
  return 'Auto matched'
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
  const to = matchLabel(selectedRow.value)
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
  if (pendingSyncFields.value.some((field) => field.side !== 'MATCH')) {
    lines.push('Watched fields you edited are saved from the value in each field.')
  }
  if (linkReview.value) {
    lines.push('The temporary vessel link is confirmed from the values in this form.')
  }
  const chosen = manualMatch()
  if (chosen) {
    lines.push(chosen.to === 'Unconfirmed' ? 'Match: cancel the current terminal match.' : `Match: ${chosen.from} → ${chosen.to}.`)
  } else if (hasReviewEdits() && selectedRow.value && !pendingMatches.value.length) {
    lines.push(`Match: keep ${matchLabel(selectedRow.value)}.`)
  }
  return {
    title: 'Save review',
    description: lines.join(' '),
    confirmLabel: 'Save',
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
  return hasReviewEdits() || pendingSyncFields.value.length > 0 || Boolean(linkReview.value)
}

function commitLinkReview(current: VesselRecord) {
  const review = current.linkReview
  if (!review) return true
  const fields: Record<string, 'official' | 'temporary'> = {}
  const values: Record<string, string> = {}
  for (const diff of review.laraDiffs) {
    const value = laraValues.value[diff.field] ?? diff.official
    values[diff.field] = value
    fields[diff.field] = value === diff.temporary ? 'temporary' : 'official'
  }
  let terminalId: string | null = null
  let terminalSchedule: TerminalSchedule | null = null
  if (!review.terminalMatched) {
    const row = rows.value.find((item) => item.id === selectedId.value)
    terminalId = row?.linkChoiceId ?? null
    if (!row || !terminalId) {
      toast.error('Select one terminal record')
      confirmOpen.value = false
      return false
    }
    const choice = review.terminalChoices.find((item) => item.id === terminalId)
    terminalSchedule = draftToSchedule(row.draft, choice?.schedule)
  }
  const saved = store.confirmTemporaryLink(current.id, { fields, values, terminalId, terminalSchedule })
  if (!saved) {
    toast.error('Link review could not be saved')
    confirmOpen.value = false
    return false
  }
  return true
}

function closePage() {
  const next = tabs.close(route.path, route.fullPath)
  void router.push(next ?? '/search')
}

onBeforeRouteLeave(async () => {
  if (!confirmOpen.value && !syncSide.value) return
  confirmOpen.value = false
  syncSide.value = null
  await nextTick()
})

function openHistory() {
  const current = vessel.value
  if (!current) return
  void router.push(`/vessels/${current.id}/activity-log`)
}

function openVessel(id: string) {
  void router.push(`/vessels/${id}/view`)
}

function onVesselDeleted() {
  quickAction.value = null
  void router.push('/search')
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
  if (!vessel.value) return
  if (!hasChanges()) {
    toast.error('Nothing to save')
    return
  }
  confirmOpen.value = true
}

async function confirmSave() {
  const current = vessel.value
  if (!current) return
  const pendingLink = current.linkReview
  if (pendingLink) {
    laraBaseline.value = { ...laraValues.value }
    laraOrigin.value = { ...laraValues.value }
    for (const row of rows.value) row.baseline = cloneDraft(row.draft)
    committedDrafts.value = rows.value.map((row) => cloneDraft(row.draft))
    originDrafts.value = committedDrafts.value.map(cloneDraft)
    loggedMatchLabel.value = matchLabel(rows.value.find((row) => row.id === selectedId.value))
    pendingSyncs.value = []
    pendingMatches.value = []
  }
  if (structure.value) schedule.keepShape(current.id)
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
    matchingStatus: statusAfterSave(current),
  })
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
  if (pendingLink && !commitLinkReview(current)) return
  confirmOpen.value = false
  toast.success('Review saved')
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
  <div v-if="vessel" class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
    <PageBreadcrumb
      class="shrink-0"
      :items="[
        { label: 'Vessel schedule search', to: '/search' },
        { label: vessel.vesselName, to: `/vessels/${vessel.id}/view` },
        { label: 'Review' },
      ]"
    />
    <div class="flex shrink-0 flex-wrap items-start justify-between gap-3">
      <ScheduleRecordHeading :vessel="vessel" />
      <div class="flex flex-wrap gap-2">
        <Button v-if="linkTarget" type="button" variant="outline" @click="openVessel(linkTarget.id)">
          Active LARA record
        </Button>
        <VesselAdjustMenu :vessel="vessel" size="default" hide-mismatch @pick="quickAction = $event" />
        <Button type="button" variant="outline" @click="openHistory">Activity logs</Button>
        <Button type="button" variant="outline" @click="requestSync('LARA')">Sync latest LARA</Button>
        <Button type="button" variant="outline" @click="requestSync('Terminal')">Sync latest Terminal</Button>
      </div>
    </div>
    <div class="min-h-0 flex-1 space-y-4 overflow-auto">
    <Alert v-if="headerAlert" :variant="headerAlert.variant">
      <AlertTitle>{{ headerAlert.title }}</AlertTitle>
      <AlertDescription>{{ headerAlert.text }}</AlertDescription>
      <div v-if="structure === 'many' || vessel.matchingStatus === 'Multiple terminal records'" class="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" @click="rows.length > 1 ? openSelect() : (shapeOpen = true)">Select</Button>
      </div>
      <div v-else-if="structure === 'none'" class="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="link" size="sm" @click="keepShape">Keep current</Button>
        <Button type="button" variant="link" size="sm" @click="adoptNone">Adopt no record</Button>
      </div>
      <div v-else-if="vessel.matchingStatus === 'No terminal record' && !rows.length" class="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" @click="addRow">Add</Button>
      </div>
    </Alert>
    <Alert v-if="linkReview && temporaryVessel" variant="warning">
      <AlertTitle>Temporary vessel</AlertTitle>
      <AlertDescription>
        {{ temporaryVessel.vesselName }} matches this schedule by voyage, point code, pool location, and visit no.
        Formal values stay in each field unless you choose the temporary value.
      </AlertDescription>
    </Alert>
    <Alert v-if="mappingAlert" :variant="mappingAlert.variant">
      <AlertTitle>{{ mappingAlert.title }}</AlertTitle>
      <AlertDescription>{{ mappingAlert.text }}</AlertDescription>
    </Alert>
    <div class="grid items-start gap-4 lg:grid-cols-2">
      <DataSection title="LARA">
        <dl>
          <template v-for="column in LARA_COLUMNS" :key="column.id">
            <template v-if="!HIDDEN_LARA.has(column.id)">
            <ReadonlyField v-if="LARA_KEY.has(column.id) || CALCULATED_LARA.has(column.id)" layout="row" :label="column.label" :value="displayLara(column.id, column.kind)" />
            <div v-else class="grid gap-1 border-b py-2 sm:grid-cols-[11rem_1fr] sm:items-center">
              <div class="flex items-center gap-1 text-sm text-muted-foreground">
                {{ column.label }}
                <SyncFieldAlert v-if="fieldCompare" :call-id="vessel.id" :column-id="column.id" />
              </div>
              <DateTimePicker
                v-if="column.kind === 'datetime'"
                :model-value="datetimeInputValue(laraValues[column.id] ?? '')"
                @update:model-value="onLaraInput(column.id, datetimeToIso($event))"
              />
              <Input v-else :model-value="laraValues[column.id]" class="h-8" @update:model-value="onLaraInput(column.id, String($event))" />
              <p v-if="offerForColumn(column.id)" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-start-2">
                <span>Latest {{ offerLabel(offerForColumn(column.id)!.incomingValue, column.kind) }}</span>
                <Button type="button" variant="link" size="sm" class="h-auto px-0" @click="useLatest(column.id)">Use latest</Button>
                <Button type="button" variant="link" size="sm" class="h-auto px-0" @click="keepCurrent(column.id)">Keep current</Button>
              </p>
              <p v-if="linkOffer(column.id)" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-start-2">
                <span>Temporary {{ offerLabel(linkOffer(column.id)!.temporary, column.kind) }}</span>
                <Button type="button" variant="link" size="sm" class="h-auto px-0" @click="useTemporary(column.id)">Use temporary</Button>
                <Button type="button" variant="link" size="sm" class="h-auto px-0" @click="keepFormal(column.id)">Keep formal</Button>
              </p>
            </div>
            </template>
          </template>
        </dl>
      </DataSection>

      <DataSection title="Terminal">
        <template v-if="activeRow && rows.length > 1 && (linkTerminalOpen || structure !== 'many')" #actions>
          <Button type="button" variant="outline" size="sm" @click="openSelect">Select</Button>
        </template>
        <div
          v-if="!activeRow && !rows.length"
          class="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center"
        >
          <p class="text-sm font-medium">No terminal record</p>
          <p class="text-sm text-muted-foreground">
            Add a record to enter terminal information.
          </p>
          <Button type="button" variant="outline" size="sm" @click="addRow">Add</Button>
        </div>
        <div
          v-else-if="!activeRow"
          class="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center"
        >
          <p class="text-sm font-medium">Multiple terminal records</p>
          <p class="text-sm text-muted-foreground">Select one record to edit.</p>
          <Button type="button" variant="outline" size="sm" @click="openSelect">Select</Button>
        </div>
        <div v-else>
          <p v-if="activeRow.linkSource" class="mb-2 text-sm text-muted-foreground">Source: {{ activeRow.linkSource }}</p>
          <dl>
            <template v-for="column in terminalFields" :key="column.id">
              <div
                v-if="draftKeyForColumn(column.id)"
                class="grid gap-1 border-b py-2 sm:grid-cols-[11rem_1fr] sm:items-center"
              >
                <div class="flex items-center gap-1 text-sm text-muted-foreground">
                  {{ column.label }}
                  <SyncFieldAlert v-if="fieldCompare" :call-id="vessel.id" :column-id="column.id" />
                </div>
                <DateTimePicker
                  v-if="column.kind === 'datetime'"
                  :model-value="datetimeInputValue(activeRow.draft[draftKeyForColumn(column.id)!])"
                  @update:model-value="onTerminalInput(draftKeyForColumn(column.id)!, datetimeToIso($event))"
                />
                <Input
                  v-else
                  :model-value="activeRow.draft[draftKeyForColumn(column.id)!]"
                  class="h-8"
                  @update:model-value="onTerminalInput(draftKeyForColumn(column.id)!, String($event))"
                />
                <p v-if="offerForColumn(column.id)" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-start-2">
                  <span>Latest {{ offerLabel(offerForColumn(column.id)!.incomingValue, column.kind) }}</span>
                  <Button type="button" variant="link" size="sm" class="h-auto px-0" @click="useLatest(column.id)">Use latest</Button>
                  <Button type="button" variant="link" size="sm" class="h-auto px-0" @click="keepCurrent(column.id)">Keep current</Button>
                </p>
              </div>
            </template>
          </dl>
          <Button
            v-if="activeRow.source === 'manual'"
            type="button"
            variant="outline"
            size="sm"
            class="mt-3"
            @click="deleteRow(activeRow)"
          >
            Delete
          </Button>
        </div>
      </DataSection>
    </div>
    </div>
    <div class="shrink-0 space-y-4">
      <label class="grid w-full gap-1">
        <span class="text-sm text-muted-foreground">Remark</span>
        <Textarea v-model="remark" rows="2" class="w-full" placeholder="Saved as the activity log description" />
      </label>
      <div class="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" @click="cancelEdits">Cancel</Button>
        <Button type="button" variant="primary" @click="save">Save</Button>
      </div>
    </div>
    <VesselQuickActions
      :vessel="vessel"
      :action="quickAction"
      @close="quickAction = null"
      @deleted="onVesselDeleted"
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
    <DialogContent size="2xl" class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[calc(100%-4rem)]">
      <DialogHeader>
        <DialogTitle>Select a terminal record</DialogTitle>
        <DialogDescription>Choose the record to load into the form.</DialogDescription>
      </DialogHeader>
      <div class="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="whitespace-nowrap">Match</TableHead>
              <TableHead v-if="linkTerminalOpen" class="whitespace-nowrap">Source</TableHead>
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
              @click="pendingSelectId = row.id"
            >
              <TableCell class="whitespace-nowrap">{{ row.id === selectedId ? 'Current' : '' }}</TableCell>
              <TableCell v-if="linkTerminalOpen" class="whitespace-nowrap">{{ row.linkSource }}</TableCell>
              <TableCell v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                {{ displayDraftValue(row.draft, column.id, column.kind) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" @click="selectOpen = false">Back</Button>
        <Button type="button" variant="primary" @click="useSelection">Use this record</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-if="shapeOpen" :open="true" @update:open="shapeOpen = $event">
    <DialogContent size="2xl" class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[calc(100%-4rem)]">
      <DialogHeader>
        <DialogTitle>Select a terminal record</DialogTitle>
        <DialogDescription>Adopting a record replaces the current terminal record.</DialogDescription>
      </DialogHeader>
      <div class="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="whitespace-nowrap">Match</TableHead>
              <TableHead v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                {{ column.label }}
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="payload in shapeCandidates" :key="payload.id" :data-state="payloadIsCurrent(payload) ? 'selected' : undefined">
              <TableCell class="whitespace-nowrap">{{ payloadIsCurrent(payload) ? 'Current' : '' }}</TableCell>
              <TableCell v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                {{ payloadText(payload, column.id) }}
              </TableCell>
              <TableCell>
                <Button type="button" variant="link" size="sm" class="h-auto px-0" @click="adoptListed(payload.id); shapeOpen = false">Adopt</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
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
