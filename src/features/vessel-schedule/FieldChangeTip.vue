<script setup lang="ts">
import { computed } from 'vue'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'

import { fieldChangeLogs, SEARCH_COLUMNS } from '@/features/vessel-search/search-columns'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/vessel-utils'
import type { ScheduleActivityLog, VesselRecord } from '@/types/vsp'

const props = defineProps<{
  vessel: VesselRecord
  columnId: string
  class?: string
}>()

const kind = computed(() => SEARCH_COLUMNS.find((column) => column.id === props.columnId)?.kind)

const changes = computed(() => fieldChangeLogs(props.vessel, props.columnId))

function side(log: ScheduleActivityLog, which: 'from' | 'to') {
  const match = Boolean(log.originalMatchResult || log.updatedMatchResult)
  const raw = which === 'from'
    ? (match ? log.originalMatchResult : log.originalValue)
    : (match ? log.updatedMatchResult : log.updatedValue)
  const text = raw.trim()
  if (!text) return '—'
  return kind.value === 'datetime' ? formatDateTime(text) : text
}
</script>

<template>
  <TooltipProvider v-if="changes.length" :delay-duration="200">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <span
          tabindex="0"
          :class="cn('underline decoration-dotted underline-offset-2', props.class)"
        >
          <slot />
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="top"
          :side-offset="6"
          class="z-50 flex w-72 max-w-(--reka-tooltip-content-available-width) flex-col gap-2 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <p class="text-xs font-medium text-muted-foreground">Changes</p>
          <ul class="max-h-48 space-y-2 overflow-y-auto">
            <li v-for="log in changes" :key="log.id">
              <p>{{ side(log, 'from') }} → {{ side(log, 'to') }}</p>
              <p class="text-xs text-muted-foreground">{{ log.updatedBy }} · {{ formatDateTime(log.updatedTime) }}</p>
            </li>
          </ul>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
  <slot v-else />
</template>
