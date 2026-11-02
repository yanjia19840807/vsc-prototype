<script setup lang="ts">
import { computed, ref } from 'vue'

import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CANDIDATE_COLUMN_DEFS } from '@/features/vessel-schedule/mismatch-fields'
import { WIDE_DIALOG_CLASS } from '@/features/vessel-schedule/wide-dialog'
import { formatDateTime } from '@/lib/vessel-utils'
import { useScheduleStore } from '@/stores/schedule'
import type { TerminalPayload } from '@/domain/schedule-model'
import type { VesselRecord } from '@/types/vsc'

const props = defineProps<{
  vessel: VesselRecord
}>()

const schedule = useScheduleStore()
const detailOpen = ref(false)

const query = computed(() => schedule.returnedQuery(props.vessel.id))
const modification = computed(() => schedule.userModification(props.vessel.id))

const recordColumns = [
  { id: 'vesselOperator', label: 'Vessel operator', kind: 'text' as const },
  ...CANDIDATE_COLUMN_DEFS,
]

function payloadCell(payload: TerminalPayload, columnId: string) {
  const raw: Record<string, string> = {
    vesselOperator: payload.vesselOperator,
    evoyage: payload.exportVoyage,
    ivoyage: payload.importVoyage,
    vesselNameCn: payload.vesselNameCn,
    terminal: payload.terminalName,
    status: payload.vesselStatus,
    eta: payload.eta,
    ata: payload.ata,
    etb: payload.etb,
    atb: payload.atb,
    etd: payload.etd,
    atd: payload.atd,
    cyOpen: payload.cyOpen,
    cyClosing: payload.cyCutoff,
    updateTime: payload.updateTime,
  }
  const value = raw[columnId] ?? ''
  if (!value) return '—'
  const column = recordColumns.find((item) => item.id === columnId)
  return column?.kind === 'datetime' ? formatDateTime(value) : value
}
</script>

<template>
  <dl>
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b py-2 text-sm">
      <div class="flex items-center gap-2">
        <dt class="text-muted-foreground">Last mapping status</dt>
        <dd>
          <StatusBadge v-if="query" :status="query.status" />
          <template v-else>—</template>
        </dd>
        <Button v-if="query" type="button" size="xs" variant="link" class="h-auto px-0" @click="detailOpen = true">Detail</Button>
      </div>
      <div class="flex items-center gap-2">
        <dt class="text-muted-foreground">Last mapping time</dt>
        <dd>{{ query ? formatDateTime(query.requestedAt) : '—' }}</dd>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b py-2 text-sm">
      <div class="flex items-center gap-2">
        <dt class="text-muted-foreground">Last modified by</dt>
        <dd>{{ modification?.by ?? '—' }}</dd>
      </div>
      <div class="flex items-center gap-2">
        <dt class="text-muted-foreground">Last modified at</dt>
        <dd>{{ modification ? formatDateTime(modification.at) : '—' }}</dd>
      </div>
    </div>
  </dl>

  <Dialog v-if="query" :open="detailOpen" @update:open="detailOpen = $event">
    <DialogContent size="2xl" :class="WIDE_DIALOG_CLASS">
      <DialogHeader>
        <DialogTitle>Last mapping</DialogTitle>
        <DialogDescription>The latest mapping query and the records it returned.</DialogDescription>
      </DialogHeader>
      <dl class="grid gap-2 sm:grid-cols-2">
        <div>
          <dt class="text-muted-foreground">Status</dt>
          <dd class="mt-1"><StatusBadge :status="query.status" /></dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Requested at</dt>
          <dd class="mt-1">{{ formatDateTime(query.requestedAt) }}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Responded at</dt>
          <dd class="mt-1">{{ formatDateTime(query.respondedAt ?? '') }}</dd>
        </div>
        <div v-if="query.failureReason">
          <dt class="text-muted-foreground">Failure reason</dt>
          <dd class="mt-1">{{ query.failureReason }}</dd>
        </div>
      </dl>
      <div class="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead v-for="column in recordColumns" :key="column.id" class="whitespace-nowrap">
                {{ column.label }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="payload in query.payloads" :key="payload.id">
              <TableCell v-for="column in recordColumns" :key="column.id" class="whitespace-nowrap">
                {{ payloadCell(payload, column.id) }}
              </TableCell>
            </TableRow>
            <TableEmpty v-if="!query.payloads.length" :colspan="recordColumns.length" />
          </TableBody>
        </Table>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" @click="detailOpen = false">Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
