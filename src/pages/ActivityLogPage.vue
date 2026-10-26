<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DataSection from '@/components/DataSection.vue'
import DataTableColumnHeader from '@/components/DataTableColumnHeader.vue'
import DataTablePagination from '@/components/DataTablePagination.vue'
import FilterField from '@/components/FilterField.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import QueryPanel from '@/components/QueryPanel.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { vesselDetailPath } from '@/features/vessel-schedule/lara-link'
import { formatDateTime } from '@/lib/vessel-utils'
import { useVesselStore } from '@/stores/vessels'

const route = useRoute()
const router = useRouter()
const store = useVesselStore()
const vessel = computed(() => store.byId(String(route.params.id)))
const selectedId = ref('')
const detailRef = ref<HTMLElement | null>(null)

function emptyLogQuery() {
  return { field: '', updatedBy: '', from: '', to: '' }
}

const form = reactive(emptyLogQuery())
const applied = ref(emptyLogQuery())

watch(
  () => route.query.field,
  (field) => {
    form.field = typeof field === 'string' ? field : ''
    applied.value = { ...form }
  },
  { immediate: true },
)

function localDay(date: string, endOfDay: boolean) {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return Number.NaN
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime()
}

const logs = computed(() => {
  const current = vessel.value
  if (!current) return []
  return activityLogsOf(current, (id) => store.refreshById(id), store.vessels)
})

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
  selectedId.value = selectedId.value === id ? '' : id
  if (!selectedId.value) return
  void nextTick(() => detailRef.value?.scrollIntoView({ block: 'nearest' }))
}

function applyFilters() {
  applied.value = { ...form }
}

function clearFilters() {
  Object.assign(form, emptyLogQuery())
  applied.value = emptyLogQuery()
  selectedId.value = ''
  if (route.query.field) void router.replace({ path: route.path, query: {} })
}
</script>

<template>
  <div v-if="vessel" class="space-y-4">
    <PageBreadcrumb
      :items="[
        { label: 'Vessel schedule search', to: '/search' },
        { label: vessel.vesselName, to: vesselDetailPath(vessel) },
        { label: 'Activity logs' },
      ]"
    />
    <p class="text-sm text-muted-foreground">{{ vessel.pointCode }} · {{ vessel.laraVoyage }}</p>

    <QueryPanel @search="applyFilters" @clear="clearFilters">
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

    <div class="overflow-hidden rounded-md border">
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
      :total="rowCount"
      :page-index="pagination.pageIndex"
      :page-size="pagination.pageSize"
      :page-count="pageCount"
      @update:page-index="(index) => table.setPageIndex(index)"
      @update:page-size="(size) => table.setPageSize(size)"
    />

    <div v-if="selected" ref="detailRef" class="space-y-4">
      <div>
        <h2 class="text-xl font-semibold">Field Change</h2>
        <p class="text-sm text-muted-foreground">
          {{ selected.updatedBy || '—' }} · {{ formatDateTime(selected.at) }}
          <template v-if="selected.remark"> · {{ selected.remark }}</template>
        </p>
      </div>
      <p v-if="selected.resultNote" class="text-sm text-muted-foreground">{{ selected.resultNote }}</p>

      <DataSection v-if="selected.changes.length" title="Changes">
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
            </TableBody>
          </Table>
        </div>
      </DataSection>
    </div>
  </div>
  <Alert v-else variant="warning">
    <AlertDescription>This schedule record is no longer available.</AlertDescription>
  </Alert>
</template>
