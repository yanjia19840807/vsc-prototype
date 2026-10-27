<script setup lang="ts">
import { computed, inject } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'

import { syncCellKey } from '@/features/vessel-schedule/sync-review'
import { SEARCH_COLUMNS } from '@/features/vessel-search/search-columns'
import { formatDateTime } from '@/lib/vessel-utils'

const props = defineProps<{
  scheduleId: string
  columnId: string
}>()

const lookup = inject(syncCellKey, null)
const info = computed(() => lookup?.(props.scheduleId, props.columnId) ?? null)
const pending = computed(() => info.value?.field.status === 'pending')

const mapping = computed(() => props.columnId === 'mappingStatus')

const rows = computed(() => {
  const field = info.value?.field
  if (!field) return []
  if (mapping.value) {
    return [
      { label: 'Previous', value: display(field.previousValue) },
      { label: 'This sync', value: display(field.incomingValue) },
    ]
  }
  return pending.value
    ? [
        { label: 'Current', value: display(field.previousValue) },
        { label: 'Latest', value: display(field.incomingValue) },
      ]
    : [
        { label: 'Previous', value: display(field.previousValue) },
        { label: 'Applied', value: display(field.incomingValue) },
      ]
})

function display(value: string) {
  if (!value) return '—'
  const kind = SEARCH_COLUMNS.find((column) => column.id === props.columnId)?.kind
  return kind === 'datetime' ? formatDateTime(value) : value
}
</script>

<template>
  <TooltipProvider v-if="info" :delay-duration="200">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="inline-flex size-5 items-center justify-center rounded-sm"
          :class="pending ? 'text-amber-700' : 'text-sky-700'"
          :aria-label="pending ? 'Sync change waiting for confirmation' : 'Sync change'"
          @click.stop
        >
          <TriangleAlert class="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="bottom"
          :side-offset="6"
          class="z-50 w-72 max-w-(--reka-tooltip-content-available-width) rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <p class="mb-2 font-medium">{{ pending ? 'Waiting for confirmation' : 'Applied this sync' }}</p>
          <table class="w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr class="text-xs text-muted-foreground">
                <th class="border-b pb-1 pr-3 font-medium" scope="col" />
                <th class="border-b pb-1 font-medium" scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="row.label">
                <th class="py-1.5 pr-3 font-medium text-muted-foreground" :class="index === 0 ? 'border-b' : ''" scope="row">{{ row.label }}</th>
                <td class="py-1.5" :class="index === 0 ? 'border-b' : ''">{{ row.value }}</td>
              </tr>
            </tbody>
          </table>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
