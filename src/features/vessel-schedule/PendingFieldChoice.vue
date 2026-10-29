<script setup lang="ts">
import { Button } from '@/components/ui/button'

defineProps<{
  previous: string
  incoming: string
  choice: 'previous' | 'sync' | null
  /** Show the two values without asking which one to keep. */
  readonly?: boolean
}>()

const emit = defineEmits<{
  choose: [choice: 'previous' | 'sync']
}>()
</script>

<template>
  <div class="flex flex-col gap-1 sm:col-start-2">
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="w-20 shrink-0 text-xs text-muted-foreground">Previous</span>
      <span class="text-sm">{{ previous }}</span>
      <Button
        v-if="!readonly"
        type="button"
        variant="outline"
        size="xs"
        :aria-pressed="choice === 'previous'"
        :class="choice === 'previous' ? 'border-foreground' : undefined"
        @click="emit('choose', 'previous')"
      >
        Keep previous
      </Button>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="w-20 shrink-0 text-xs text-muted-foreground">This sync</span>
      <span class="text-sm">{{ incoming }}</span>
      <Button
        v-if="!readonly"
        type="button"
        variant="outline"
        size="xs"
        :aria-pressed="choice === 'sync'"
        :class="choice === 'sync' ? 'border-foreground' : undefined"
        @click="emit('choose', 'sync')"
      >
        Use this sync
      </Button>
    </div>
  </div>
</template>
