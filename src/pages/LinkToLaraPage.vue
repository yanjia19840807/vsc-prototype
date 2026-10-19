<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { ColumnDef } from '@tanstack/vue-table'

import DataSection from '@/components/DataSection.vue'
import DataTableColumnHeader from '@/components/DataTableColumnHeader.vue'
import DataTablePagination from '@/components/DataTablePagination.vue'
import FilterField from '@/components/FilterField.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import QueryPanel from '@/components/QueryPanel.vue'
import ReadonlyField from '@/components/ReadonlyField.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { isLaraLinkTarget } from '@/features/vessel-schedule/lara-link'
import { selectablePorts } from '@/features/terminal-coverage/model'
import SearchFilterControl from '@/features/vessel-search/SearchFilterControl.vue'
import {
  copyFilterSession,
  emptyFilterSession,
  emptyFilterState,
  filterFieldById,
  type FilterFieldDef,
  type FilterState,
} from '@/features/vessel-search/list-setting-model'
import { SEARCH_COLUMNS, searchCellText, searchSortValue } from '@/features/vessel-search/search-columns'
import { useVesselDataTable } from '@/composables/useVesselDataTable'
import { useTabsStore } from '@/stores/tabs'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

const LARA_AREA: { id: string; label: string }[] = [
  { id: 'laraVoyage', label: 'Voyage' },
  { id: 'laraPoolLocation', label: 'Pool location' },
  { id: 'pointCode', label: 'Port' },
  { id: 'vesselName', label: 'Vessel name' },
  { id: 'vesselType', label: 'Vessel type' },
  { id: 'brand', label: 'Brand' },
  { id: 'service', label: 'Service' },
  { id: 'laraEtb', label: 'ETB' },
  { id: 'laraEtd', label: 'ETD' },
  { id: 'voyageStatus', label: 'Voyage status' },
]

const route = useRoute()
const router = useRouter()
const store = useVesselStore()
const tabs = useTabsStore()
const coverage = useTerminalCoverageStore()
const vessel = computed(() => store.byId(String(route.params.id)))

const laraColumns = SEARCH_COLUMNS.filter((column) => column.source === 'lara')
const columns: ColumnDef<any, any>[] = laraColumns.map((column) => ({
  id: column.id,
  header: column.label,
  accessorFn: (row: VesselRecord) => searchSortValue(row, column.id),
  enableSorting: true,
  ...(column.kind === 'datetime' ? { sortFn: 'datetime' as const } : {}),
}))
const LINK_FILTER_IDS = ['vesselName', 'pointCode'] as const

const linkFields: FilterFieldDef[] = LINK_FILTER_IDS.flatMap((id) => {
  const field = filterFieldById(id)
  if (!field) return []
  if (id === 'vesselName') return [{ ...field, kind: 'text' as const }]
  return [field]
})

const draft = ref(emptyFilterSession(LINK_FILTER_IDS))
const applied = ref(emptyFilterSession(LINK_FILTER_IDS))
const searched = ref(false)
const selectedId = ref<string | null>(null)
const remark = ref('')

function suggestedSession(current: VesselRecord) {
  const session = emptyFilterSession(LINK_FILTER_IDS)
  const name = current.vesselName.trim()
  const point = current.pointCode.trim()
  if (name && session.vesselName) session.vesselName = { ...session.vesselName, text: name }
  if (point && session.pointCode) session.pointCode = { ...session.pointCode, values: [point] }
  return session
}

const portOptions = computed(() => selectablePorts(coverage.ports).map((port) => port.portCode))

const rows = computed(() => {
  const current = vessel.value
  if (!searched.value || !current) return [] as VesselRecord[]
  return store.vessels.filter((row) => {
    if (row.recordStatus === 'Inactive') return false
    if (row.id === current.id || row.createdManually || isLaraLinkTarget(row)) return false
    return linkRecordMatches(row, applied.value)
  })
})

const { table, pagination, tableRows, rowCount, pageCount, headerGroups, resetPage, clearSort } = useVesselDataTable({
  columns,
  data: rows,
})

watch(rows, (list) => {
  if (selectedId.value && !list.some((row) => row.id === selectedId.value)) selectedId.value = null
})

function linkRecordMatches(row: VesselRecord, session: Record<string, FilterState>) {
  for (const field of linkFields) {
    const state = session[field.id] ?? emptyFilterState(field.kind)
    if (field.kind === 'multi') {
      if (!state.values.length) continue
      const raw = String(searchSortValue(row, field.id) ?? '')
      const text = searchCellText(row, field.id)
      if (!state.values.includes(raw) && !state.values.includes(text)) return false
      continue
    }
    const query = state.text.trim().toLowerCase()
    if (!query) continue
    const text = searchCellText(row, field.id)
    if (!text || text === '—' || !text.toLowerCase().includes(query)) return false
  }
  return true
}

function optionsFor(field: FilterFieldDef) {
  if (field.optionSource === 'pointCode') return portOptions.value
  return []
}

function setDraft(id: string, state: FilterState) {
  if (!linkFields.some((field) => field.id === id)) return
  draft.value = { ...draft.value, [id]: state }
}

function search() {
  applied.value = copyFilterSession(draft.value)
  searched.value = true
  selectedId.value = null
  resetPage()
}

function runSuggestedQuery() {
  const current = vessel.value
  if (!current) return
  const session = suggestedSession(current)
  draft.value = session
  applied.value = copyFilterSession(session)
  searched.value = true
  selectedId.value = null
  clearSort([])
  resetPage()
}

function clearFilters() {
  runSuggestedQuery()
}

watch(
  () => vessel.value?.id,
  () => {
    runSuggestedQuery()
  },
  { immediate: true },
)

function setSelection(id: string, checked: boolean) {
  selectedId.value = checked ? id : null
}

function closePage() {
  const next = tabs.close(route.path, route.fullPath)
  void router.push(next ?? '/search')
}

function save() {
  const current = vessel.value
  if (!current || !selectedId.value) return
  const ok = store.linkManualVesselToLara(current.id, {
    targetId: selectedId.value,
    reason: remark.value.trim(),
  })
  if (!ok) {
    toast.error('Unable to link this vessel')
    return
  }
  toast.success('Linked to LARA')
  const targetId = selectedId.value
  tabs.close(route.path, route.fullPath)
  void router.push(`/vessels/${targetId}/view`)
}
</script>

<template>
  <div v-if="vessel" class="space-y-4">
    <PageBreadcrumb
      :items="[
        { label: 'Vessel schedule search', to: '/search' },
        { label: vessel.vesselName, to: `/vessels/${vessel.id}/view` },
        { label: 'Link to LARA' },
      ]"
    />
    <div>
      <h1 class="text-xl font-semibold">Link to LARA</h1>
      <p class="text-sm text-muted-foreground">{{ vessel.vesselName }} · {{ vessel.pointCode }} · {{ vessel.laraVoyage }}</p>
    </div>

    <div class="flex flex-col gap-4">
      <DataSection title="LARA">
        <dl class="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          <ReadonlyField
            v-for="column in LARA_AREA"
            :key="column.id"
            class="h-full min-h-[3.25rem]"
            :label="column.label"
            :value="searchCellText(vessel, column.id)"
          />
        </dl>
      </DataSection>

      <DataSection title="Search" class="gap-4">
      <QueryPanel @search="search" @clear="clearFilters">
        <FilterField v-for="field in linkFields" :key="field.id" :label="field.label">
          <SearchFilterControl
            v-if="draft[field.id]"
            :field="field"
            :state="draft[field.id]!"
            :options="optionsFor(field)"
            @update:state="setDraft(field.id, $event)"
          />
        </FilterField>
      </QueryPanel>

      <div class="overflow-auto rounded-md border">
        <Table class="min-w-max border-separate border-spacing-0 [&_td]:border-b [&_th]:border-b">
          <TableHeader>
            <TableRow v-for="headerGroup in headerGroups" :key="headerGroup.id">
              <TableHead class="w-16 whitespace-nowrap">Select</TableHead>
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
            <TableEmpty v-if="!tableRows.length" :colspan="laraColumns.length + 1">
              {{ searched ? 'No results.' : 'Search to find a LARA record.' }}
            </TableEmpty>
            <TableRow
              v-for="row in tableRows"
              :key="row.id"
              :data-state="selectedId === row.original.id ? 'selected' : undefined"
            >
              <TableCell class="w-16">
                <Checkbox
                  :model-value="selectedId === row.original.id"
                  :aria-label="selectedId === row.original.id ? 'Clear selection' : 'Select LARA record'"
                  @update:model-value="setSelection(row.original.id, $event === true)"
                />
              </TableCell>
              <TableCell v-for="column in laraColumns" :key="column.id" class="whitespace-nowrap">
                {{ searchCellText(row.original, column.id) }}
              </TableCell>
            </TableRow>
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
    </div>

    <Alert>
      <AlertDescription>
        Confirm the formal LARA row before saving. The link cannot be undone. This manual row becomes inactive and drops out of the default search. If it already has terminal data, that terminal picture replaces the formal row. A formal row with no terminal data on this manual row keeps its own terminal result.
      </AlertDescription>
    </Alert>

    <label class="grid gap-1 text-sm">
      <span>Remark</span>
      <Textarea v-model="remark" rows="2" placeholder="Why this LARA record is linked" />
    </label>

    <div class="flex justify-end gap-2 border-t pt-4">
      <Button type="button" variant="outline" @click="closePage">Cancel</Button>
      <Button type="button" variant="primary" :disabled="!selectedId" @click="save">Save</Button>
    </div>
  </div>
  <Alert v-else variant="warning">
    <AlertDescription>This schedule record is no longer available.</AlertDescription>
  </Alert>
</template>
