<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus } from '@lucide/vue'

import DataTablePagination from '@/components/DataTablePagination.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { tableActionsCell, tableActionsHead } from '@/components/ui/table/chrome'
import DeleteManualVesselDialog from '@/features/vessel-schedule/DeleteManualVesselDialog.vue'
import TemporaryVesselDialog from '@/features/vessel-schedule/TemporaryVesselDialog.vue'
import TemporaryMark from '@/features/vessel-schedule/TemporaryMark.vue'
import { brandFromVoyage } from '@/domain/lara-brand'
import { isLaraLinkSource, temporaryLinkStatusLabel } from '@/features/vessel-schedule/lara-link'
import { temporaryLinkKey } from '@/features/vessel-schedule/temporary-link'
import { formatDateTime } from '@/lib/vessel-utils'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

const store = useVesselStore()
const deleteTarget = ref<VesselRecord | null>(null)
const editorOpen = ref(false)
const editorId = ref<string | null>(null)
const pageIndex = ref(0)
const pageSize = ref(20)

const rows = computed(() => store.vessels.filter((vessel) => vessel.createdManually))
const pageCount = computed(() => Math.ceil(rows.value.length / pageSize.value))
const pagedRows = computed(() => {
  const start = pageIndex.value * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

watch(pageCount, (count) => {
  if (pageIndex.value > 0 && pageIndex.value >= count) pageIndex.value = Math.max(count - 1, 0)
})

const duplicateKeys = computed(() => {
  const counts = new Map<string, number>()
  for (const vessel of rows.value) {
    if (isLaraLinkSource(vessel)) continue
    const key = temporaryLinkKey(vessel)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.values()].some((count) => count > 1)
})

function textOrDash(value: string) {
  return value.trim() || '—'
}

function createdMeta(vessel: VesselRecord) {
  const first = [...vessel.activityLog].sort((left, right) => left.at.localeCompare(right.at))[0]
  return {
    by: first?.user || '—',
    at: first?.at ? formatDateTime(first.at) : '—',
  }
}

function openNew() {
  editorId.value = null
  editorOpen.value = true
}

function openEdit(vessel: VesselRecord) {
  editorId.value = vessel.id
  editorOpen.value = true
}
</script>

<template>
  <div class="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-hidden py-4">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <PageBreadcrumb :items="[{ label: 'Temporary vessel' }]" />
      <Button type="button" variant="primary" @click="openNew">
        <Plus class="size-3.5" /> Add vessel
      </Button>
    </div>
    <p class="shrink-0 text-sm text-muted-foreground">
      Schedules added before LARA has the voyage. Unlinked rows also appear in vessel schedule search.
    </p>

    <p v-if="duplicateKeys" class="shrink-0 text-sm text-amber-800">
      Two unlinked temporary vessels share the same voyage, point code, pool location, and visit no. They stay unlinked until only one remains.
    </p>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border">
      <div class="min-h-0 flex-1 overflow-auto">
      <Table :scrollable="false" class="min-w-max">
        <TableHeader pinned>
          <TableRow>
            <TableHead>Vessel name</TableHead>
            <TableHead>Voyage</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Point code</TableHead>
            <TableHead>Pool location</TableHead>
            <TableHead>Visit no</TableHead>
            <TableHead>Vessel type</TableHead>
            <TableHead>Voyage status</TableHead>
            <TableHead>ETA</TableHead>
            <TableHead>ETB</TableHead>
            <TableHead>ETD</TableHead>
            <TableHead>Remark</TableHead>
            <TableHead>Link status</TableHead>
            <TableHead>Created by</TableHead>
            <TableHead>Created time</TableHead>
            <TableHead :class="tableActionsHead">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="vessel in pagedRows" :key="vessel.id" class="group">
            <TableCell>{{ vessel.vesselName }}</TableCell>
            <TableCell>
              <span class="inline-flex items-center gap-1.5">
                <span>{{ vessel.laraVoyage }}</span>
                <TemporaryMark />
              </span>
            </TableCell>
            <TableCell>{{ textOrDash(brandFromVoyage(vessel.laraVoyage) || vessel.brand || '') }}</TableCell>
            <TableCell>{{ textOrDash(vessel.service) }}</TableCell>
            <TableCell>{{ vessel.pointCode }}</TableCell>
            <TableCell>{{ textOrDash(vessel.laraPoolLocation) }}</TableCell>
            <TableCell>{{ textOrDash(vessel.visitNo) }}</TableCell>
            <TableCell>{{ textOrDash(vessel.vesselTypeLabel) }}</TableCell>
            <TableCell>{{ vessel.omit || vessel.voyageStatus === 'Omit' ? 'omit' : '—' }}</TableCell>
            <TableCell>{{ vessel.laraEta ? formatDateTime(vessel.laraEta) : '—' }}</TableCell>
            <TableCell>{{ vessel.laraEtb ? formatDateTime(vessel.laraEtb) : '—' }}</TableCell>
            <TableCell>{{ vessel.laraEtd ? formatDateTime(vessel.laraEtd) : '—' }}</TableCell>
            <TableCell>{{ textOrDash(vessel.remark) }}</TableCell>
            <TableCell><StatusBadge :status="temporaryLinkStatusLabel(vessel)" /></TableCell>
            <TableCell>{{ createdMeta(vessel).by }}</TableCell>
            <TableCell>{{ createdMeta(vessel).at }}</TableCell>
            <TableCell :class="tableActionsCell">
              <div class="flex justify-end gap-1">
                <Button
                  v-if="!isLaraLinkSource(vessel)"
                  type="button"
                  size="xs"
                  variant="outline"
                  @click="openEdit(vessel)"
                >
                  Edit
                </Button>
                <Button
                  v-if="!isLaraLinkSource(vessel)"
                  type="button"
                  size="xs"
                  variant="destructive"
                  @click="deleteTarget = vessel"
                >
                  Delete
                </Button>
              </div>
            </TableCell>
          </TableRow>
          <TableRow v-if="!rows.length">
            <TableCell colspan="16" class="text-muted-foreground">No temporary vessels.</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      </div>
    </div>
    <DataTablePagination
      class="shrink-0"
      :total="rows.length"
      :page-index="pageIndex"
      :page-size="pageSize"
      :page-count="pageCount"
      @update:page-index="pageIndex = $event"
      @update:page-size="pageSize = $event; pageIndex = 0"
    />

    <TemporaryVesselDialog
      :open="editorOpen"
      :vessel-id="editorId"
      @update:open="(open) => { editorOpen = open; if (!open) editorId = null }"
    />

    <DeleteManualVesselDialog
      :open="Boolean(deleteTarget)"
      :vessel="deleteTarget"
      @update:open="(open) => { if (!open) deleteTarget = null }"
      @deleted="deleteTarget = null"
    />
  </div>
</template>
