<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown, Download, Plus, Settings } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { FlexRender, type ColumnVisibilityState } from '@tanstack/vue-table'

import FilterField from '@/components/FilterField.vue'
import QueryPanel from '@/components/QueryPanel.vue'
import DataTableColumnHeader from '@/components/DataTableColumnHeader.vue'
import DataTablePagination from '@/components/DataTablePagination.vue'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useVesselDataTable } from '@/composables/useVesselDataTable'
import ManualAddVesselDialog from '@/features/vessel-schedule/ManualAddVesselDialog.vue'
import type { ScheduleQuickAction } from '@/features/vessel-schedule/mismatch-actions'
import VesselQuickActions from '@/features/vessel-schedule/VesselQuickActions.vue'
import SearchFilterControl from '@/features/vessel-search/SearchFilterControl.vue'
import SearchRowActions from '@/features/vessel-search/SearchRowActions.vue'
import {
  COLUMN_GROUP_CLASS,
  COLUMN_GROUP_LABEL,
  COLUMN_GROUP_ORDER,
  columnGroup,
  columnHeaderLabelById,
  groupColumnOrder,
  groupedSearchColumnDefs,
  SEARCH_COLUMNS,
  searchCellText,
} from '@/features/vessel-search/search-columns'
import {
  copyFilterSession,
  filterFieldById,
  isFilterFilled,
  portsForRegions,
  retainPointCodes,
  scheduleValueOptions,
  sessionFromSetting,
  staticFilterOptions,
  vesselMatchesFilters,
  visibleFilterPrefs,
  type FilterFieldDef,
  type FilterState,
} from '@/features/vessel-search/list-setting-model'
import { DEFAULT_SORT, frozenColumnIds, type SortRule } from '@/features/vessel-search/schedule-prefs'
import { regionLabel, selectablePorts, selectableRegions } from '@/features/terminal-coverage/model'
import { downloadText, formatFileStamp, toCsv } from '@/lib/vessel-utils'
import { useListSettingsStore } from '@/stores/list-settings'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

const store = useVesselStore()
const listSettings = useListSettingsStore()
const coverage = useTerminalCoverageStore()
const router = useRouter()

const filtersOpen = ref(true)
const addVesselOpen = ref(false)
const actionVessel = ref<VesselRecord | null>(null)
const quickAction = ref<ScheduleQuickAction | null>(null)
const query = ref<Record<string, FilterState>>({})
const applied = ref<Record<string, FilterState>>({})
const columnOrder = ref<string[]>(SEARCH_COLUMNS.map((column) => column.id))
const hidden = ref<string[]>([])
const freezeThrough = ref<string | null>(null)
const freezeOffsets = ref<Record<string, number>>({})
const tableWrap = ref<HTMLElement | null>(null)
const savedSort = ref<SortRule[]>(DEFAULT_SORT.map((rule) => ({ ...rule })))
const columnVisibility = ref<ColumnVisibilityState>(visibilityFrom([]))

function visibilityFrom(hiddenIds: string[]): ColumnVisibilityState {
  const visibility: ColumnVisibilityState = {}
  for (const column of SEARCH_COLUMNS) {
    visibility[column.id] = column.id === 'vesselName' || !hiddenIds.includes(column.id)
  }
  return visibility
}

const columns = groupedSearchColumnDefs(SEARCH_COLUMNS.map((column) => column.id))
const actionsColumn = columns.find((column) => column.id === 'actions')
if (actionsColumn) {
  actionsColumn.cell = ({ row }) => h(SearchRowActions, {
    vessel: row.original as VesselRecord,
    onView: () => openVessel(row.original as VesselRecord),
    onQuick: (action) => openQuickAction(row.original as VesselRecord, action),
    onHistory: () => openHistory(row.original as VesselRecord),
  })
}

const visibleFilters = computed(() => {
  const setting = listSettings.active
  if (!setting) return []
  return visibleFilterPrefs(setting).map((pref) => ({
    pref,
    field: filterFieldById(pref.id)!,
  })).filter((row) => row.field)
})

const appliedCount = computed(() =>
  visibleFilters.value.filter(({ field }) => isFilterFilled(field, query.value[field.id])).length,
)

const regionOptions = computed(() => selectableRegions(coverage.regions).map((region) => regionLabel(region)))
const portOptions = computed(() => portsForRegions(query.value.region?.values ?? [], selectablePorts(coverage.ports)))
const terminalCodes = computed(() =>
  [...new Set(selectablePorts(coverage.ports).flatMap((port) => port.terminals.map((terminal) => terminal.pool).filter(Boolean)))],
)
const terminalNames = computed(() =>
  [...new Set(selectablePorts(coverage.ports).flatMap((port) => port.terminals.map((terminal) => terminal.nameZh || terminal.abbr || terminal.pool).filter(Boolean)))],
)

function optionsFor(field: FilterFieldDef) {
  if (field.optionSource === 'region') return regionOptions.value
  if (field.optionSource === 'pointCode') return portOptions.value
  if (field.optionSource === 'terminal9code') return terminalCodes.value
  if (field.optionSource === 'terminalName') return terminalNames.value
  if (field.optionSource === 'vesselName' || field.optionSource === 'laraVoyage') {
    return scheduleValueOptions(store.vessels, field.optionSource)
  }
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

function setQuery(id: string, state: FilterState) {
  const field = filterFieldById(id)
  if (!field) return
  const next = { ...query.value, [id]: fromDisplay(field, state) }
  if (id === 'region' && next.pointCode) {
    next.pointCode = {
      ...next.pointCode,
      values: retainPointCodes(next.region?.values ?? [], next.pointCode.values, coverage.ports),
    }
  }
  query.value = next
}

const results = computed(() => store.vessels.filter((vessel) => vesselMatchesFilters(vessel, applied.value)))

const {
  table,
  tableRows,
  sortedAllRows,
  rowCount,
  pageCount,
  headerGroups,
  pagination,
  resetPage,
  clearSort,
} = useVesselDataTable({
  columns,
  data: results,
  columnVisibility,
  columnOrder,
  initialSorting: savedSort.value,
})

function applyQuery() {
  applied.value = copyFilterSession(query.value)
  resetPage()
}

function applyActiveSetting() {
  const setting = listSettings.active
  if (!setting) return
  query.value = sessionFromSetting(setting)
  applied.value = copyFilterSession(query.value)
  hidden.value = setting.columns.hidden
  freezeThrough.value = setting.columns.freezeThrough ?? null
  columnOrder.value = groupColumnOrder(setting.columns.order)
  table.setColumnOrder(columnOrder.value)
  table.setColumnVisibility(visibilityFrom(setting.columns.hidden))
  const sort = setting.sort.length ? setting.sort : DEFAULT_SORT
  savedSort.value = sort.map((rule) => ({ ...rule }))
  clearSort(savedSort.value)
}

watch(results, () => resetPage())
watch(
  () => [listSettings.activeId, listSettings.revision] as const,
  () => applyActiveSetting(),
  { immediate: true },
)

function clearQuery() {
  applyActiveSetting()
}

function exportCsv() {
  const visible = columnOrder.value.filter((id) => columnVisibility.value[id] !== false)
  const rows = sortedAllRows.value.map((vessel) => {
    const row: Record<string, string> = {}
    for (const id of visible) {
      const text = searchCellText(vessel, id)
      row[columnHeaderLabelById(id)] = text === '—' ? '' : text
    }
    return row
  })
  downloadText(`vessel-schedule-search-${formatFileStamp()}.csv`, toCsv(rows))
  toast.success(`Exported ${rows.length} row(s)`)
}

const ACTIONS_STICKY = 'sticky right-0 z-20 border-l-2 border-l-[#8aa0bb] shadow-[-8px_0_8px_-6px_rgba(20,35,58,0.18)]'
const ACTIONS_HEAD = 'sticky right-0 z-30 h-auto border-l-2 border-l-[#8aa0bb] bg-card text-left align-middle shadow-[-8px_0_8px_-6px_rgba(20,35,58,0.18)]'
const FREEZE_SHADOW = 'shadow-[8px_0_8px_-6px_rgba(20,35,58,0.18)]'

const frozenIds = computed(() =>
  frozenColumnIds({
    order: columnOrder.value,
    hidden: hidden.value,
    freezeThrough: freezeThrough.value,
  }),
)

function measureFreeze() {
  const root = tableWrap.value
  const ids = frozenIds.value
  if (!root || !ids.length) {
    if (Object.keys(freezeOffsets.value).length) freezeOffsets.value = {}
    return
  }
  const next: Record<string, number> = {}
  let left = 0
  for (const id of ids) {
    next[id] = left
    const cell = root.querySelector<HTMLElement>(`[data-freeze-id="${id}"]`)
    left += cell?.offsetWidth ?? 0
  }
  const prev = freezeOffsets.value
  const unchanged = Object.keys(prev).length === ids.length && ids.every((id) => prev[id] === next[id])
  if (!unchanged) freezeOffsets.value = next
}

let resizeObserver: ResizeObserver | null = null

function observeTable() {
  resizeObserver?.disconnect()
  const table = tableWrap.value?.querySelector('[data-slot="table"]')
  if (table) resizeObserver?.observe(table)
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => measureFreeze())
  observeTable()
  measureFreeze()
})

onBeforeUnmount(() => resizeObserver?.disconnect())

watch(tableWrap, () => observeTable())

watch([frozenIds, tableRows], () => {
  void nextTick(measureFreeze)
}, { flush: 'post' })

function freezeStyle(id: string) {
  const left = freezeOffsets.value[id]
  if (left === undefined) return undefined
  return { left: `${left}px` }
}

function headerFreezeClass(id: string) {
  if (!frozenIds.value.includes(id)) return undefined
  return id === frozenIds.value.at(-1) ? ['sticky z-20', FREEZE_SHADOW] : 'sticky z-20'
}

function cellFreezeClass(id: string, rowNotFound: boolean) {
  if (!frozenIds.value.includes(id)) return undefined
  return [
    'sticky z-10',
    id === frozenIds.value.at(-1) ? FREEZE_SHADOW : '',
    rowNotFound ? 'bg-muted' : 'bg-card',
    'group-hover:bg-muted',
  ]
}

function leafHeaderClass(id: string) {
  return COLUMN_GROUP_CLASS[columnGroup(id)] ?? ''
}

function openVessel(vessel: VesselRecord) {
  void router.push(`/vessels/${vessel.id}/view`)
}

function openQuickAction(vessel: VesselRecord, action: ScheduleQuickAction) {
  actionVessel.value = vessel
  quickAction.value = action
}

function openHistory(vessel: VesselRecord) {
  void router.push(`/vessels/${vessel.id}/activity-log`)
}

function activateSetting(id: string) {
  if (typeof id === 'string') listSettings.activate(id)
}

const visibleColCount = computed(
  () => SEARCH_COLUMNS.filter((column) => columnVisibility.value[column.id] !== false).length + 1,
)
</script>

<template>
  <div class="w-full min-w-0">
    <div class="flex flex-wrap items-center justify-end gap-2 py-4">
      <FilterField label="Setting">
        <Select :model-value="listSettings.activeId" @update:model-value="(value) => typeof value === 'string' && activateSetting(value)">
          <SelectTrigger class="h-8 w-52" aria-label="Setting">
            <SelectValue placeholder="Setting" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in listSettings.items" :key="item.id" :value="item.id">
              {{ item.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </FilterField>
      <Button type="button" variant="outline" @click="router.push('/list-settings')">
        <Settings class="size-3.5" /> Settings
      </Button>
      <Button type="button" variant="outline" @click="exportCsv">
        <Download class="size-3.5" /> Export
      </Button>
      <Button type="button" variant="secondary" @click="addVesselOpen = true">
        <Plus class="size-3.5" /> Add vessel
      </Button>
    </div>

    <div class="mb-4">
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
      <QueryPanel v-if="filtersOpen" class="pt-3" @search="applyQuery" @clear="clearQuery">
        <FilterField v-for="row in visibleFilters" :key="row.field.id" :label="row.field.label">
          <SearchFilterControl
            v-if="query[row.field.id]"
            :field="row.field"
            :state="toDisplay(row.field, query[row.field.id]!)"
            :options="optionsFor(row.field)"
            @update:state="setQuery(row.field.id, $event)"
          />
        </FilterField>
      </QueryPanel>
    </div>

    <div ref="tableWrap" class="overflow-hidden rounded-md border">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-card px-3 py-2 text-xs">
        <span
          v-for="group in COLUMN_GROUP_ORDER"
          :key="group"
          class="inline-flex items-center gap-1.5"
        >
          <span
            class="size-3 shrink-0 rounded-sm border border-black/10"
            :class="COLUMN_GROUP_CLASS[group]"
          />
          {{ COLUMN_GROUP_LABEL[group] }}
        </span>
      </div>
      <Table class="min-w-max border-separate border-spacing-0 [&_td]:border-b [&_th]:border-b">
        <TableHeader>
          <TableRow v-for="headerGroup in headerGroups" :key="headerGroup.id">
            <template v-for="header in headerGroup.headers" :key="header.id">
              <TableHead
                v-if="!header.isPlaceholder && header.colSpan > 0 && header.rowSpan > 0"
                :colspan="header.colSpan"
                :rowspan="header.rowSpan > 1 ? header.rowSpan : undefined"
                :data-freeze-id="frozenIds.includes(header.column.id) ? header.column.id : undefined"
                :style="freezeStyle(header.column.id)"
                class="whitespace-nowrap"
                :class="header.column.id === 'actions' ? ACTIONS_HEAD : [leafHeaderClass(header.column.id), headerFreezeClass(header.column.id)]"
              >
                <DataTableColumnHeader
                  v-if="header.column.getCanSort()"
                  :title="String(header.column.columnDef.header ?? header.column.id)"
                  :sorted="header.column.getIsSorted()"
                  :sort-index="header.column.getIsSorted() ? header.column.getSortIndex() + 1 : 0"
                  @sort="(desc) => header.column.toggleSorting(desc, true)"
                  @clear-sort="header.column.clearSorting()"
                  @clear-all-sort="table.setSorting([])"
                />
                <FlexRender v-else :header="header" />
              </TableHead>
            </template>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="row in tableRows"
            :key="row.id"
            class="group"
            :class="row.original.rowNotFound ? 'bg-muted' : ''"
          >
            <TableCell
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              class="whitespace-nowrap"
              :style="freezeStyle(cell.column.id)"
              :class="cell.column.id === 'actions'
                ? [ACTIONS_STICKY, row.original.rowNotFound ? 'bg-muted' : 'bg-card', 'group-hover:bg-muted']
                : cellFreezeClass(cell.column.id, Boolean(row.original.rowNotFound))"
            >
              <FlexRender :cell="cell" />
            </TableCell>
          </TableRow>
          <TableEmpty v-if="!tableRows.length" :colspan="Math.max(visibleColCount, 1)" />
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

    <ManualAddVesselDialog v-model:open="addVesselOpen" />
    <VesselQuickActions :vessel="actionVessel" :action="quickAction" @close="quickAction = null" />
  </div>
</template>
