<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import FilterField from '@/components/FilterField.vue'
import QueryPanel from '@/components/QueryPanel.vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { isLaraLinkTarget } from '@/features/vessel-schedule/lara-link'
import { regionLabel } from '@/features/terminal-coverage/model'
import SearchFilterControl from '@/features/vessel-search/SearchFilterControl.vue'
import {
  copyFilterSession,
  DEFAULT_VISIBLE_FILTERS,
  emptyFilterSession,
  filterFieldById,
  portsForRegions,
  retainPointCodes,
  staticFilterOptions,
  vesselMatchesFilters,
  type FilterFieldDef,
  type FilterState,
} from '@/features/vessel-search/list-setting-model'
import { SEARCH_COLUMNS, searchCellText } from '@/features/vessel-search/search-columns'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

const props = defineProps<{
  open: boolean
  vessel: VesselRecord | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useVesselStore()
const coverage = useTerminalCoverageStore()

const laraColumns = SEARCH_COLUMNS.filter((column) => column.source === 'lara')
const defaultFields = DEFAULT_VISIBLE_FILTERS
  .map((id) => filterFieldById(id))
  .filter((field): field is FilterFieldDef => Boolean(field))

const draft = ref(emptyFilterSession(DEFAULT_VISIBLE_FILTERS))
const applied = ref(emptyFilterSession(DEFAULT_VISIBLE_FILTERS))
const selectedId = ref('')
const remark = ref('')

const regionOptions = computed(() => coverage.regions.map((region) => regionLabel(region)))
const portOptions = computed(() => portsForRegions(draft.value.region?.values ?? [], coverage.ports))

const rows = computed(() => {
  const vessel = props.vessel
  if (!vessel) return [] as VesselRecord[]
  return store.vessels.filter((row) => {
    if (row.id === vessel.id || row.createdManually || isLaraLinkTarget(row)) return false
    return vesselMatchesFilters(row, applied.value)
  })
})

watch(
  () => [props.open, props.vessel?.id] as const,
  ([open]) => {
    if (!open) return
    draft.value = emptyFilterSession(DEFAULT_VISIBLE_FILTERS)
    applied.value = emptyFilterSession(DEFAULT_VISIBLE_FILTERS)
    selectedId.value = ''
    remark.value = ''
  },
)

watch(rows, (list) => {
  if (selectedId.value && !list.some((row) => row.id === selectedId.value)) selectedId.value = ''
})

function optionsFor(field: FilterFieldDef) {
  if (field.optionSource === 'region') return regionOptions.value
  if (field.optionSource === 'pointCode') return portOptions.value
  return staticFilterOptions(field.optionSource)
}

function toDisplay(field: FilterFieldDef, state: FilterState): FilterState {
  if (field.id !== 'region') return state
  return {
    ...state,
    values: state.values.map((code) => {
      const region = coverage.regions.find((item) => item.code === code)
      return region ? regionLabel(region) : code
    }),
  }
}

function fromDisplay(field: FilterFieldDef, state: FilterState): FilterState {
  if (field.id !== 'region') return state
  return {
    ...state,
    values: state.values.map((label) => {
      const region = coverage.regions.find((item) => regionLabel(item) === label)
      return region?.code ?? label
    }),
  }
}

function setDraft(id: string, state: FilterState) {
  const field = filterFieldById(id)
  if (!field) return
  const next = { ...draft.value, [id]: fromDisplay(field, state) }
  if (id === 'region' && next.pointCode) {
    next.pointCode = {
      ...next.pointCode,
      values: retainPointCodes(next.region?.values ?? [], next.pointCode.values, coverage.ports),
    }
  }
  draft.value = next
}

function search() {
  applied.value = copyFilterSession(draft.value)
}

function clearFilters() {
  draft.value = emptyFilterSession(DEFAULT_VISIBLE_FILTERS)
  applied.value = emptyFilterSession(DEFAULT_VISIBLE_FILTERS)
  selectedId.value = ''
}

function selectRow(id: string) {
  selectedId.value = id
}

function save() {
  if (!props.vessel || !selectedId.value) return
  const ok = store.linkManualVesselToLara(props.vessel.id, {
    targetId: selectedId.value,
    reason: remark.value.trim(),
  })
  if (!ok) {
    toast.error('Unable to link this vessel')
    return
  }
  toast.success('Linked to LARA')
  emit('update:open', false)
}

function close() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent size="2xl" class="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Link to LARA</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">
        Choose one formal LARA record. This row keeps its own values. The selected record becomes Linked and is left out of Sync and Adjust. One source links to one target.
      </p>
      <p v-if="vessel" class="text-sm text-muted-foreground">
        {{ vessel.vesselName }} · {{ vessel.pointCode }} · {{ vessel.laraVoyage || '—' }}
      </p>

      <QueryPanel @search="search" @clear="clearFilters">
        <FilterField v-for="field in defaultFields" :key="field.id" :label="field.label">
          <SearchFilterControl
            v-if="draft[field.id]"
            :field="field"
            :state="toDisplay(field, draft[field.id]!)"
            :options="optionsFor(field)"
            @update:state="setDraft(field.id, $event)"
          />
        </FilterField>
      </QueryPanel>

      <div class="overflow-auto rounded-md border">
        <Table class="min-w-max border-separate border-spacing-0 [&_td]:border-b [&_th]:border-b">
          <TableHeader>
            <TableRow>
              <TableHead class="w-8"><span class="sr-only">Select</span></TableHead>
              <TableHead v-for="column in laraColumns" :key="column.id">{{ column.label }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty v-if="!rows.length" :colspan="laraColumns.length + 1" />
            <TableRow
              v-for="row in rows"
              :key="row.id"
              class="cursor-pointer"
              :data-state="selectedId === row.id ? 'selected' : undefined"
              @click="selectRow(row.id)"
            >
              <TableCell class="w-8">
                <div class="flex items-center">
                  <input
                    type="radio"
                    class="m-0 size-4 shrink-0"
                    name="lara-link-target"
                    :checked="selectedId === row.id"
                    :aria-label="`Select ${row.vesselName}`"
                    @change="selectRow(row.id)"
                  />
                </div>
              </TableCell>
              <TableCell v-for="column in laraColumns" :key="column.id" class="whitespace-nowrap">
                {{ searchCellText(row, column.id) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Field>
        <FieldLabel>Remark</FieldLabel>
        <Textarea
          :model-value="remark"
          placeholder="Why this LARA record is linked"
          @update:model-value="remark = String($event)"
        />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" @click="close">Cancel</Button>
        <Button type="button" variant="primary" :disabled="!selectedId" @click="save">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
