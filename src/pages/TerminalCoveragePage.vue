<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, GripVertical, Plus } from '@lucide/vue'

import { toast } from 'vue-sonner'

import FilterField from '@/components/FilterField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/multi-select'
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
import QueryPanel from '@/components/QueryPanel.vue'
import CoverageIcon from '@/components/CoverageIcon.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import DeletePortDialog from '@/features/terminal-coverage/DeletePortDialog.vue'
import PortCoverageDialog from '@/features/terminal-coverage/PortCoverageDialog.vue'
import RegionsDialog from '@/features/terminal-coverage/RegionsDialog.vue'
import { regionLabel, type PortCoverage } from '@/features/terminal-coverage/model'
import { allPlaceholder } from '@/features/vessel-search/list-setting-model'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'

const store = useTerminalCoverageStore()
const vessels = useVesselStore()

type CoverageQuery = {
  portCode: string
  portName: string
  regions: string[]
  coverage: string
}

function emptyCoverageQuery(): CoverageQuery {
  return { portCode: '', portName: '', regions: [], coverage: '' }
}

const draft = ref(emptyCoverageQuery())
const applied = ref(emptyCoverageQuery())
const filtersOpen = ref(true)
const regionsOpen = ref(false)
const editorOpen = ref(false)
const deleteOpen = ref(false)
const selected = ref<PortCoverage | null>(null)
const portAction = ref<'delete' | 'deactivate'>('delete')
const dragCode = ref<string | null>(null)

const regionOptions = computed(() => store.regions.map((region) => regionLabel(region)))

function portReferenced(portCode: string) {
  return vessels.vessels.some((vessel) => vessel.pointCode === portCode)
}

const rows = computed(() => {
  const portCode = applied.value.portCode.trim().toLowerCase()
  const portName = applied.value.portName.trim().toLowerCase()
  return store.ports.filter((port) => {
    if (applied.value.coverage === 'covered' && !port.apiCovered) return false
    if (applied.value.coverage === 'not-covered' && port.apiCovered) return false
    if (applied.value.regions.length && !applied.value.regions.includes(port.regionCode)) return false
    if (portCode && !port.portCode.toLowerCase().includes(portCode)) return false
    if (portName && !port.portName.toLowerCase().includes(portName)) return false
    return true
  })
})

function terminalSummary(port: PortCoverage) {
  return port.terminals.map((terminal) => terminal.abbr.trim()).filter(Boolean).join(', ')
}

const appliedCount = computed(() => {
  let count = 0
  if (draft.value.portCode.trim()) count += 1
  if (draft.value.portName.trim()) count += 1
  if (draft.value.regions.length) count += 1
  if (draft.value.coverage) count += 1
  return count
})

function regionLabels(codes: string[]) {
  return codes.map((code) => {
    const region = store.regions.find((item) => item.code === code)
    return region ? regionLabel(region) : code
  })
}

function regionCodes(labels: string[]) {
  return labels.map((label) => {
    const region = store.regions.find((item) => regionLabel(item) === label)
    return region?.code ?? label
  })
}

function applyQuery() {
  applied.value = { ...draft.value, regions: [...draft.value.regions] }
}

function clearQuery() {
  draft.value = emptyCoverageQuery()
  applied.value = emptyCoverageQuery()
}

function regionText(port: PortCoverage) {
  return regionLabel(store.regions.find((region) => region.code === port.regionCode)) || '—'
}

function openCreate() {
  selected.value = null
  editorOpen.value = true
}

function openEdit(port: PortCoverage) {
  selected.value = port
  editorOpen.value = true
}

function openPortAction(port: PortCoverage, action: 'delete' | 'deactivate') {
  selected.value = port
  portAction.value = action
  deleteOpen.value = true
}

function activatePort(port: PortCoverage) {
  store.setPortActive(port.portCode, true)
  toast.success('Port activated')
}

function onDrop(portCode: string) {
  if (!dragCode.value) return
  store.move(dragCode.value, portCode)
  dragCode.value = null
}
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-4 py-4">
    <div class="flex flex-wrap items-center justify-end gap-2">
      <Button type="button" variant="outline" @click="regionsOpen = true">Region</Button>
      <Button type="button" variant="primary" @click="openCreate">
        <Plus class="size-3.5" /> Add port
      </Button>
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
      <QueryPanel v-if="filtersOpen" class="pt-3" @search="applyQuery" @clear="clearQuery">
        <FilterField label="Port code">
          <Input v-model="draft.portCode" class="h-8 w-52" aria-label="Port code" />
        </FilterField>
        <FilterField label="Port name">
          <Input v-model="draft.portName" class="h-8 w-52" aria-label="Port name" />
        </FilterField>
        <FilterField label="Region">
          <MultiSelect
            :model-value="regionLabels(draft.regions)"
            :options="regionOptions"
            :placeholder="allPlaceholder('Region')"
            aria-label="Region"
            class="w-[220px]"
            @update:model-value="draft.regions = regionCodes($event)"
          />
        </FilterField>
        <FilterField label="API coverage">
          <Select
            :model-value="draft.coverage || undefined"
            @update:model-value="(value) => (draft.coverage = typeof value === 'string' ? value : '')"
          >
            <SelectTrigger class="h-8 w-[220px]" aria-label="API coverage">
              <SelectValue :placeholder="allPlaceholder('API coverage')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="covered">API covered</SelectItem>
              <SelectItem value="not-covered">Not covered</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </QueryPanel>
    </div>

    <div class="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-10"><span class="sr-only">Reorder</span></TableHead>
            <TableHead>Port code</TableHead>
            <TableHead>Port name</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>API coverage</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Terminals</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="port in rows" :key="port.portCode" @dragover.prevent @drop="onDrop(port.portCode)">
            <TableCell>
              <div class="flex items-center">
                <button
                  type="button"
                  class="flex size-4 cursor-grab items-center justify-center bg-transparent p-0 text-muted-foreground active:cursor-grabbing"
                  draggable="true"
                  :aria-label="`Reorder ${port.portCode}`"
                  @dragstart.stop="dragCode = port.portCode"
                  @dragend="dragCode = null"
                >
                  <GripVertical class="size-4 shrink-0" />
                </button>
              </div>
            </TableCell>
            <TableCell class="font-medium">{{ port.portCode }}</TableCell>
            <TableCell>{{ port.portName }}</TableCell>
            <TableCell>{{ regionText(port) }}</TableCell>
            <TableCell>
              <CoverageIcon :covered="port.apiCovered" />
            </TableCell>
            <TableCell>
              <StatusBadge :status="port.active ? 'Active' : 'Inactive'" />
            </TableCell>
            <TableCell class="whitespace-normal">{{ terminalSummary(port) || '—' }}</TableCell>
            <TableCell>
              <div class="flex items-center gap-1">
                <Button type="button" size="xs" variant="outline" @click="openEdit(port)">Edit</Button>
                <Button
                  v-if="port.active && portReferenced(port.portCode)"
                  type="button"
                  size="xs"
                  variant="outline"
                  @click="openPortAction(port, 'deactivate')"
                >
                  Deactivate
                </Button>
                <Button
                  v-else-if="port.active"
                  type="button"
                  size="xs"
                  variant="destructive"
                  @click="openPortAction(port, 'delete')"
                >
                  Delete
                </Button>
                <Button v-else type="button" size="xs" variant="outline" @click="activatePort(port)">Activate</Button>
              </div>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="!rows.length" :colspan="8">No results.</TableEmpty>
        </TableBody>
      </Table>
    </div>

    <RegionsDialog v-model:open="regionsOpen" />
    <PortCoverageDialog v-model:open="editorOpen" :port="selected" />
    <DeletePortDialog v-model:open="deleteOpen" :port="selected" :mode="portAction" />
  </div>
</template>
