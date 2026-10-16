<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import DataSection from '@/components/DataSection.vue'
import ReadonlyField from '@/components/ReadonlyField.vue'
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
import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { formatDateTime } from '@/lib/vessel-utils'
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
import { useVesselStore } from '@/stores/vessels'
import type { HistoryDetail, TerminalSchedule, VesselRecord } from '@/types/vsp'

const props = defineProps<{
  open: boolean
  vessel: VesselRecord | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useVesselStore()

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
  draft: TerminalDraft
  baseline: TerminalDraft | null
  editing: boolean
  editSnapshot: TerminalDraft | null
}

const laraEditing = ref(false)
const laraValues = ref<Record<string, string>>({})
const laraBaseline = ref<Record<string, string>>({})
const rows = ref<TerminalRow[]>([])
const formRowId = ref<string | null>(null)
const selectedId = ref<string | null>(null)
const confirmOpen = ref(false)
const initialSelectedId = ref<string | null>(null)
const remark = ref('')
let rowSeq = 0

function laraRaw(vessel: VesselRecord, id: string) {
  if (id === 'laraVoyage') return vessel.laraVoyage
  if (id === 'pointCode') return vessel.pointCode
  if (id === 'laraPoolLocation') return vessel.poolLocation
  if (id === 'vesselName') return vessel.vesselName
  if (id === 'service') return vessel.service
  if (id === 'brand') return vessel.brand ?? ''
  if (id === 'laraEtb') return vessel.laraEtb
  if (id === 'laraEtd') return vessel.laraEtd
  if (id === 'voyageStatus') return vessel.voyageStatus
  if (id === 'vesselType') {
    if (vessel.groupKind === 'Partner Vessel') return 'Partner vsl'
    if (vessel.groupKind === '3PF') return '3PF'
    return 'Group vsl'
  }
  return ''
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

watch(
  () => [props.open, props.vessel?.id] as const,
  ([open]) => {
    if (!open || !props.vessel) return
    const vessel = props.vessel
    const values = Object.fromEntries(LARA_COLUMNS.map((column) => [column.id, laraRaw(vessel, column.id)]))
    laraBaseline.value = { ...values }
    laraValues.value = { ...values }
    laraEditing.value = false
    const schedules = vessel.terminalCandidates.length
      ? vessel.terminalCandidates
      : vessel.terminalSchedule
        ? [vessel.terminalSchedule]
        : []
    rows.value = schedules.map((schedule) => {
      const draft = scheduleToDraft(schedule, vessel)
      const manual = vessel.terminalSource === 'manual' && sameSchedule(vessel.terminalSchedule, draft)
      return {
        id: `row-${rowSeq++}`,
        source: manual ? 'manual' : 'sync',
        draft,
        baseline: cloneDraft(draft),
        editing: false,
        editSnapshot: null,
      } satisfies TerminalRow
    })
    const matched = rows.value.find((row) => sameSchedule(vessel.terminalSchedule, row.draft))
    selectedId.value = matched?.id ?? null
    initialSelectedId.value = selectedId.value
    formRowId.value = null
    confirmOpen.value = false
    remark.value = ''
  },
)

const formRow = computed(() => rows.value.find((row) => row.id === formRowId.value) ?? null)

function startLaraEdit() {
  laraEditing.value = true
}

function cancelLaraEdit() {
  laraValues.value = { ...laraBaseline.value }
  laraEditing.value = false
}

function openForm(row: TerminalRow) {
  if (selectedId.value === row.id && formRowId.value === row.id) {
    selectedId.value = null
    formRowId.value = null
    return
  }
  if (!row.editSnapshot) row.editSnapshot = cloneDraft(row.draft)
  selectedId.value = row.id
  formRowId.value = row.id
}

function cancelForm() {
  const row = formRow.value
  if (!row) return
  if (row.editSnapshot) row.draft = cloneDraft(row.editSnapshot)
  const emptyNew = row.source === 'manual' && !row.baseline && !Object.values(row.draft).some((value) => value.trim())
  row.editSnapshot = null
  formRowId.value = null
  if (emptyNew) deleteRow(row)
}

function addRow() {
  const draft = emptyTerminalDraft()
  const row: TerminalRow = {
    id: `row-${rowSeq++}`,
    source: 'manual',
    draft,
    baseline: null,
    editing: false,
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

function restoreRow(row: TerminalRow) {
  if (!row.baseline) return
  row.draft = cloneDraft(row.baseline)
  row.editSnapshot = cloneDraft(row.baseline)
}

function rowDirty(row: TerminalRow) {
  if (!row.baseline) return Object.values(row.draft).some((value) => value.trim())
  return (Object.keys(row.draft) as TerminalDraftKey[]).some((key) => row.draft[key] !== row.baseline?.[key])
}

function laraChanges(): HistoryDetail[] {
  return LARA_COLUMNS.filter((column) => !LARA_KEY.has(column.id))
    .filter((column) => (laraValues.value[column.id] ?? '') !== (laraBaseline.value[column.id] ?? ''))
    .map((column) => ({
      field: column.id,
      from: laraBaseline.value[column.id] ?? '',
      to: laraValues.value[column.id] ?? '',
    }))
}

function terminalChanges(): HistoryDetail[] {
  const details: HistoryDetail[] = []
  for (const row of rows.value) {
    const keys = Object.keys(row.draft) as TerminalDraftKey[]
    for (const key of keys) {
      const from = row.baseline?.[key] ?? ''
      const to = row.draft[key] ?? ''
      if (from === to) continue
      details.push({ field: key, from, to })
    }
  }
  return details
}

function recordLabel(row: TerminalRow) {
  const parts = [row.draft.evoyage, row.draft.ivoyage, row.draft.terminal].map((value) => value.trim()).filter(Boolean)
  return parts.length ? parts.join(' · ') : 'this terminal record'
}

const confirmCopy = computed(() => {
  const selected = rows.value.find((row) => row.id === selectedId.value)
  if (!selected && initialSelectedId.value) {
    return {
      title: 'Cancel match',
      description: 'Cancel the current terminal match? This vessel will have no matched terminal record.',
      confirmLabel: 'Cancel match',
    }
  }
  if (!selected) {
    return {
      title: 'Save without a match',
      description: 'Save this review without a matched terminal record?',
      confirmLabel: 'Save',
    }
  }
  const label = recordLabel(selected)
  if (selected.id !== initialSelectedId.value) {
    return {
      title: 'Confirm match',
      description: `Set ${label} as the matched terminal record?`,
      confirmLabel: 'Confirm match',
    }
  }
  return {
    title: 'Confirm match',
    description: `Keep ${label} as the matched terminal record?`,
    confirmLabel: 'Save',
  }
})

function save() {
  if (!props.vessel) return
  const lara = laraChanges()
  const terminal = terminalChanges()
  const matchChanged = selectedId.value !== initialSelectedId.value
  if (!lara.length && !terminal.length && !matchChanged) {
    toast.error('Nothing to save')
    return
  }
  confirmOpen.value = true
}

function confirmSave() {
  if (!props.vessel) return
  const schedules = rows.value.map((row) => draftToSchedule(row.draft))
  const selectedIndex = rows.value.findIndex((row) => row.id === selectedId.value)
  store.saveReviewMatch(props.vessel.id, {
    lara: laraChanges(),
    terminal: terminalChanges(),
    rows: schedules,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : null,
    reason: remark.value,
  })
  confirmOpen.value = false
  toast.success('Review saved')
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent size="2xl" class="max-h-[calc(100dvh-2rem)] min-w-0 overflow-x-hidden overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Review</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>

      <DataSection title="LARA">
        <div class="mb-2 flex justify-end">
          <Button v-if="!laraEditing" type="button" variant="outline" size="sm" @click="startLaraEdit">Edit</Button>
          <Button v-else type="button" variant="outline" size="sm" @click="cancelLaraEdit">Cancel edit</Button>
        </div>
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
        <div class="mb-2 flex justify-end">
          <Button type="button" variant="outline" size="sm" @click="addRow">Add</Button>
        </div>
        <div class="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
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
                class="cursor-pointer border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                :data-state="selectedId === row.id ? 'selected' : undefined"
                @click="openForm(row)"
              >
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
                <TableCell :colspan="CANDIDATE_COLUMN_DEFS.length + 1" class="text-muted-foreground">
                  No terminal record. Add one to enter it manually.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-if="formRow" class="mt-4">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h3 class="text-sm font-medium">{{ formRow.baseline ? 'Edit terminal record' : 'New terminal record' }}</h3>
            <div class="flex gap-2">
              <Button
                v-if="formRow.baseline && rowDirty(formRow)"
                type="button"
                variant="outline"
                size="sm"
                @click="restoreRow(formRow)"
              >
                Restore
              </Button>
              <Button type="button" variant="outline" size="sm" @click="cancelForm">Cancel</Button>
            </div>
          </div>
          <dl class="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="column in CANDIDATE_COLUMN_DEFS" :key="column.id" class="min-w-0 space-y-1 border-b py-2">
              <div class="text-sm text-muted-foreground">{{ column.label }}</div>
              <DateTimePicker
                v-if="column.kind === 'datetime'"
                :model-value="datetimeInputValue(formRow.draft[column.id])"
                @update:model-value="formRow.draft[column.id] = datetimeToIso($event)"
              />
              <Input v-else v-model="formRow.draft[column.id]" class="h-8" />
            </div>
          </dl>
        </div>
      </DataSection>

      <label class="grid gap-1 text-sm">
        <span>Remark</span>
        <Textarea v-model="remark" rows="2" placeholder="Remark" />
      </label>

      <DialogFooter>
        <Button type="button" variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button type="button" variant="primary" @click="save">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog :open="confirmOpen" @update:open="confirmOpen = $event">
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
</template>
