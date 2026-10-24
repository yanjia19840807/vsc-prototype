<script setup lang="ts">
import { computed, inject } from 'vue'
import { TriangleAlert } from '@lucide/vue'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { syncCellKey } from '@/features/vessel-schedule/sync-review'

const props = defineProps<{
  callId: string
  columnId: string
}>()

const lookup = inject(syncCellKey, null)
const info = computed(() => lookup?.(props.callId, props.columnId) ?? null)
</script>

<template>
  <Popover v-if="info && columnId !== 'mappingStatus'">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="inline-flex size-5 items-center justify-center rounded-sm"
        :class="info.field.status === 'pending' ? 'text-amber-700' : 'text-sky-700'"
        :aria-label="info.field.status === 'pending' ? 'Sync change waiting for confirmation' : 'Sync change'"
        @click.stop
      >
        <TriangleAlert class="size-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-80" @click.stop>
      <p class="font-medium">{{ info.field.status === 'pending' ? 'Waiting for confirmation' : 'Applied this sync' }}</p>
      <p class="text-muted-foreground">
        {{ info.field.previousValue || '—' }} → {{ info.field.incomingValue || '—' }}
      </p>
    </PopoverContent>
  </Popover>
</template>
