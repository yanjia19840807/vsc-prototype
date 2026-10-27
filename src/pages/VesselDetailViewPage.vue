<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DataSection from '@/components/DataSection.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import ReadonlyField from '@/components/ReadonlyField.vue'
import CoverageIcon from '@/components/CoverageIcon.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import FieldChangeTip from '@/features/vessel-schedule/FieldChangeTip.vue'
import SyncFieldAlert from '@/features/vessel-schedule/SyncFieldAlert.vue'
import { reviewForColumn } from '@/features/vessel-schedule/sync-columns'
import { syncCellKey, syncPendingKey } from '@/features/vessel-schedule/sync-review'
import { vesselDetailPath } from '@/features/vessel-schedule/lara-link'
import { mappingHeaderAlert } from '@/features/vessel-schedule/mapping-header'
import ScheduleRecordHeading from '@/features/vessel-schedule/ScheduleRecordHeading.vue'
import VesselAdjustMenu from '@/features/vessel-schedule/VesselAdjustMenu.vue'
import { type ScheduleQuickAction } from '@/features/vessel-schedule/mismatch-actions'
import VesselQuickActions from '@/features/vessel-schedule/VesselQuickActions.vue'
import {
  SEARCH_COLUMNS,
  isPortApiCovered,
  columnHasHistory,
  isWarningCellText,
  manualOverrideFor,
  searchCellText,
  sharedLaraRemark,
  type ColumnSource,
} from '@/features/vessel-search/search-columns'
import { formatDateTime } from '@/lib/vessel-utils'
import { useListSettingsStore } from '@/stores/list-settings'
import { useScheduleStore } from '@/stores/schedule'
import { useVesselStore } from '@/stores/vessels'

const STATUS_COLUMNS = new Set(['mappingStatus'])

const SOURCE_FIELDS = [
  { id: 'vesselName', label: 'Vessel name' },
  { id: 'laraVoyage', label: 'Voyage' },
  { id: 'pointCode', label: 'Point code' },
  { id: 'laraPoolLocation', label: 'Pool location' },
  { id: 'mappingStatus', label: 'Matching status' },
  { id: 'localVoyageExport', label: 'Terminal voyage' },
  { id: 'terminalEtd', label: 'Terminal ETD' },
] as const

const route = useRoute()
const router = useRouter()
const store = useVesselStore()
const schedule = useScheduleStore()
const listSettings = useListSettingsStore()

provide(syncCellKey, (scheduleId, columnId) => {
  const watched = listSettings.active?.watchedFields ?? []
  if (!watched.includes(columnId)) return null
  const field = reviewForColumn(schedule.review(scheduleId).fields, columnId)
  if (!field || field.status !== 'pending') return null
  return { field }
})
provide(syncPendingKey, (scheduleId) => schedule.review(scheduleId).pending)
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

const platformColumns = computed(() =>
  SEARCH_COLUMNS.filter((column) => column.source === 'platform' && column.id !== 'mappingStatus'),
)
const headerAlert = computed(() => {
  const current = vessel.value
  if (!current) return null
  const review = schedule.review(current.id)
  return mappingHeaderAlert(current, { shape: review.shape, candidateCount: review.candidateCount })
})
const mappingAlert = computed(() => {
  const current = vessel.value
  if (!current) return null
  const review = schedule.review(current.id)
  if (review.shape) return null
  const field = review.fields.find((item) => item.side === 'MATCH' && item.status === 'pending')
  if (!field) return null
  return {
    variant: 'warning' as const,
    title: 'Mapping status',
    text: `${field.previousValue || '—'} → ${field.incomingValue || '—'}`,
  }
})
const panes = computed(() => [
  { source: 'lara' as ColumnSource, title: 'LARA', columns: SEARCH_COLUMNS.filter((column) => column.source === 'lara' && column.id !== 'voyageStatus') },
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
  const row = store.byId(id)
  void router.push(row ? vesselDetailPath(row) : `/vessels/${id}/view`)
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
    <div class="flex flex-wrap items-center justify-between gap-3">
      <PageBreadcrumb
        :items="[
          { label: 'Vessel schedule search', to: '/search' },
          { label: vessel.vesselName },
        ]"
      />
      <div class="flex flex-wrap items-center gap-2">
        <Button v-if="linkTarget && !vessel.createdManually" type="button" variant="outline" @click="openVessel(linkTarget.id)">
          Active LARA record
        </Button>
        <VesselAdjustMenu :vessel="vessel" size="default" @pick="quickAction = $event" />
        <Button type="button" variant="outline" @click="openHistory()">Activity logs</Button>
      </div>
    </div>
    <ScheduleRecordHeading :vessel="vessel" />

    <Alert v-if="headerAlert" :variant="headerAlert.variant">
      <AlertTitle>{{ headerAlert.title }}</AlertTitle>
      <AlertDescription>{{ headerAlert.text }}</AlertDescription>
    </Alert>

    <Alert v-if="mappingAlert" :variant="mappingAlert.variant">
      <AlertTitle>{{ mappingAlert.title }}</AlertTitle>
      <AlertDescription>{{ mappingAlert.text }}</AlertDescription>
    </Alert>

    <Alert v-if="vessel.createdManually && (vessel.laraLinked || vessel.laraLinkTargetId)">
      <AlertDescription>
        This temporary vessel is linked. It stays out of vessel schedule search, and later sync is recorded on the formal schedule.
      </AlertDescription>
    </Alert>

    <DataSection v-if="linkSource" title="Original source">
      <p class="mb-3 text-sm text-muted-foreground">
        Linked temporary vessel kept for reference.
      </p>
      <dl class="grid sm:grid-cols-2 sm:gap-x-6">
        <ReadonlyField v-for="column in SOURCE_FIELDS" :key="column.id" :label="column.label">
          <StatusBadge v-if="column.id === 'mappingStatus'" :status="searchCellText(linkSource, column.id)" />
          <span v-else>{{ searchCellText(linkSource, column.id) }}</span>
        </ReadonlyField>
      </dl>
      <Button type="button" variant="outline" class="mt-3" @click="openVessel(linkSource.id)">
        Open original record
      </Button>
    </DataSection>

    <dl v-if="platformColumns.length" class="grid sm:grid-cols-2 sm:gap-x-6">
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
          v-else-if="column.id === 'laraLink' && vessel.laraLinkSourceId && searchCellText(vessel, column.id) !== '—'"
          type="button"
          class="text-left text-primary underline underline-offset-2"
          @click="openVessel(vessel.laraLinkSourceId)"
        >
          {{ searchCellText(vessel, column.id) }}
        </button>
        <FieldChangeTip
          v-else-if="columnHasHistory(vessel, column.id)"
          :vessel="vessel"
          :column-id="column.id"
          :class="isWarningCellText(searchCellText(vessel, column.id), column.id) ? 'text-amber-800' : 'text-primary'"
        >
          <StatusBadge v-if="STATUS_COLUMNS.has(column.id)" :status="searchCellText(vessel, column.id)" />
          <template v-else>{{ searchCellText(vessel, column.id) }}</template>
        </FieldChangeTip>
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
        <span
          v-else-if="column.id === 'mappingStatus' && sharedLaraRemark(vessel.sharedLaraCount)"
          class="ml-2 text-xs text-muted-foreground"
        >
          {{ sharedLaraRemark(vessel.sharedLaraCount) }}
        </span>
        <SyncFieldAlert :schedule-id="vessel.id" :column-id="column.id" />
      </ReadonlyField>
    </dl>

    <div class="grid items-start gap-4 lg:grid-cols-2">
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
            <span class="inline-flex flex-wrap items-center gap-2">
              <FieldChangeTip
                v-if="columnHasHistory(vessel, column.id)"
                :vessel="vessel"
                :column-id="column.id"
                :class="fieldTone(column.id, pane.source) ?? 'text-primary'"
              >
                <StatusBadge v-if="STATUS_COLUMNS.has(column.id)" :status="searchCellText(vessel, column.id)" />
                <template v-else>{{ searchCellText(vessel, column.id) }}</template>
              </FieldChangeTip>
              <StatusBadge v-else-if="STATUS_COLUMNS.has(column.id)" :status="searchCellText(vessel, column.id)" />
              <span v-else :class="fieldTone(column.id, pane.source)">
                {{ searchCellText(vessel, column.id) }}
              </span>
              <CoverageIcon v-if="column.id === 'pointCode'" :covered="isPortApiCovered(vessel)" />
              <SyncFieldAlert :schedule-id="vessel.id" :column-id="column.id" />
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
