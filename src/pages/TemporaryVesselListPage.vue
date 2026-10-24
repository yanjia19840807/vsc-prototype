<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
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
import DeleteManualVesselDialog from '@/features/vessel-schedule/DeleteManualVesselDialog.vue'
import TemporaryMark from '@/features/vessel-schedule/TemporaryMark.vue'
import { brandFromVoyage } from '@/domain/lara-brand'
import { isLaraLinkSource } from '@/features/vessel-schedule/lara-link'
import { temporaryLinkKey } from '@/features/vessel-schedule/temporary-link'
import { formatDateTime } from '@/lib/vessel-utils'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

const store = useVesselStore()
const router = useRouter()
const deleteTarget = ref<VesselRecord | null>(null)
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

function linkLabel(vessel: VesselRecord) {
  return isLaraLinkSource(vessel) ? 'Linked' : 'Unlink'
}

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
  void router.push('/temporary-vessels/new')
}

function openEdit(vessel: VesselRecord) {
  void router.push(`/temporary-vessels/${vessel.id}`)
}

function openView(vessel: VesselRecord) {
  void router.push(`/vessels/${vessel.id}/view`)
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <PageBreadcrumb :items="[{ label: 'Temporary vessel' }]" />
        <h1 class="text-xl font-semibold">Temporary vessel</h1>
        <p class="text-sm text-muted-foreground">
          Schedules added before LARA has the voyage. Unlinked rows also appear in vessel schedule search.
        </p>
      </div>
      <Button type="button" variant="primary" @click="openNew">
        <Plus class="size-3.5" /> Add vessel
      </Button>
    </div>

    <p v-if="duplicateKeys" class="text-sm text-amber-800">
      Two unlinked temporary vessels share the same voyage, point code, pool location, and visit no. They stay unlinked until only one remains.
    </p>

    <div class="min-h-0 flex-1 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
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
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="vessel in pagedRows" :key="vessel.id">
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
            <TableCell>{{ vessel.omit || vessel.voyageStatus === 'Omit' ? 'omit' : vessel.voyageStatus }}</TableCell>
            <TableCell>{{ vessel.laraEta ? formatDateTime(vessel.laraEta) : '—' }}</TableCell>
            <TableCell>{{ vessel.laraEtb ? formatDateTime(vessel.laraEtb) : '—' }}</TableCell>
            <TableCell>{{ vessel.laraEtd ? formatDateTime(vessel.laraEtd) : '—' }}</TableCell>
            <TableCell>{{ textOrDash(vessel.remark) }}</TableCell>
            <TableCell><StatusBadge :status="linkLabel(vessel)" /></TableCell>
            <TableCell>{{ createdMeta(vessel).by }}</TableCell>
            <TableCell>{{ createdMeta(vessel).at }}</TableCell>
            <TableCell>
              <div class="flex justify-end gap-1">
                <Button type="button" size="xs" variant="outline" @click="openView(vessel)">View</Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  :disabled="isLaraLinkSource(vessel)"
                  @click="openEdit(vessel)"
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  :disabled="isLaraLinkSource(vessel)"
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
    <DataTablePagination
      :total="rows.length"
      :page-index="pageIndex"
      :page-size="pageSize"
      :page-count="pageCount"
      @update:page-index="pageIndex = $event"
      @update:page-size="pageSize = $event; pageIndex = 0"
    />

    <DeleteManualVesselDialog
      :open="Boolean(deleteTarget)"
      :vessel="deleteTarget"
      @update:open="(open) => { if (!open) deleteTarget = null }"
      @deleted="deleteTarget = null"
    />
  </div>
</template>
