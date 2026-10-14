<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FlexRender } from '@tanstack/vue-table'
import { ChevronDown } from '@lucide/vue'

import DataSection from '@/components/DataSection.vue'
import DataTableColumnHeader from '@/components/DataTableColumnHeader.vue'
import DataTablePagination from '@/components/DataTablePagination.vue'
import FilterField from '@/components/FilterField.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import QueryPanel from '@/components/QueryPanel.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  activityOperationsOf,
  operationTouchesField,
  type ActivityFieldChange,
  type ActivityLogOperation,
} from '@/features/vessel-schedule/activity-log'
import { historyFieldLabel } from '@/features/vessel-search/search-columns'
import { allPlaceholder } from '@/features/vessel-search/list-setting-model'
import { formatDateTime } from '@/lib/vessel-utils'
import { useVesselStore } from '@/stores/vessels'

const route = useRoute()
const router = useRouter()
const store = useVesselStore()
const vessel = computed(() => store.byId(String(route.params.id)))
const selectedId = ref('')
const filtersOpen = ref(true)

const UPDATE_SOURCES = ['System Sync', 'Manual Update']

function emptyLogQuery() {
  return {
    source: [] as string[],
    field: '',
    updatedBy: '',
    from: '',
    to: '',
  }
}

const form = reactive(emptyLogQuery())
const applied = ref(emptyLogQuery())

watch(
  () => route.query.field,
  (field) => {
    form.field = typeof field === 'string' && field ? historyFieldLabel(field) : ''
    applied.value = { ...form, source: [...form.source] }
  },
  { immediate: true },
)

function localDay(date: string, endOfDay: boolean) {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return Number.NaN
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime()
}

function blank(value: string) {
  const text = value.trim()
  if (!text || text === '—') return '—'
  const parsed = new Date(text)
  if (text.includes('-') && !Number.isNaN(parsed.getTime()) && text.length > 8) return formatDateTime(text)
  return text
}

const logs = computed(() => {
  const current = vessel.value
  if (!current) return []
  return activityOperationsOf(current, (id) => store.refreshById(id))
    .sort((a, b) => new Date(b.updatedTime).getTime() - new Date(a.updatedTime).getTime())
})

const filtered = computed(() => {
  const updatedBy = applied.value.updatedBy.trim().toLowerCase()
  const from = applied.value.from ? localDay(applied.value.from, false) : Number.NEGATIVE_INFINITY
  const to = applied.value.to ? localDay(applied.value.to, true) : Number.POSITIVE_INFINITY
  return logs.value.filter((row) => {
    if (applied.value.source.length && !applied.value.source.includes(row.updateSource)) return false
    if (!operationTouchesField(row, applied.value.field)) return false
    if (updatedBy && !row.updatedBy.toLowerCase().includes(updatedBy)) return false
    const at = new Date(row.updatedTime).getTime()
    if (Number.isFinite(at) && (at < from || at > to)) return false
    return true
  })
})

const selected = computed(() => filtered.value.find((row) => row.id === selectedId.value) ?? null)

const columns = [
  datetimeColumn('updatedTime', 'Updated time'),
  textColumn('updateSource', 'Update source'),
  textColumn('refreshLabel', 'Sync'),
  textColumn('summary', 'Summary'),
  textColumn('updatedBy', 'Updated by'),
  textColumn('reason', 'Reason'),
]

const { table, tableRows, rowCount, pageCount, headerGroups, pagination, resetPage } = useVesselDataTable({
  columns,
  data: filtered,
  initialSorting: [{ id: 'updatedTime', desc: true }],
  getRowId: (row: ActivityLogOperation) => row.id,
})

watch(filtered, (rows) => {
  resetPage()
  if (selectedId.value && !rows.some((row) => row.id === selectedId.value)) selectedId.value = ''
  if (!selectedId.value && route.query.field && rows[0]) selectedId.value = rows[0].id
})

function selectOperation(id: string) {
  selectedId.value = selectedId.value === id ? '' : id
}

function fieldHighlighted(change: ActivityFieldChange) {
  const field = applied.value.field.trim().toLowerCase()
  if (!field) return false
  return change.fieldLabel.toLowerCase().includes(field) || change.field.toLowerCase().includes(field)
}

const appliedCount = computed(() => {
  let count = 0
  if (form.source.length) count += 1
  if (form.field.trim()) count += 1
  if (form.updatedBy.trim()) count += 1
  if (form.from || form.to) count += 1
  return count
})

function applyFilters() {
  applied.value = { ...form, source: [...form.source] }
  resetPage()
}

function clearFilters() {
  Object.assign(form, emptyLogQuery())
  applied.value = emptyLogQuery()
  selectedId.value = ''
  if (route.query.field) {
    void router.replace({ path: route.path, query: {} })
  }
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
        {{ vessel.vesselName }} · {{ vessel.laraVoyage }} · {{ vessel.pointCode }} · {{ vessel.poolLocation }}
      </p>
    </div>

    <div>
      <div class="flex items-center justify-between gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 text-sm font-medium"
          :aria-expanded="filtersOpen"
          @click="filtersOpen = !filtersOpen"
        >
          <ChevronDown class="size-4 transition-transform" :class="filtersOpen ? 'rotate-180' : ''" />
          Filters
          <span class="text-muted-foreground">{{ appliedCount }}</span>
        </button>
      </div>
      <QueryPanel v-if="filtersOpen" class="pt-3" @search="applyFilters" @clear="clearFilters">
        <FilterField label="Update source">
          <MultiSelect
            :model-value="form.source"
            :options="UPDATE_SOURCES"
            :placeholder="allPlaceholder('Update source')"
            aria-label="Update source"
            class="w-[220px]"
            @update:model-value="form.source = $event"
          />
        </FilterField>
        <FilterField label="Field">
          <Input v-model="form.field" class="h-8 w-52" aria-label="Field" />
        </FilterField>
        <FilterField label="Updated by">
          <Input v-model="form.updatedBy" class="h-8 w-52" aria-label="Updated by" />
        </FilterField>
        <FilterField label="Updated time">
          <DateRangePicker v-model:from="form.from" v-model:to="form.to" />
        </FilterField>
      </QueryPanel>
    </div>

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
              <FlexRender v-else-if="!header.isPlaceholder" :header="header" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="row in tableRows"
            :key="row.id"
            class="cursor-pointer"
            :data-state="selected?.id === row.original.id ? 'selected' : undefined"
            @click="selectOperation(row.original.id)"
          >
            <TableCell class="whitespace-nowrap">{{ formatDateTime(row.original.updatedTime) }}</TableCell>
            <TableCell class="whitespace-nowrap">{{ row.original.updateSource }}</TableCell>
            <TableCell class="whitespace-nowrap">{{ row.original.refreshLabel || '—' }}</TableCell>
            <TableCell class="whitespace-nowrap">
              <button type="button" class="font-semibold text-primary hover:underline" @click.stop="selectOperation(row.original.id)">
                {{ row.original.summary }}
              </button>
            </TableCell>
            <TableCell class="whitespace-nowrap">{{ row.original.updatedBy }}</TableCell>
            <TableCell>{{ blank(row.original.reason) }}</TableCell>
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

    <div v-if="selected" class="space-y-4">
      <div>
        <h2 class="text-xl font-semibold">{{ formatDateTime(selected.updatedTime) }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ selected.updateSource }}
          <template v-if="selected.refreshLabel"> · {{ selected.refreshLabel }}</template>
          · {{ selected.updatedBy }}
          <template v-if="selected.reason"> · {{ selected.reason }}</template>
        </p>
      </div>

      <DataSection v-if="selected.fieldChanges.length" title="Fields">
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
              <TableRow v-for="change in selected.fieldChanges" :key="change.id" :data-state="fieldHighlighted(change) ? 'selected' : undefined">
                <TableCell class="whitespace-nowrap">{{ change.fieldLabel }}</TableCell>
                <TableCell>{{ blank(change.original) }}</TableCell>
                <TableCell>{{ blank(change.updated) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DataSection>

      <DataSection v-if="selected.matchChange" title="Match">
        <div class="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Original match</TableHead>
                <TableHead>Updated match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{{ blank(selected.matchChange.original) }}</TableCell>
                <TableCell>{{ blank(selected.matchChange.updated) }}</TableCell>
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
