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
import SyncFieldAlert from '@/features/vessel-schedule/SyncFieldAlert.vue'
import { reviewForColumn } from '@/features/vessel-schedule/sync-columns'
import { syncCellKey, syncPendingKey, showsUnsettledDash } from '@/features/vessel-schedule/sync-review'
import { mappingAlertVariant, mappingHeaderAlert } from '@/features/vessel-schedule/mapping-header'
import SchedulePlatformFields from '@/features/vessel-schedule/SchedulePlatformFields.vue'
import ScheduleRecordHeading from '@/features/vessel-schedule/ScheduleRecordHeading.vue'
import VesselAdjustMenu from '@/features/vessel-schedule/VesselAdjustMenu.vue'
import { type ScheduleQuickAction } from '@/features/vessel-schedule/mismatch-actions'
import VesselQuickActions from '@/features/vessel-schedule/VesselQuickActions.vue'
import {
  SEARCH_COLUMNS,
  isPortApiCovered,
  isWarningCellText,
  manualOverrideFor,
  searchCellText,
  type ColumnSource,
} from '@/features/vessel-search/search-columns'
import { formatDateTime } from '@/lib/vessel-utils'
import { useListSettingsStore } from '@/stores/list-settings'
import { useScheduleStore } from '@/stores/schedule'
import { useVesselStore } from '@/stores/vessels'

const STATUS_COLUMNS = new Set(['mappingStatus', 'lastSyncStatus'])

const route = useRoute()
const router = useRouter()
const store = useVesselStore()
const schedule = useScheduleStore()
const listSettings = useListSettingsStore()

provide(syncCellKey, (scheduleId, columnId) => {
  const watched = listSettings.active?.watchedFields ?? []
  if (!watched.includes(columnId)) return null
  const field = reviewForColumn(schedule.review(scheduleId).fields, columnId)
  if (!field) return null
  return { field }
})
provide(syncPendingKey, (scheduleId) => schedule.review(scheduleId).changed)
const vessel = computed(() => store.byId(String(route.params.id)))
const quickAction = ref<ScheduleQuickAction | null>(null)

const headerAlert = computed(() => {
  const current = vessel.value
  if (!current) return null
  const review = schedule.review(current.id)
  const matchField = review.fields.find((item) => item.side === 'MATCH')
  return mappingHeaderAlert(current, {
    shape: review.shape,
    candidateCount: review.candidateCount,
    previousStatus: matchField?.previousValue,
  })
})
const remarkAlertVariant = computed(() => (
  vessel.value ? mappingAlertVariant(vessel.value.matchingStatus) : 'info'
))
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

function cellText(columnId: string) {
  const current = vessel.value
  if (!current) return ''
  if (showsUnsettledDash(current.matchingStatus, columnId)) return '—'
  return searchCellText(current, columnId)
}

function fieldTone(columnId: string) {
  const current = vessel.value
  if (!current) return undefined
  if (isWarningCellText(cellText(columnId), columnId)) return 'text-amber-800'
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
        <VesselAdjustMenu :vessel="vessel" size="default" @pick="quickAction = $event" />
        <Button type="button" variant="outline" @click="openHistory()">Activity logs</Button>
      </div>
    </div>
    <ScheduleRecordHeading :vessel="vessel" />
    <SchedulePlatformFields :vessel="vessel" />

    <Alert v-if="headerAlert" :variant="headerAlert.variant">
      <AlertTitle>{{ headerAlert.title }}</AlertTitle>
      <AlertDescription>
        <p v-if="vessel.remark">{{ vessel.remark }}</p>
        <p :class="vessel.remark ? 'mt-1' : undefined">{{ headerAlert.text }}</p>
      </AlertDescription>
    </Alert>
    <Alert v-else-if="vessel.remark" :variant="remarkAlertVariant === 'success' ? 'info' : remarkAlertVariant">
      <AlertDescription>{{ vessel.remark }}</AlertDescription>
    </Alert>

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
              <StatusBadge v-if="STATUS_COLUMNS.has(column.id)" :status="cellText(column.id)" />
              <span v-else :class="fieldTone(column.id)">
                {{ cellText(column.id) }}
              </span>
              <CoverageIcon v-if="column.id === 'pointCode'" :covered="isPortApiCovered(vessel)" />
              <SyncFieldAlert v-if="!showsUnsettledDash(vessel.matchingStatus, column.id)" :schedule-id="vessel.id" :column-id="column.id" />
            </span>
            <p v-if="sourceText(column.id) && !showsUnsettledDash(vessel.matchingStatus, column.id)" class="text-xs text-muted-foreground">Source {{ sourceText(column.id) }}</p>
          </ReadonlyField>
        </dl>
      </DataSection>
    </div>

    <VesselQuickActions
      :vessel="vessel ?? null"
      :action="quickAction"
      @close="quickAction = null"
    />
  </div>
  <Alert v-else variant="warning">
    <AlertDescription>This schedule record is no longer available.</AlertDescription>
  </Alert>
</template>
