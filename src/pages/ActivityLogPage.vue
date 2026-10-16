<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DataSection from '@/components/DataSection.vue'
import DataTableColumnHeader from '@/components/DataTableColumnHeader.vue'
import DataTablePagination from '@/components/DataTablePagination.vue'
import FilterField from '@/components/FilterField.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import QueryPanel from '@/components/QueryPanel.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/multi-select'
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
import {
  ACTIVITY_CATEGORIES,
  activityCategoryLabel,
  activityDescription,
  activityLogsOf,
  activityPriority,
  itemTouchesField,
} from '@/features/vessel-schedule/activity-log'
import { allPlaceholder } from '@/features/vessel-search/list-setting-model'
import { formatDateTime } from '@/lib/vessel-utils'
import { useVesselStore } from '@/stores/vessels'

const route = useRoute()
const router = useRouter()
const store = useVesselStore()
const vessel = computed(() => store.byId(String(route.params.id)))
const selectedId = ref('')
const typeOptions = ACTIVITY_CATEGORIES.map((item) => item.label)

function emptyLogQuery() {
  return { types: [] as string[], field: '', updatedBy: '', from: '', to: '' }
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
  const types = new Set(applied.value.types)
  return logs.value
    .filter((item) => !types.size || types.has(activityCategoryLabel(item.category)))
    .filter((item) => itemTouchesField(item, applied.value.field))
    .filter((item) => !updatedBy || item.updatedBy.toLowerCase().includes(updatedBy))
    .filter((item) => {
      const at = new Date(item.at).getTime()
      return !Number.isFinite(at) || (at >= from && at <= to)
    })
    .sort((a, b) => {
      const time = new Date(b.at).getTime() - new Date(a.at).getTime()
      if (time !== 0) return time
      return activityPriority(b.category) - activityPriority(a.category)
    })
})

const tableRowsSource = computed(() =>
  filtered.value.map((item) => ({
    ...item,
    categoryLabel: activityCategoryLabel(item.category),
    description: activityDescription(item),
    priority: activityPriority(item.category),
  })),
)

const selected = computed(() => filtered.value.find((item) => item.id === selectedId.value) ?? null)

const columns = [
  {
    ...datetimeColumn('at', 'Time'),
    sortFn: (rowA: { original: { at: string; priority: number } }, rowB: { original: { at: string; priority: number } }) => {
      const time = new Date(rowA.original.at).getTime() - new Date(rowB.original.at).getTime()
      if (time !== 0) return time
      return rowA.original.priority - rowB.original.priority
    },
  },
  textColumn('categoryLabel', 'Type'),
  textColumn('description', 'Description'),
  textColumn('updatedBy', 'Updated by'),
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
}

function applyFilters() {
  applied.value = { ...form, types: [...form.types] }
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
        { label: vessel.vesselName, to: `/vessels/${vessel.id}/view` },
        { label: 'Activity logs' },
      ]"
    />
    <div>
      <h1 class="text-xl font-semibold">Activity logs</h1>
      <p class="text-sm text-muted-foreground">
        {{ vessel.vesselName }} · {{ vessel.laraVoyage }} · {{ vessel.poolLocation }}
      </p>
    </div>

    <QueryPanel @search="applyFilters" @clear="clearFilters">
      <FilterField label="Type">
        <MultiSelect
          :model-value="form.types"
          :options="typeOptions"
          :placeholder="allPlaceholder('Type')"
          aria-label="Type"
          class="w-[220px]"
          @update:model-value="form.types = $event"
        />
      </FilterField>
      <FilterField label="Field">
        <Input v-model="form.field" class="h-8 w-52" aria-label="Field" />
      </FilterField>
      <FilterField label="Updated by">
        <Input v-model="form.updatedBy" class="h-8 w-52" aria-label="Updated by" />
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
            <TableHead class="w-24">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="row in tableRows"
            :key="row.id"
            :data-state="selected?.id === row.original.id ? 'selected' : undefined"
          >
            <TableCell class="whitespace-nowrap">{{ formatDateTime(row.original.at) }}</TableCell>
            <TableCell class="whitespace-nowrap">{{ row.original.categoryLabel }}</TableCell>
            <TableCell>{{ row.original.description }}</TableCell>
            <TableCell class="whitespace-nowrap">{{ row.original.updatedBy || '—' }}</TableCell>
            <TableCell>
              <Button type="button" size="xs" variant="outline" @click="selectItem(row.original.id)">
                {{ selectedId === row.original.id ? 'Hide' : 'View' }}
              </Button>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="!tableRows.length" :colspan="columns.length + 1" />
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

    <div v-if="selected" class="space-y-4">
      <div>
        <h2 class="text-xl font-semibold">{{ formatDateTime(selected.at) }}</h2>
        <p class="text-sm text-muted-foreground">{{ activityCategoryLabel(selected.category) }} · {{ activityDescription(selected) }}</p>
      </div>
      <p v-if="selected.resultNote" class="text-sm text-muted-foreground">{{ selected.resultNote }}</p>

      <DataSection v-for="domain in selected.domainTables" :key="domain.id" :title="domain.title">
        <div class="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead v-for="column in domain.columns" :key="column.id" class="whitespace-nowrap">
                  {{ column.label }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="record in domain.records" :key="record.id">
                <TableCell v-for="(value, index) in record.values" :key="`${record.id}-${index}`" class="whitespace-nowrap">
                  {{ value }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DataSection>

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
