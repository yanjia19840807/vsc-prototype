<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { GripVertical, Plus, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'

import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  SEARCH_COLUMNS,
  columnGroup,
  columnHeaderLabelById,
  groupColumnOrder,
} from '@/features/vessel-search/search-columns'
import SearchFilterControl from '@/features/vessel-search/SearchFilterControl.vue'
import {
  copyListSetting,
  createListSetting,
  defaultFilterPrefs,
  filterFieldById,
  filterFields,
  normalizeFilterPrefs,
  portsForRegions,
  retainPointCodes,
  staticFilterOptions,
  type FilterFieldDef,
  type FilterState,
  type ListSetting,
} from '@/features/vessel-search/list-setting-model'
import { DEFAULT_SORT, defaultColumnPrefs } from '@/features/vessel-search/schedule-prefs'
import { regionLabel } from '@/features/terminal-coverage/model'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { useListSettingsStore } from '@/stores/list-settings'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'

const coverage = useTerminalCoverageStore()
const store = useListSettingsStore()

const selectedId = ref(store.activeId)
const draft = ref<ListSetting>(cloneSelected())
const tab = ref('filters')
const dragFilter = ref<number | null>(null)
const dragColumn = ref<number | null>(null)
const dragSort = ref<number | null>(null)
const nameOpen = ref(false)
const nameMode = ref<'new' | 'rename' | 'duplicate'>('new')
const nameDraft = ref('')
const deleteOpen = ref(false)

const selected = computed(() => store.byId(selectedId.value) ?? store.active)
const unusedSortColumns = computed(() =>
  SEARCH_COLUMNS.filter((column) => !draft.value.sort.some((rule) => rule.id === column.id)),
)

const regionOptions = computed(() => coverage.regions.map((region) => regionLabel(region)))
const selectedRegionCodes = computed(
  () => draft.value.filters.find((pref) => pref.id === 'region')?.default.values ?? [],
)
const portOptions = computed(() => portsForRegions(selectedRegionCodes.value, coverage.ports))
const terminalCodes = computed(() =>
  [...new Set(coverage.ports.flatMap((port) => port.terminals.map((terminal) => terminal.pool).filter(Boolean)))],
)
const terminalNames = computed(() =>
  [...new Set(coverage.ports.flatMap((port) => port.terminals.map((terminal) => terminal.nameZh || terminal.abbr || terminal.pool).filter(Boolean)))],
)

function cloneSelected(): ListSetting {
  const current = store.byId(selectedId.value) ?? store.active
  return current ? copyListSetting(current) : createListSetting('Default')
}

function selectSetting(id: string) {
  selectedId.value = id
  draft.value = cloneSelected()
  tab.value = 'filters'
}

watch(
  () => store.items.map((item) => item.id).join(','),
  () => {
    if (!store.byId(selectedId.value)) selectSetting(store.activeId)
  },
)

function filterDef(id: string) {
  return filterFieldById(id) ?? filterFields()[0]!
}

function optionsFor(field: FilterFieldDef) {
  if (field.optionSource === 'region') return regionOptions.value
  if (field.optionSource === 'pointCode') return portOptions.value
  if (field.optionSource === 'terminal9code') return terminalCodes.value
  if (field.optionSource === 'terminalName') return terminalNames.value
  return staticFilterOptions(field.optionSource)
}

function toDisplay(field: FilterFieldDef, state: FilterState): FilterState {
  if (field.id !== 'region') return state
  const labels = state.values.map((code) => {
    const region = coverage.regions.find((item) => item.code === code)
    return region ? regionLabel(region) : code
  })
  return { ...state, values: labels }
}

function fromDisplay(field: FilterFieldDef, state: FilterState): FilterState {
  if (field.id !== 'region') return state
  const codes = state.values.map((label) => {
    const region = coverage.regions.find((item) => regionLabel(item) === label)
    return region?.code ?? label
  })
  return { ...state, values: codes }
}

function setFilterState(id: string, state: FilterState) {
  const field = filterDef(id)
  const pref = draft.value.filters.find((item) => item.id === id)
  if (!pref) return
  pref.default = fromDisplay(field, state)
  if (id !== 'region') return
  const point = draft.value.filters.find((item) => item.id === 'pointCode')
  if (!point) return
  point.default = {
    ...point.default,
    values: retainPointCodes(pref.default.values, point.default.values, coverage.ports),
  }
}

function setVisible(id: string, visible: boolean) {
  const pref = draft.value.filters.find((item) => item.id === id)
  if (pref) pref.visible = visible
}

function move<T>(list: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (!item) return list
  next.splice(to, 0, item)
  return next
}

function addSort() {
  const column = unusedSortColumns.value[0]
  if (!column) return
  draft.value.sort = [...draft.value.sort, { id: column.id, desc: false }]
}

function resetColumns() {
  draft.value.columns = { order: [...defaultColumnPrefs().order], hidden: [] }
}

function resetSort() {
  draft.value.sort = DEFAULT_SORT.map((rule) => ({ ...rule }))
}

function resetFilters() {
  draft.value.filters = defaultFilterPrefs()
}

function visibleColumn(id: string) {
  return id === 'vesselName' || !draft.value.columns.hidden.includes(id)
}

function toggleColumn(id: string, on: boolean) {
  if (id === 'vesselName') return
  draft.value.columns.hidden = on
    ? draft.value.columns.hidden.filter((item) => item !== id)
    : [...draft.value.columns.hidden, id]
}

function openName(mode: 'new' | 'rename' | 'duplicate') {
  nameMode.value = mode
  nameDraft.value = mode === 'rename'
    ? draft.value.name
    : mode === 'duplicate'
      ? store.nextName(`${draft.value.name} copy`)
      : store.nextName('Setting')
  nameOpen.value = true
}

function confirmName() {
  const name = nameDraft.value.trim()
  if (!name) {
    toast.error('Name is required')
    return
  }
  if (nameMode.value === 'rename') {
    store.rename(selectedId.value, name)
    draft.value.name = name
  } else if (nameMode.value === 'duplicate') {
    const copy = store.duplicate(selectedId.value)
    if (copy) {
      store.rename(copy.id, name)
      selectSetting(copy.id)
    }
  } else {
    const created = store.create(name)
    selectSetting(created.id)
  }
  nameOpen.value = false
}

function activate() {
  store.activate(selectedId.value)
  toast.success(`${draft.value.name} is active`)
}

function removeSelected() {
  if (!store.remove(selectedId.value)) {
    toast.error('Activate another setting before deleting this one')
    return
  }
  selectSetting(store.activeId)
  toast.success('Setting deleted')
}

function save() {
  draft.value.filters = normalizeFilterPrefs(draft.value.filters)
  draft.value.columns.order = groupColumnOrder(draft.value.columns.order)
  store.replace({
    ...draft.value,
    filters: draft.value.filters.map((pref) => ({
      ...pref,
      default: { ...pref.default, values: [...pref.default.values] },
    })),
    columns: { order: [...draft.value.columns.order], hidden: [...draft.value.columns.hidden] },
    sort: draft.value.sort.map((rule) => ({ ...rule })),
  })
  toast.success('List setting saved')
}

function cancel() {
  draft.value = cloneSelected()
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
    <PageBreadcrumb
      :items="[
        { label: 'Vessel schedule search', to: '/search' },
        { label: 'List settings' },
      ]"
    />
    <div class="flex shrink-0 flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">List settings</h1>
        <p class="text-sm text-muted-foreground">Save more than one list layout and activate one at a time.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button type="button" variant="outline" @click="openName('new')">
          <Plus class="size-3.5" /> New
        </Button>
        <Button type="button" variant="outline" @click="openName('duplicate')">Duplicate</Button>
        <Button type="button" variant="outline" @click="openName('rename')">Rename</Button>
        <Button type="button" variant="outline" :disabled="selectedId === store.activeId" @click="activate">
          Activate
        </Button>
        <Button
          type="button"
          variant="outline"
          :disabled="store.items.length <= 1 || selectedId === store.activeId"
          @click="deleteOpen = true"
        >
          Delete
        </Button>
      </div>
    </div>

    <div class="grid min-h-0 flex-1 gap-6 lg:grid-cols-[16rem_1fr]">
      <div class="max-h-full self-start overflow-y-auto overflow-hidden rounded-md border">
        <button
          v-for="item in store.items"
          :key="item.id"
          type="button"
          class="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0"
          :class="item.id === selectedId ? 'bg-muted' : 'hover:bg-muted/50'"
          @click="selectSetting(item.id)"
        >
          <span class="truncate font-medium">{{ item.name }}</span>
          <Badge v-if="item.id === store.activeId" variant="secondary">Active</Badge>
        </button>
      </div>

      <div class="flex min-h-0 min-w-0 flex-col gap-3">
        <h2 class="shrink-0 text-sm font-medium">{{ draft.name }}</h2>
        <Tabs v-model="tab" class="flex min-h-0 flex-1 flex-col gap-3">
          <div class="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="filters">Filters</TabsTrigger>
              <TabsTrigger value="columns">Columns</TabsTrigger>
              <TabsTrigger value="sort">Sort</TabsTrigger>
            </TabsList>
            <div class="flex flex-wrap justify-end gap-2">
              <Button v-if="tab === 'sort'" type="button" variant="outline" :disabled="!unusedSortColumns.length" @click="addSort">
                <Plus class="size-3.5" /> Add rule
              </Button>
              <Button
                v-if="tab === 'filters'"
                type="button"
                variant="outline"
                @click="resetFilters"
              >
                Reset filters
              </Button>
              <Button
                v-else-if="tab === 'columns'"
                type="button"
                variant="outline"
                @click="resetColumns"
              >
                Reset columns
              </Button>
              <Button
                v-else
                type="button"
                variant="outline"
                @click="resetSort"
              >
                Reset sort
              </Button>
            </div>
          </div>

          <TabsContent value="filters" class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
              <div class="flex shrink-0 items-center gap-3 border-b px-3 py-2 text-sm font-medium">
                <span class="size-4 shrink-0" aria-hidden="true" />
                <span class="size-4 shrink-0" aria-hidden="true" />
                <span class="w-56 shrink-0">Field</span>
                <span>Default</span>
              </div>
              <ul class="min-h-0 flex-1 overflow-y-auto">
                <li
                  v-for="(pref, index) in draft.filters"
                  :key="pref.id"
                  class="flex items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
                  draggable="true"
                  @dragstart="dragFilter = index"
                  @dragover.prevent
                  @drop="draft.filters = move(draft.filters, dragFilter ?? index, index)"
                >
                  <GripVertical class="size-4 shrink-0 text-muted-foreground" />
                  <Checkbox
                    :model-value="pref.visible"
                    @update:model-value="(value) => setVisible(pref.id, value === true)"
                  />
                  <span class="w-56 shrink-0 text-sm">{{ filterDef(pref.id).label }}</span>
                  <div class="min-w-0">
                    <SearchFilterControl
                      :field="filterDef(pref.id)"
                      :state="toDisplay(filterDef(pref.id), pref.default)"
                      :options="optionsFor(filterDef(pref.id))"
                      @update:state="setFilterState(pref.id, $event)"
                    />
                  </div>
                </li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="columns" class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
              <div class="flex shrink-0 items-center gap-3 border-b px-3 py-2 text-sm font-medium">
                <span class="size-4 shrink-0" aria-hidden="true" />
                <span class="size-4 shrink-0" aria-hidden="true" />
                <span>Field</span>
              </div>
              <ul class="min-h-0 flex-1 overflow-y-auto">
                <li
                  v-for="(id, index) in draft.columns.order"
                  :key="id"
                  class="flex items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
                  draggable="true"
                  @dragstart="dragColumn = index"
                  @dragover.prevent
                  @drop="columnGroup(draft.columns.order[dragColumn ?? index] ?? '') === columnGroup(id) && (draft.columns.order = move(draft.columns.order, dragColumn ?? index, index))"
                >
                  <GripVertical class="size-4 shrink-0 text-muted-foreground" />
                  <Checkbox
                    :model-value="visibleColumn(id)"
                    :disabled="id === 'vesselName'"
                    @update:model-value="(value) => toggleColumn(id, value === true)"
                  />
                  <span class="text-sm">{{ columnHeaderLabelById(id) }}</span>
                </li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="sort" class="min-h-0 overflow-auto">
            <ul class="overflow-hidden rounded-md border">
              <li
                v-for="(rule, index) in draft.sort"
                :key="`${rule.id}-${index}`"
                class="flex items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
                draggable="true"
                @dragstart="dragSort = index"
                @dragover.prevent
                @drop="draft.sort = move(draft.sort, dragSort ?? index, index)"
              >
                <GripVertical class="size-4 shrink-0 text-muted-foreground" />
                <Select :model-value="rule.id" @update:model-value="(value) => typeof value === 'string' && (rule.id = value)">
                  <SelectTrigger class="h-8 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="column in SEARCH_COLUMNS" :key="column.id" :value="column.id">
                      {{ columnHeaderLabelById(column.id) }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  :model-value="rule.desc ? 'desc' : 'asc'"
                  @update:model-value="(value) => (rule.desc = value === 'desc')"
                >
                  <SelectTrigger class="h-8 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" size="icon" variant="ghost" aria-label="Remove sort rule" @click="draft.sort.splice(index, 1)">
                  <Trash2 class="size-4" />
                </Button>
              </li>
            </ul>
          </TabsContent>
        </Tabs>

        <div class="flex shrink-0 justify-end gap-2">
          <Button type="button" variant="outline" @click="cancel">Cancel</Button>
          <Button type="button" variant="primary" @click="save">Save</Button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete setting"
      :description="`Delete “${draft.name}”? This cannot be undone.`"
      @confirm="removeSelected"
    />

    <Dialog v-model:open="nameOpen">
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {{ nameMode === 'rename' ? 'Rename setting' : nameMode === 'duplicate' ? 'Duplicate setting' : 'New setting' }}
          </DialogTitle>
          <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
        </DialogHeader>
        <p class="text-sm">Give this list setting a name.</p>
        <Input v-model="nameDraft" class="h-8" aria-label="Setting name" />
        <DialogFooter>
          <Button type="button" variant="outline" @click="nameOpen = false">Cancel</Button>
          <Button type="button" variant="primary" @click="confirmName">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
