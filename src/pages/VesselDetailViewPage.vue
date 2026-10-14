<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DataSection from '@/components/DataSection.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import ReadonlyField from '@/components/ReadonlyField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import VesselAdjustMenu from '@/features/vessel-schedule/VesselAdjustMenu.vue'
import { type ScheduleQuickAction } from '@/features/vessel-schedule/mismatch-actions'
import VesselQuickActions from '@/features/vessel-schedule/VesselQuickActions.vue'
import {
  SEARCH_COLUMNS,
  columnHasHistory,
  isWarningCellText,
  manualOverrideFor,
  searchCellText,
  type ColumnSource,
} from '@/features/vessel-search/search-columns'
import { formatDateTime } from '@/lib/vessel-utils'
import { useVesselStore } from '@/stores/vessels'

const STATUS_COLUMNS = new Set(['mappingStatus', 'voyageStatus', 'tmlVslStatus'])

const route = useRoute()
const router = useRouter()
const store = useVesselStore()
const vessel = computed(() => store.byId(String(route.params.id)))
const quickAction = ref<ScheduleQuickAction | null>(null)
const linkTarget = computed(() => {
  const id = vessel.value?.laraLinkTargetId
  return id ? store.byId(id) : undefined
})
const linkSource = computed(() => {
  const id = vessel.value?.laraLinkSourceId
  return id ? store.byId(id) : undefined
})

function onVesselDeleted() {
  quickAction.value = null
  router.push('/search')
}

const platformColumns = computed(() => SEARCH_COLUMNS.filter((column) => column.source === 'platform'))
const panes = computed(() => [
  { source: 'lara' as ColumnSource, title: 'LARA', columns: SEARCH_COLUMNS.filter((column) => column.source === 'lara') },
  { source: 'terminal' as ColumnSource, title: 'Terminal', columns: SEARCH_COLUMNS.filter((column) => column.source === 'terminal') },
])

function openHistory(fieldId?: string) {
  const current = vessel.value
  if (!current) return
  void router.push({
    path: `/vessels/${current.id}/activity-log`,
    query: fieldId ? { field: fieldId } : {},
  })
}

function openVessel(id: string) {
  void router.push(`/vessels/${id}/view`)
}

function targetLaraText(columnId: string) {
  const current = vessel.value
  const target = linkTarget.value
  if (!current || !target) return ''
  const sourceText = searchCellText(current, columnId)
  const other = searchCellText(target, columnId)
  return sourceText === other ? '' : other
}

function fieldTone(columnId: string, source: ColumnSource) {
  const current = vessel.value
  if (!current) return undefined
  if (isWarningCellText(searchCellText(current, columnId), columnId)) return 'text-amber-800'
  if (source === 'lara' && targetLaraText(columnId)) return 'text-amber-800'
  return undefined
}

function sourceText(columnId: string) {
  const current = vessel.value
  if (!current) return ''
  const override = manualOverrideFor(current, columnId)
  if (!override?.source) return ''
  const column = SEARCH_COLUMNS.find((item) => item.id === columnId)
  return column?.kind === 'datetime' ? formatDateTime(override.source) : override.source
}
</script>

<template>
  <div v-if="vessel" class="space-y-4">
    <PageBreadcrumb
      :items="[
        { label: 'Vessel schedule search', to: '/search' },
        { label: vessel.vesselName },
      ]"
    />
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">{{ vessel.vesselName }}</h1>
        <p class="text-sm text-muted-foreground">{{ vessel.pointCode }} · {{ vessel.laraVoyage }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button v-if="linkTarget" type="button" variant="outline" @click="openVessel(linkTarget.id)">
          Target LARA data
        </Button>
        <Button v-if="linkSource" type="button" variant="outline" @click="openVessel(linkSource.id)">
          Source LARA data
        </Button>
        <VesselAdjustMenu :vessel="vessel" size="default" @pick="quickAction = $event" />
        <Button type="button" variant="outline" @click="openHistory()">Activity logs</Button>
      </div>
    </div>

    <dl class="grid sm:grid-cols-2 sm:gap-x-6">
      <ReadonlyField v-for="column in platformColumns" :key="column.id" :label="column.label">
        <button
          v-if="column.id === 'laraLink' && vessel.laraLinkTargetId && searchCellText(vessel, column.id) !== '—'"
          type="button"
          class="text-left text-primary underline underline-offset-2"
          @click="openVessel(vessel.laraLinkTargetId)"
        >
          {{ searchCellText(vessel, column.id) }}
        </button>
        <button
          v-else-if="columnHasHistory(vessel, column.id)"
          type="button"
          class="text-left underline decoration-dotted underline-offset-2"
          :class="isWarningCellText(searchCellText(vessel, column.id), column.id) ? 'text-amber-800' : 'text-primary'"
          @click="openHistory(column.id)"
        >
          <StatusBadge v-if="STATUS_COLUMNS.has(column.id)" :status="searchCellText(vessel, column.id)" />
          <template v-else>{{ searchCellText(vessel, column.id) }}</template>
        </button>
        <StatusBadge v-else-if="STATUS_COLUMNS.has(column.id)" :status="searchCellText(vessel, column.id)" />
        <span
          v-else
          :class="isWarningCellText(searchCellText(vessel, column.id), column.id) ? 'text-amber-800' : undefined"
        >
          {{ searchCellText(vessel, column.id) }}
        </span>
        <span
          v-if="column.id === 'mappingStatus'
            && vessel.matchingStatus === 'Multiple terminal records'
            && vessel.terminalCandidates.length"
          class="ml-2 text-xs text-muted-foreground"
        >
          {{ vessel.terminalCandidates.length }} candidates
        </span>
      </ReadonlyField>
    </dl>

    <div class="grid items-start gap-6 lg:grid-cols-2 lg:gap-x-8">
      <DataSection v-for="pane in panes" :key="pane.source" :title="pane.title">
        <template v-if="pane.source === 'terminal' && vessel.terminalSource === 'manual'" #title>
          <h2 class="text-sm font-medium">
            {{ pane.title }}
            <span class="mt-1 block text-sm font-normal text-muted-foreground">
              Entered manually
            </span>
          </h2>
        </template>
        <dl>
          <ReadonlyField
            v-for="column in pane.columns"
            :key="column.id"
            layout="row"
            :label="column.label"
          >
            <button
              v-if="columnHasHistory(vessel, column.id)"
              type="button"
              class="text-left underline decoration-dotted underline-offset-2"
              :class="fieldTone(column.id, pane.source) ?? 'text-primary'"
              @click="openHistory(column.id)"
            >
              <StatusBadge v-if="STATUS_COLUMNS.has(column.id)" :status="searchCellText(vessel, column.id)" />
              <template v-else>{{ searchCellText(vessel, column.id) }}</template>
            </button>
            <StatusBadge v-else-if="STATUS_COLUMNS.has(column.id)" :status="searchCellText(vessel, column.id)" />
            <span v-else :class="fieldTone(column.id, pane.source)">
              {{ searchCellText(vessel, column.id) }}
            </span>
            <p v-if="pane.source === 'lara' && targetLaraText(column.id)" class="text-xs text-amber-800">
              Target {{ targetLaraText(column.id) }}
            </p>
            <p v-if="sourceText(column.id)" class="text-xs text-muted-foreground">Source {{ sourceText(column.id) }}</p>
          </ReadonlyField>
        </dl>
      </DataSection>
    </div>

    <VesselQuickActions
      :vessel="vessel ?? null"
      :action="quickAction"
      @close="quickAction = null"
      @deleted="onVesselDeleted"
    />
  </div>
  <Alert v-else variant="warning">
    <AlertDescription>This schedule record is no longer available.</AlertDescription>
  </Alert>
</template>
