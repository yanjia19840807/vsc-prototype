<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import DataSection from '@/components/DataSection.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import ReadonlyField from '@/components/ReadonlyField.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { MISMATCH_ALERT, MISMATCH_REEDIT_ALERT } from '@/features/vessel-schedule/mismatch-actions'
import {
  CANDIDATE_COLUMN_DEFS,
  datetimeInputValue,
  datetimeToIso,
  displayDraftValue,
  draftToSchedule,
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
const coverage = useTerminalCoverageStore()
const tabs = useTabsStore()
const vessel = computed(() => store.byId(String(route.params.id)))

const LARA_KEY = new Set(['laraVoyage', 'laraPoolLocation', 'pointCode'])

const LARA_COLUMNS: { id: string; label: string; kind: 'text' | 'datetime' }[] = [
  { id: 'laraVoyage', label: 'Voyage', kind: 'text' },
  { id: 'laraPoolLocation', label: 'Pool location', kind: 'text' },
  { id: 'pointCode', label: 'Port', kind: 'text' },
  { id: 'vesselName', label: 'Vessel name', kind: 'text' },
  { id: 'vesselType', label: 'Vessel type', kind: 'text' },
  { id: 'brand', label: 'Brand', kind: 'text' },
  { id: 'service', label: 'Service', kind: 'text' },
  { id: 'laraEtb', label: 'ETB', kind: 'datetime' },
  { id: 'laraEtd', label: 'ETD', kind: 'datetime' },
  { id: 'voyageStatus', label: 'Voyage status', kind: 'text' },
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
const syncSide = ref<'LARA' | 'Terminal' | null>(null)
const remark = ref('')
let rowSeq = 0

function laraRaw(current: VesselRecord, id: string) {
  if (id === 'laraVoyage') return current.laraVoyage
  if (id === 'pointCode') return current.pointCode
  if (id === 'laraPoolLocation') return current.poolLocation
  if (id === 'vesselName') return current.vesselName
  if (id === 'service') return current.service
  if (id === 'brand') return current.brand ?? ''
  if (id === 'laraEtb') return current.laraEtb
  if (id === 'laraEtd') return current.laraEtd
  if (id === 'voyageStatus') return current.voyageStatus
  if (id === 'vesselType') {
    if (current.groupKind === 'Partner Vessel') return 'Partner vsl'
    if (current.groupKind === '3PF') return '3PF'
    return 'Group vsl'
  }
  return ''
}

function laraLatest(current: VesselRecord, id: string) {
  if (LARA_KEY.has(id)) return laraRaw(current, id)
  return current.manualOverrides[id]?.source ?? laraRaw(current, id)
}

function displayLara(id: string, kind: 'text' | 'datetime') {
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
  return LARA_COLUMNS.filter((column) => !LARA_KEY.has(column.id))
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
  selectedId.value = matched?.id ?? null
  loggedMatchLabel.value = matchLabel(matched)
  formRowId.value = null
  pendingSyncs.value = []
  pendingMatches.value = []
  confirmOpen.value = false
  syncSide.value = null
  remark.value = ''
}

if (vessel.value) init(vessel.value)

const formRow = computed(() => rows.value.find((row) => row.id === formRowId.value) ?? null)
const selectedRow = computed(() => rows.value.find((row) => row.id === selectedId.value) ?? null)

const pageHint = computed(() => {
  const current = vessel.value
  if (!current) return ''
  if (!rows.value.length) {
    return current.matchingStatus === 'Pending match'
      ? 'Matching has not run yet. Enter terminal information manually.'
      : MISMATCH_ALERT.addTerminal
  }
  if (rows.value.length > 1) return MISMATCH_ALERT.selectMatch
  const row = rows.value[0]!
  if (!row.draft.evoyage.trim() || !row.draft.ivoyage.trim()) {
    return 'A terminal schedule was found, but export/import voyage is missing. Enter the voyage to continue.'
  }
  const gap = etdGapDays(laraValues.value.laraEtd ?? '', row.draft.etd)
  if (gap == null || gap > 5) return MISMATCH_ALERT.reviewMatch
  if (current.matchingStatus === 'Manual matched') return MISMATCH_REEDIT_ALERT.reviewMatch
  return ''
})

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
  const current = vessel.value
  const locked = lockedFields()
  const next = { ...laraSource.value }
  for (const column of LARA_COLUMNS) {
    if (locked.has(column.id)) next[column.id] = laraValues.value[column.id] ?? next[column.id]
  }
  pendingSyncs.value.push({
    source: 'LARA',
    at: new Date().toISOString(),
    changes: diffLara(laraValues.value, next),
  })
  laraValues.value = next
  if (current) {
    for (const column of LARA_COLUMNS) {
      if (!locked.has(column.id)) laraBaseline.value[column.id] = next[column.id] ?? ''
    }
  }
  laraEditing.value = false
}

function applyProtectedTerminalSync() {
  const locked = lockedFields()
  const changes: HistoryDetail[] = []
  for (const row of rows.value) {
    if (row.originIndex == null) continue
    const source = sourceDrafts.value[row.originIndex]
    if (!source) continue
    for (const key of Object.keys(row.draft) as TerminalDraftKey[]) {
      if (locked.has(key)) continue
      const from = row.draft[key]
      const to = source[key]
      if (from === to) continue
      row.draft[key] = to
      if (row.baseline) row.baseline[key] = to
      const origin = originDrafts.value[row.originIndex]
      if (origin) origin[key] = to
      changes.push({ field: key, from, to })
    }
  }
  pendingSyncs.value.push({ source: 'Terminal', at: new Date().toISOString(), changes })
}

function applyTerminalSync() {
  const current = vessel.value
  if (current && (current.matchingStatus === 'Manual matched' || current.terminalSource === 'manual')) {
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
  syncSide.value = side
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
  if (gap == null || gap > 5) return 'ETD gap > 5 days'
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
  const chosen = manualMatch()
  if (chosen) {
    lines.push(chosen.to === 'Unconfirmed' ? 'Match: cancel the current terminal match.' : `Match: ${chosen.from} → ${chosen.to}.`)
  } else if (selectedRow.value && lines.length && !pendingMatches.value.length) {
    lines.push(`Match: keep ${matchLabel(selectedRow.value)}.`)
  }
  return {
    title: 'Save review',
    description: lines.join(' '),
    confirmLabel: 'Save',
  }
})

function hasChanges() {
  return Boolean(
    pendingSyncs.value.length
    || pendingMatches.value.length
    || laraManualChanges().length
    || createdDetails().length
    || updatedDetails().length
    || manualMatch(),
  )
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
  const chosen = manualMatch()
  const matches = [...pendingMatches.value, ...(chosen ? [chosen] : [])]
  store.saveReviewMatch(current.id, {
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
  confirmOpen.value = false
  toast.success('Review saved')
  await nextTick()
  closePage()
}

const syncCopy = computed(() => {
  const current = vessel.value
  const manual = current?.matchingStatus === 'Manual matched' || current?.terminalSource === 'manual'
  if (syncSide.value === 'Terminal') {
    return {
      title: 'Sync terminal',
      description: manual
        ? 'Sync this row only. The selected terminal record and fields you edited stay. Other terminal fields update from the latest result.'
        : 'Sync this row only. An automatic match follows the latest result: one record stays attached, several records keep the previous row only when it is still returned, and no record clears the automatic match.',
    }
  }
  return {
    title: 'Sync LARA',
    description: 'Sync this row only, outside the daily batch window. Fields you already edited stay. This does not mark other rows Omit.',
  }
})
</script>

<template>
  <div v-if="vessel" class="space-y-4">
    <PageBreadcrumb
      :items="[
        { label: 'Vessel schedule search', to: '/search' },
        { label: vessel.vesselName, to: `/vessels/${vessel.id}/view` },
        { label: 'Review' },
      ]"
    />
    <div>
      <h1 class="text-xl font-semibold">Review</h1>
      <p class="text-sm text-muted-foreground">{{ vessel.vesselName }} · {{ vessel.pointCode }} · {{ vessel.laraVoyage }}</p>
    </div>
    <Alert v-if="pageHint">
      <AlertDescription>{{ pageHint }}</AlertDescription>
    </Alert>

    <div class="flex flex-col gap-4">
      <DataSection title="LARA">
        <template #actions>
          <Button type="button" variant="outline" size="sm" @click="requestSync('LARA')">Sync latest</Button>
          <Button v-if="!laraEditing" type="button" variant="outline" size="sm" @click="startLaraEdit">Edit</Button>
          <Button v-else type="button" variant="outline" size="sm" @click="cancelLaraEdit">Cancel edit</Button>
        </template>
        <dl class="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          <template v-for="column in LARA_COLUMNS" :key="column.id">
            <ReadonlyField
              v-if="LARA_KEY.has(column.id) || !laraEditing"
              class="h-full min-h-[3.25rem]"
              :label="column.label"
              :value="displayLara(column.id, column.kind)"
            />
            <div v-else class="min-w-0 space-y-1 border-b py-2">
              <div class="text-sm text-muted-foreground">{{ column.label }}</div>
              <DateTimePicker
                v-if="column.kind === 'datetime'"
                :model-value="datetimeInputValue(laraValues[column.id] ?? '')"
                @update:model-value="laraValues[column.id] = datetimeToIso($event)"
              />
              <Input v-else v-model="laraValues[column.id]" class="h-8" />
            </div>
          </template>
        </dl>
      </DataSection>

      <DataSection title="Terminal">
        <template #actions>
          <Button type="button" variant="outline" size="sm" @click="requestSync('Terminal')">Sync latest</Button>
          <Button type="button" variant="outline" size="sm" @click="addRow">Add</Button>
        </template>
        <div class="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-16 whitespace-nowrap">Match</TableHead>
                <TableHead v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                  {{ column.label }}
                </TableHead>
                <TableHead class="whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <tr
                v-for="row in rows"
                :key="row.id"
                data-slot="table-row"
                class="cursor-pointer border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted data-[open=true]:bg-accent/40"
                :data-state="selectedId === row.id ? 'selected' : undefined"
                :data-open="formRowId === row.id ? 'true' : undefined"
                @click="selectRow(row)"
              >
                <TableCell class="w-16" @click.stop>
                  <Checkbox
                    :model-value="selectedId === row.id"
                    :aria-label="selectedId === row.id ? 'Clear match' : 'Set as match'"
                    @update:model-value="setMatch(row, $event === true)"
                  />
                </TableCell>
                <TableCell v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="whitespace-nowrap">
                  {{ displayDraftValue(row.draft, column.id, column.kind) }}
                </TableCell>
                <TableCell class="whitespace-nowrap" @click.stop>
                  <Button
                    v-if="row.source === 'manual'"
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="deleteRow(row)"
                  >
                    Delete
                  </Button>
                </TableCell>
              </tr>
              <TableRow v-if="!rows.length">
                <TableCell :colspan="CANDIDATE_COLUMN_DEFS.length + 2" class="text-muted-foreground">
                  No terminal record. Add one to enter it manually.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-if="formRow" class="mt-4">
          <div class="mb-2 flex items-center justify-end gap-2">
            <Button
              v-if="!formRow.editing"
              type="button"
              variant="outline"
              size="sm"
              @click="startRowEdit(formRow)"
            >
              Edit
            </Button>
            <Button v-else type="button" variant="outline" size="sm" @click="cancelRowEdit(formRow)">
              Cancel edit
            </Button>
          </div>
          <dl class="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            <template v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id">
              <ReadonlyField
                v-if="!formRow.editing"
                class="h-full min-h-[3.25rem]"
                :label="column.label"
                :value="displayDraftValue(formRow.draft, column.id, column.kind)"
              />
              <div v-else class="min-w-0 space-y-1 border-b py-2">
                <div class="text-sm text-muted-foreground">{{ column.label }}</div>
                <DateTimePicker
                  v-if="column.kind === 'datetime'"
                  :model-value="datetimeInputValue(formRow.draft[column.id])"
                  @update:model-value="formRow.draft[column.id] = datetimeToIso($event)"
                />
                <Input v-else v-model="formRow.draft[column.id]" class="h-8" />
              </div>
            </template>
          </dl>
        </div>
      </DataSection>
    </div>

    <label class="grid gap-1 text-sm">
      <span>Remark</span>
      <Textarea v-model="remark" rows="2" placeholder="Remark" />
    </label>

    <div class="flex justify-end gap-2 border-t pt-4">
      <Button type="button" variant="outline" @click="closePage">Cancel</Button>
      <Button type="button" variant="primary" @click="save">Save</Button>
    </div>
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
</template>
