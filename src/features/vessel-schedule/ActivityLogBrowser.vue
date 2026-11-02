<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'

import DataTableColumnHeader from '@/components/DataTableColumnHeader.vue'
import DataTablePagination from '@/components/DataTablePagination.vue'
import FilterField from '@/components/FilterField.vue'
import QueryPanel from '@/components/QueryPanel.vue'
import { DateRangePicker } from '@/components/ui/date-picker'
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
import { datetimeColumn, textColumn, useVesselDataTable } from '@/composables/useVesselDataTable'
import { activityLogsOf, itemTouchesField } from '@/features/vessel-schedule/activity-log'
import { formatDateTime } from '@/lib/vessel-utils'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsc'

const props = defineProps<{
  vessel: VesselRecord
  field?: string
  /** Fill a fixed-height parent. The log list and the detail scroll instead of growing it. */
  bounded?: boolean
}>()

const emit = defineEmits<{
  clear: []
}>()

const store = useVesselStore()
const selectedId = ref('')
const detailRef = ref<HTMLElement | null>(null)

function emptyLogQuery() {
  return { field: '', updatedBy: '', from: '', to: '' }
}

const form = reactive(emptyLogQuery())
const applied = ref(emptyLogQuery())

watch(
  () => props.field,
  (field) => {
    form.field = field ?? ''
    applied.value = { ...form }
  },
  { immediate: true },
)

function localDay(date: string, endOfDay: boolean) {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return Number.NaN
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime()
}

const logs = computed(() => activityLogsOf(props.vessel, (id) => store.refreshById(id), store.vessels))

const filtered = computed(() => {
  const updatedBy = applied.value.updatedBy.trim().toLowerCase()
  const from = applied.value.from ? localDay(applied.value.from, false) : Number.NEGATIVE_INFINITY
  const to = applied.value.to ? localDay(applied.value.to, true) : Number.POSITIVE_INFINITY
  return logs.value
    .filter((item) => itemTouchesField(item, applied.value.field))
    .filter((item) => !updatedBy || item.updatedBy.toLowerCase().includes(updatedBy))
    .filter((item) => {
      const at = new Date(item.at).getTime()
      return !Number.isFinite(at) || (at >= from && at <= to)
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
})

const tableRowsSource = computed(() => filtered.value.map((item) => ({ ...item })))

const selected = computed(() => filtered.value.find((item) => item.id === selectedId.value) ?? null)

const columns = [
  textColumn('updatedBy', 'Trigger by'),
  datetimeColumn('at', 'Trigger At'),
  textColumn('remark', 'Remark'),
]

const { table, tableRows, rowCount, pageCount, headerGroups, pagination, resetPage } = useVesselDataTable({
  columns,
  data: tableRowsSource,
  initialSorting: [{ id: 'at', desc: true }],
  getRowId: (row) => row.id,
})

watch(filtered, (rows) => {
  resetPage()
  if (selectedId.value && !rows.some((row) => row.id === selectedId.value)) selectedId.value = ''
})

function selectItem(id: string) {
  selectedId.value = id
  if (!props.bounded) void nextTick(() => detailRef.value?.scrollIntoView({ block: 'nearest' }))
}

function applyFilters() {
  applied.value = { ...form }
}

function clearFilters() {
  Object.assign(form, emptyLogQuery())
  applied.value = emptyLogQuery()
  selectedId.value = ''
  emit('clear')
}
</script>

<template>
  <div :class="bounded ? 'flex h-full min-h-0 flex-col gap-4' : 'space-y-4'">
    <QueryPanel class="shrink-0" @search="applyFilters" @clear="clearFilters">
      <FilterField label="Field">
        <Input v-model="form.field" class="h-8 w-52" aria-label="Field" />
      </FilterField>
      <FilterField label="Trigger by">
        <Input v-model="form.updatedBy" class="h-8 w-52" aria-label="Trigger by" />
      </FilterField>
      <FilterField label="Time">
        <DateRangePicker v-model:from="form.from" v-model:to="form.to" />
      </FilterField>
    </QueryPanel>

    <div
      :class="bounded
        ? 'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)_auto]'
        : 'grid items-start gap-4 lg:grid-cols-2'"
    >
    <section :class="bounded ? 'flex min-h-0 min-w-0 flex-col gap-3' : 'min-w-0 space-y-3'">
      <h3 class="shrink-0 text-sm font-medium">Logs</h3>
      <div :class="bounded ? 'min-h-0 flex-1 overflow-y-auto rounded-md border' : 'overflow-hidden rounded-md border'">
        <Table>
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
            <TableRow
              v-for="row in tableRows"
              :key="row.id"
              class="cursor-pointer"
              tabindex="0"
              :data-state="selected?.id === row.original.id ? 'selected' : undefined"
              :aria-expanded="selected?.id === row.original.id"
              @click="selectItem(row.original.id)"
              @keydown.enter.prevent="selectItem(row.original.id)"
              @keydown.space.prevent="selectItem(row.original.id)"
            >
              <TableCell class="whitespace-nowrap">{{ row.original.updatedBy || '—' }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ formatDateTime(row.original.at) }}</TableCell>
              <TableCell>{{ row.original.remark || '—' }}</TableCell>
            </TableRow>
            <TableEmpty v-if="!tableRows.length" :colspan="columns.length" />
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        v-if="!bounded"
        :total="rowCount"
        :page-index="pagination.pageIndex"
        :page-size="pagination.pageSize"
        :page-count="pageCount"
        @update:page-index="(index) => table.setPageIndex(index)"
        @update:page-size="(size) => table.setPageSize(size)"
      />
    </section>

    <section ref="detailRef" :class="bounded ? 'flex min-h-0 min-w-0 flex-col gap-3' : 'min-w-0 space-y-3'">
      <h3 class="shrink-0 text-sm font-medium">Detail</h3>
      <div :class="bounded ? 'min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border p-3' : 'space-y-3'">
        <p v-if="!selected" class="text-sm text-muted-foreground">Select a log.</p>
        <template v-else>
          <p class="text-sm text-muted-foreground">
            {{ selected.updatedBy || '—' }} · {{ formatDateTime(selected.at) }}
            <template v-if="selected.remark"> · {{ selected.remark }}</template>
          </p>
          <p v-if="selected.resultNote" class="text-sm text-muted-foreground">{{ selected.resultNote }}</p>
          <div class="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Original</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="row in selected.changes" :key="row.id">
                  <TableCell class="whitespace-nowrap">{{ row.label }}</TableCell>
                  <TableCell>{{ row.original }}</TableCell>
                  <TableCell>{{ row.value }}</TableCell>
                </TableRow>
                <TableEmpty v-if="!selected.changes.length" :colspan="3" />
              </TableBody>
            </Table>
          </div>
        </template>
      </div>
    </section>
    <DataTablePagination
      v-if="bounded"
      class="shrink-0"
      :total="rowCount"
      :page-index="pagination.pageIndex"
      :page-size="pagination.pageSize"
      :page-count="pageCount"
      @update:page-index="(index) => table.setPageIndex(index)"
      @update:page-size="(size) => table.setPageSize(size)"
    />
    </div>
  </div>
</template>
