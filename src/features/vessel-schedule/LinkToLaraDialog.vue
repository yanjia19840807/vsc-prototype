<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { ColumnDef } from '@tanstack/vue-table'

import DataSection from '@/components/DataSection.vue'
import DataTableColumnHeader from '@/components/DataTableColumnHeader.vue'
import DataTablePagination from '@/components/DataTablePagination.vue'
import FilterField from '@/components/FilterField.vue'
import QueryPanel from '@/components/QueryPanel.vue'
import ReadonlyField from '@/components/ReadonlyField.vue'
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
import { regionLabel, selectablePorts, selectableRegions } from '@/features/terminal-coverage/model'
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
import { SEARCH_COLUMNS, searchCellText, searchSortValue } from '@/features/vessel-search/search-columns'
import { useVesselDataTable } from '@/composables/useVesselDataTable'
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
const columns: ColumnDef<any, any>[] = laraColumns.map((column) => ({
  id: column.id,
  header: column.label,
  accessorFn: (row: VesselRecord) => searchSortValue(row, column.id),
  enableSorting: true,
  ...(column.kind === 'datetime' ? { sortFn: 'datetime' as const } : {}),
}))
const defaultFields = DEFAULT_VISIBLE_FILTERS
  .map((id) => filterFieldById(id))
  .filter((field): field is FilterFieldDef => Boolean(field))

const draft = ref(emptyFilterSession(DEFAULT_VISIBLE_FILTERS))
const applied = ref(emptyFilterSession(DEFAULT_VISIBLE_FILTERS))
const searched = ref(false)
const selectedId = ref('')
const remark = ref('')

const regionOptions = computed(() => selectableRegions(coverage.regions).map((region) => regionLabel(region)))
const portOptions = computed(() => portsForRegions(draft.value.region?.values ?? [], selectablePorts(coverage.ports)))

const rows = computed(() => {
  const vessel = props.vessel
  if (!searched.value || !vessel) return [] as VesselRecord[]
  return store.vessels.filter((row) => {
    if (row.id === vessel.id || row.createdManually || isLaraLinkTarget(row)) return false
    return vesselMatchesFilters(row, applied.value)
  })
})

const { table, pagination, tableRows, rowCount, pageCount, headerGroups, resetPage, clearSort } = useVesselDataTable({
  columns,
  data: rows,
})

watch(
  () => [props.open, props.vessel?.id] as const,
  ([open]) => {
    if (!open) return
    draft.value = emptyFilterSession(DEFAULT_VISIBLE_FILTERS)
    applied.value = emptyFilterSession(DEFAULT_VISIBLE_FILTERS)
    searched.value = false
    selectedId.value = ''
    remark.value = ''
    clearSort([])
    resetPage()
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
  searched.value = true
  resetPage()
}

function clearFilters() {
  draft.value = emptyFilterSession(DEFAULT_VISIBLE_FILTERS)
  applied.value = emptyFilterSession(DEFAULT_VISIBLE_FILTERS)
  searched.value = false
  selectedId.value = ''
  clearSort([])
  resetPage()
}

function selectRow(id: string) {
  selectedId.value = selectedId.value === id ? '' : id
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
      <DataSection title="Source">
        <dl v-if="vessel" class="grid grid-cols-1 gap-x-6 sm:grid-cols-3">
          <ReadonlyField label="Voyage" :value="vessel.laraVoyage" />
          <ReadonlyField label="Pool location" :value="vessel.poolLocation" />
          <ReadonlyField label="Port" :value="vessel.pointCode" />
        </dl>
      </DataSection>

      <DataSection title="Target" class="space-y-3">
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
            <TableRow v-for="headerGroup in headerGroups" :key="headerGroup.id">
              <TableHead v-for="header in headerGroup.headers" :key="header.id" class="whitespace-nowrap">
                <DataTableColumnHeader
                  v-if="!header.isPlaceholder && header.column.getCanSort()"
                  :title="String(header.column.columnDef.header ?? header.column.id)"
                  :sorted="header.column.getIsSorted()"
                  :sort-index="header.column.getIsSorted() ? header.column.getSortIndex() + 1 : 0"
                  @sort="(desc) => header.column.toggleSorting(desc, true)"
                  @clear-sort="header.column.clearSorting()"
                  @clear-all-sort="table.setSorting([])"
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty v-if="!tableRows.length" :colspan="laraColumns.length">
              {{ searched ? 'No results.' : 'Search to find a LARA record.' }}
            </TableEmpty>
            <tr
              v-for="row in tableRows"
              :key="row.id"
              data-slot="table-row"
              class="cursor-pointer border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
              :data-state="selectedId === row.original.id ? 'selected' : undefined"
              @click="selectRow(row.original.id)"
            >
              <TableCell v-for="column in laraColumns" :key="column.id" class="whitespace-nowrap">
                {{ searchCellText(row.original, column.id) }}
              </TableCell>
            </tr>
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        v-if="searched"
        :total="rowCount"
        :page-index="pagination.pageIndex"
        :page-size="pagination.pageSize"
        :page-count="pageCount"
        @update:page-index="(index) => table.setPageIndex(index)"
        @update:page-size="(size) => table.setPageSize(size)"
      />
      </DataSection>

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
