<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  tableFeatures,
  useTable,
} from '@tanstack/vue-table'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'

import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { toastFormErrors } from '@/lib/form-toast'

import DataSection from '@/components/DataSection.vue'
import DataTableColumnHeader from '@/components/DataTableColumnHeader.vue'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  MISMATCH_ACTION_LABEL,
  MISMATCH_ALERT,
  MISMATCH_EDIT_LABEL,
  MISMATCH_REEDIT_ALERT,
  isMismatchReedit,
} from '@/features/vessel-schedule/mismatch-actions'
import { CANDIDATE_COLUMN_DEFS, datetimeInputValue, datetimeToIso } from '@/features/vessel-schedule/mismatch-fields'
import { selectMatchSchema } from '@/features/vessel-schedule/mismatch-schemas'
import LaraReadonlyPanel from '@/features/vessel-schedule/LaraReadonlyPanel.vue'
import { WIDE_DIALOG_CLASS } from '@/features/vessel-schedule/wide-dialog'
import MismatchRemarkField from '@/features/vessel-schedule/MismatchRemarkField.vue'
import { useVesselStore } from '@/stores/vessels'
import type { HistoryDetail, TerminalSchedule, VesselRecord } from '@/types/vsc'

const props = defineProps<{
  open: boolean
  vessel: VesselRecord | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useVesselStore()
const reedit = computed(() => (props.vessel ? isMismatchReedit(props.vessel) : false))
const title = computed(() =>
  reedit.value ? MISMATCH_EDIT_LABEL.selectMatch : MISMATCH_ACTION_LABEL.selectMatch,
)
const alertText = computed(() =>
  reedit.value ? MISMATCH_REEDIT_ALERT.selectMatch : MISMATCH_ALERT.selectMatch,
)

const { handleSubmit, resetForm, setFieldValue, values } = useForm({
  validationSchema: selectMatchSchema,
  initialValues: { candidateIndex: '', remark: '' },
})

const candidates = computed(() => {
  const vessel = props.vessel
  if (!vessel) return [] as TerminalSchedule[]
  if (vessel.terminalCandidates.length) return vessel.terminalCandidates
  if (vessel.terminalSchedule) return [vessel.terminalSchedule]
  return []
})

type CandidateRow = {
  id: string
  index: number
  schedule: TerminalSchedule
}

type CandidateColumnId = (typeof CANDIDATE_COLUMN_DEFS)[number]['id']

const drafts = ref<TerminalSchedule[]>([])
const baselines = ref<TerminalSchedule[]>([])

const columnKind: Record<string, 'text' | 'datetime'> = Object.fromEntries(
  CANDIDATE_COLUMN_DEFS.map((column) => [column.id, column.kind]),
)

const candidateRows = computed<CandidateRow[]>(() =>
  drafts.value.map((schedule, index) => ({ id: String(index), index, schedule })),
)

function localDateTime(raw: string | null | undefined) {
  if (!raw) return ''
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  return datetimeInputValue(normalized)
}

function textValue(index: number, key: CandidateColumnId) {
  return drafts.value[index]?.[key] ?? ''
}

function setText(index: number, key: CandidateColumnId, value: string) {
  const row = drafts.value[index]
  if (!row || (row[key] ?? '') === value) return
  setFieldValue('candidateIndex', String(index))
  drafts.value[index] = { ...row, [key]: value }
  drafts.value = drafts.value.slice()
}

function setDateTime(index: number, key: CandidateColumnId, local: string) {
  const row = drafts.value[index]
  if (!row || local === localDateTime(row[key])) return
  setFieldValue('candidateIndex', String(index))
  const baseline = baselines.value[index]?.[key] ?? null
  const next = local && local === localDateTime(baseline) ? baseline : (local ? datetimeToIso(local) : null)
  drafts.value[index] = { ...row, [key]: next }
  drafts.value = drafts.value.slice()
}

function fieldChanges(before: TerminalSchedule | undefined, after: TerminalSchedule): HistoryDetail[] {
  if (!before) return []
  const details: HistoryDetail[] = []
  for (const column of CANDIDATE_COLUMN_DEFS) {
    const from = String(before[column.id] ?? '')
    const to = String(after[column.id] ?? '')
    if (from !== to) details.push({ field: column.id, from, to })
  }
  return details
}

function sameText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? '') === (right ?? '')
}

function sameTime(left: string | null | undefined, right: string | null | undefined) {
  const a = (left ?? '').replace(' ', 'T')
  const b = (right ?? '').replace(' ', 'T')
  if (a === b) return true
  return Boolean(a && b && a.slice(0, 16) === b.slice(0, 16))
}

function sameSchedule(row: TerminalSchedule, selected: TerminalSchedule | null | undefined) {
  if (!selected) return false
  return (
    sameText(row.evoyage, selected.evoyage)
    && sameText(row.ivoyage, selected.ivoyage)
    && sameText(row.terminal, selected.terminal)
    && sameTime(row.etb, selected.etb)
    && sameTime(row.etd, selected.etd)
  )
}

const rememberedSelection = ref<{ vesselId: string; index: string } | null>(null)

function matchingCandidateIndex(rows: TerminalSchedule[], selected: TerminalSchedule | null | undefined) {
  if (!selected) return -1
  const exact = rows.findIndex((row) => sameSchedule(row, selected))
  if (exact >= 0) return exact
  const loose = rows.flatMap((row, index) => (
    sameText(row.evoyage, selected.evoyage)
    && sameText(row.ivoyage, selected.ivoyage)
    && sameText(row.terminal, selected.terminal)
      ? [index]
      : []
  ))
  return loose.length === 1 ? loose[0]! : -1
}

function restoredCandidateIndex(rows: TerminalSchedule[]) {
  const vessel = props.vessel
  if (!vessel) return ''
  const saved = matchingCandidateIndex(rows, vessel.terminalSchedule)
  if (saved >= 0) return String(saved)
  const remembered = rememberedSelection.value
  if (!remembered || remembered.vesselId !== vessel.id) return ''
  const index = Number(remembered.index)
  return index >= 0 && index < rows.length ? remembered.index : ''
}

const candidateFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    datetime: sortFn_datetime,
  },
})

const candidateColumns = [
  {
    id: 'select',
    header: '',
    enableSorting: false,
  },
  ...CANDIDATE_COLUMN_DEFS.map((column) => ({
    id: column.id,
    header: column.label,
    accessorFn: (row: CandidateRow) => row.schedule[column.id] ?? '',
    sortFn: column.kind === 'datetime' ? 'datetime' as const : 'alphanumeric' as const,
    sortUndefined: 'last' as const,
  })),
]

const candidateTable = useTable({
  features: candidateFeatures,
  columns: candidateColumns,
  data: candidateRows,
  getRowId: (row: CandidateRow) => row.id,
})

watch(
  () => [props.open, props.vessel?.id] as const,
  ([open]) => {
    if (!open || !props.vessel) return
    candidateTable.resetSorting()
    const rows = candidates.value.map((row) => ({ ...row }))
    baselines.value = rows
    drafts.value = rows.map((row) => ({ ...row }))
    resetForm({
      values: {
        candidateIndex: restoredCandidateIndex(rows),
        remark: '',
      },
    })
  },
)

watch(
  () => values.candidateIndex,
  (index) => {
    if (!props.open || !props.vessel || !index) return
    rememberedSelection.value = { vesselId: props.vessel.id, index }
  },
)

const onSubmit = handleSubmit((form) => {
  if (!props.vessel) return
  const index = Number(form.candidateIndex)
  const candidate = drafts.value[index]
  if (!candidate) return
  store.confirmCandidateMatch(props.vessel.id, {
    candidate,
    candidates: drafts.value.map((row) => ({ ...row })),
    fieldChanges: fieldChanges(baselines.value[index], candidate),
    reason: form.remark,
    remediation: 'selectMatch',
  })
  toast.success(reedit.value ? 'Terminal match updated' : 'Terminal row confirmed')
  emit('update:open', false)
}, ({ errors }) => {
  toastFormErrors(errors)
})

function close() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      size="2xl"
      :class="WIDE_DIALOG_CLASS"
    >
      <DialogHeader class="min-w-0">
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">{{ alertText }}</p>

      <LaraReadonlyPanel v-if="vessel" :vessel="vessel" />

      <DataSection title="Terminal" class="min-w-0">
        <div class="min-w-0 overflow-hidden rounded-md border">
          <Table class="w-max min-w-full">
            <TableHeader>
              <TableRow v-for="headerGroup in candidateTable.getHeaderGroups()" :key="headerGroup.id">
                <TableHead
                  v-for="header in headerGroup.headers"
                  :key="header.id"
                  :class="header.column.id === 'select' ? 'w-8' : undefined"
                >
                  <DataTableColumnHeader
                    v-if="!header.isPlaceholder && header.column.getCanSort()"
                    :title="String(header.column.columnDef.header ?? '')"
                    :sorted="header.column.getIsSorted()"
                    :sort-index="header.column.getIsSorted() ? header.column.getSortIndex() + 1 : 0"
                    @sort="(desc) => header.column.toggleSorting(desc, true)"
                    @clear-sort="header.column.clearSorting()"
                    @clear-all-sort="candidateTable.setSorting([])"
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="row in candidateTable.getRowModel().rows"
                :key="row.id"
                class="cursor-pointer data-[state=selected]:!bg-accent"
                :data-state="values.candidateIndex === row.id ? 'selected' : undefined"
                @click="setFieldValue('candidateIndex', row.id)"
              >
                <TableCell
                  v-for="cell in row.getAllCells()"
                  :key="cell.id"
                  :class="
                    cell.column.id === 'select'
                      ? 'w-8'
                      : columnKind[cell.column.id] === 'datetime'
                        ? 'min-w-[20rem]'
                        : 'min-w-40'
                  "
                >
                  <div v-if="cell.column.id === 'select'" class="flex items-center">
                    <input
                      :key="`${row.id}:${values.candidateIndex}`"
                      type="radio"
                      class="m-0 size-4 shrink-0"
                      name="select-match-candidate"
                      :checked="values.candidateIndex === row.id"
                      @change="setFieldValue('candidateIndex', row.id)"
                    />
                  </div>
                  <DateTimePicker
                    v-else-if="columnKind[cell.column.id] === 'datetime'"
                    :model-value="localDateTime(textValue(row.original.index, cell.column.id as CandidateColumnId))"
                    class="w-max shrink-0"
                    @update:model-value="setDateTime(row.original.index, cell.column.id as CandidateColumnId, $event ?? '')"
                    @focusin="setFieldValue('candidateIndex', row.id)"
                  />
                  <Input
                    v-else
                    class="h-8 w-full"
                    :model-value="textValue(row.original.index, cell.column.id as CandidateColumnId)"
                    @update:model-value="setText(row.original.index, cell.column.id as CandidateColumnId, String($event))"
                    @focusin="setFieldValue('candidateIndex', row.id)"
                  />
                </TableCell>
              </TableRow>
              <TableEmpty v-if="!candidateTable.getRowModel().rows.length" :colspan="candidateColumns.length" />
            </TableBody>
          </Table>
        </div>
      </DataSection>

      <MismatchRemarkField />

      <DialogFooter>
        <Button type="button" variant="outline" @click="close">Cancel</Button>
        <Button type="button" variant="primary" @click="onSubmit">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
