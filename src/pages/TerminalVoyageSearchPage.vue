<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown } from '@lucide/vue'
import { FlexRender } from '@tanstack/vue-table'

import DataTableColumnHeader from '@/components/DataTableColumnHeader.vue'
import DataTablePagination from '@/components/DataTablePagination.vue'
import FilterField from '@/components/FilterField.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import QueryPanel from '@/components/QueryPanel.vue'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { tableActionsCell, tableActionsHead } from '@/components/ui/table/chrome'
import { useVesselDataTable } from '@/composables/useVesselDataTable'
import { terminalVoyageColumnDefs } from '@/features/terminal-voyage/columns'
import {
  LOCKED_TERMINAL_VOYAGE_COLUMNS,
  TERMINAL_VOYAGE_COLUMNS,
  TERMINAL_VOYAGE_FILTERS,
  emptyTerminalVoyageQuery,
  terminalVoyageMatches,
  terminalVoyageRows,
  type TerminalVoyageRow,
} from '@/features/terminal-voyage/model'
import SearchFilterControl from '@/features/vessel-search/SearchFilterControl.vue'
import { copyFilterSession, isFilterFilled, portsForRegions, retainPointCodes, staticFilterOptions, type FilterFieldDef, type FilterState } from '@/features/vessel-search/list-setting-model'
import { regionLabel, selectablePorts, selectableRegions } from '@/features/terminal-coverage/model'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'

const router = useRouter()
const store = useVesselStore()
const coverage = useTerminalCoverageStore()

const filtersOpen = ref(true)
const query = ref(emptyTerminalVoyageQuery())
const applied = ref(emptyTerminalVoyageQuery())

const regionOptions = computed(() => selectableRegions(coverage.regions).map((region) => regionLabel(region)))
const portOptions = computed(() => portsForRegions(query.value.region?.values ?? [], selectablePorts(coverage.ports)))

function filterOptions(field: FilterFieldDef) {
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

const rows = computed(() => terminalVoyageRows(store.vessels))
const results = computed(() => rows.value.filter((row) => terminalVoyageMatches(row, applied.value)))

const columns = terminalVoyageColumnDefs()
const actionsColumn = columns.find((column) => column.id === 'actions')
if (actionsColumn) {
  actionsColumn.cell = ({ row }) => h(Button, {
    type: 'button',
    size: 'xs',
    variant: 'outline',
    onClick: () => openRow(row.original as TerminalVoyageRow),
  }, () => 'View')
}

const {
  table,
  tableRows,
  rowCount,
  pageCount,
  headerGroups,
  pagination,
  resetPage,
} = useVesselDataTable({
  columns,
  data: results,
  initialSorting: [{ id: 'eta', desc: true }],
  initialPageSize: 100,
})

const appliedCount = computed(() =>
  TERMINAL_VOYAGE_FILTERS.filter((field) => isFilterFilled(field, query.value[field.id])).length,
)

function setQuery(id: string, state: FilterState) {
  const field = TERMINAL_VOYAGE_FILTERS.find((item) => item.id === id)
  const next = { ...query.value, [id]: field ? fromDisplay(field, state) : state }
  if (id === 'region' && next.portCode) {
    next.portCode = {
      ...next.portCode,
      values: retainPointCodes(next.region?.values ?? [], next.portCode.values, coverage.ports),
    }
  }
  query.value = next
}

function applyQuery() {
  applied.value = copyFilterSession(query.value)
  resetPage()
}

function clearQuery() {
  query.value = emptyTerminalVoyageQuery()
  applied.value = emptyTerminalVoyageQuery()
  resetPage()
}

function openRow(row: TerminalVoyageRow) {
  void router.push(`/terminal-voyages/${row.id}`)
}

const ACTIONS_STICKY = tableActionsCell
const ACTIONS_HEAD = tableActionsHead
const FREEZE_SHADOW = 'shadow-[8px_0_8px_-6px_var(--border)]'

const tableWrap = ref<HTMLElement | null>(null)
const freezeOffsets = ref<Record<string, number>>({})
const frozenIds: readonly string[] = LOCKED_TERMINAL_VOYAGE_COLUMNS

function measureFreeze() {
  const root = tableWrap.value
  if (!root) return
  const next: Record<string, number> = {}
  let left = 0
  for (const id of frozenIds) {
    next[id] = left
    const cell = root.querySelector<HTMLElement>(`[data-freeze-id="${id}"]`)
    left += cell?.offsetWidth ?? 0
  }
  const prev = freezeOffsets.value
  const unchanged = frozenIds.every((id) => prev[id] === next[id])
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

watch(tableRows, () => {
  void nextTick(measureFreeze)
}, { flush: 'post' })

function freezeStyle(id: string) {
  const left = freezeOffsets.value[id]
  if (left === undefined) return undefined
  return { left: `${left}px` }
}

function frozenIndex(id: string) {
  return frozenIds.indexOf(id)
}

function headerFreezeClass(id: string) {
  const index = frozenIndex(id)
  if (index < 0) return undefined
  return index === frozenIds.length - 1 ? ['sticky z-40 bg-card', FREEZE_SHADOW] : 'sticky z-40 bg-card'
}

function cellFreezeClass(id: string) {
  const index = frozenIndex(id)
  if (index < 0) return undefined
  return index === frozenIds.length - 1 ? ['sticky z-10 bg-card group-hover:bg-muted', FREEZE_SHADOW] : 'sticky z-10 bg-card group-hover:bg-muted'
}
</script>

<template>
  <div class="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-hidden py-4">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <PageBreadcrumb :items="[{ label: 'Terminal voyage' }]" />
    </div>

    <div class="shrink-0">
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
        <FilterField v-for="field in TERMINAL_VOYAGE_FILTERS" :key="field.id" :label="field.label">
          <SearchFilterControl
            v-if="query[field.id]"
            :field="field"
            :state="toDisplay(field, query[field.id]!)"
            :options="filterOptions(field)"
            @update:state="setQuery(field.id, $event)"
          />
        </FilterField>
      </QueryPanel>
    </div>

    <div ref="tableWrap" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border">
      <div class="min-h-0 flex-1 overflow-auto">
        <Table :scrollable="false" class="min-w-max">
          <TableHeader pinned>
            <TableRow v-for="headerGroup in headerGroups" :key="headerGroup.id">
              <template v-for="header in headerGroup.headers" :key="header.id">
                <TableHead
                  v-if="!header.isPlaceholder && header.colSpan > 0 && header.rowSpan > 0"
                  :colspan="header.colSpan"
                  :rowspan="header.rowSpan > 1 ? header.rowSpan : undefined"
                  :data-freeze-id="frozenIndex(header.column.id) >= 0 ? header.column.id : undefined"
                  :style="freezeStyle(header.column.id)"
                  class="whitespace-nowrap"
                  :class="header.column.id === 'actions' ? ACTIONS_HEAD : headerFreezeClass(header.column.id)"
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
            <TableRow v-for="row in tableRows" :key="row.id" class="group">
              <TableCell
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                :style="freezeStyle(cell.column.id)"
                class="whitespace-nowrap"
                :class="cell.column.id === 'actions' ? ACTIONS_STICKY : cellFreezeClass(cell.column.id)"
              >
                <FlexRender :cell="cell" />
              </TableCell>
            </TableRow>
            <TableEmpty v-if="!tableRows.length" :colspan="TERMINAL_VOYAGE_COLUMNS.length + 1" />
          </TableBody>
        </Table>
      </div>
    </div>
    <DataTablePagination
      class="shrink-0"
      :total="rowCount"
      :page-index="pagination.pageIndex"
      :page-size="pagination.pageSize"
      :page-count="pageCount"
      @update:page-index="(index) => table.setPageIndex(index)"
      @update:page-size="(size) => table.setPageSize(size)"
    />
  </div>
</template>
