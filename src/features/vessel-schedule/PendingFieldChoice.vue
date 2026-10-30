<script setup lang="ts">
import { Button } from '@/components/ui/button'

const props = defineProps<{
  previous: string
  incoming: string
  choice: 'previous' | 'sync' | null
  /** Show the two values without asking which one to keep. */
  readonly?: boolean
}>()

const emit = defineEmits<{
  choose: [choice: 'previous' | 'sync']
}>()

function previousValueClass() {
  return props.choice === 'previous' ? 'font-semibold text-muted-foreground' : 'font-normal text-muted-foreground'
}

function incomingValueClass() {
  return props.choice === 'sync'
    ? 'font-semibold text-amber-800 dark:text-amber-200'
    : 'font-normal text-amber-800 dark:text-amber-200'
}
</script>

<template>
  <div class="flex flex-col gap-0.5 sm:col-start-2">
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="w-20 shrink-0 text-xs text-muted-foreground">Previous</span>
      <span class="text-sm" :class="previousValueClass()">{{ previous }}</span>
      <Button
        v-if="!readonly"
        type="button"
        variant="link"
        size="xs"
        class="h-auto px-0 text-foreground hover:text-foreground"
        :aria-pressed="choice === 'previous'"
        @click="emit('choose', 'previous')"
      >
        Keep previous
      </Button>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="w-20 shrink-0 text-xs text-amber-800 dark:text-amber-200">This sync</span>
      <span class="text-sm" :class="incomingValueClass()">{{ incoming }}</span>
      <Button
        v-if="!readonly"
        type="button"
        variant="link"
        size="xs"
        class="h-auto px-0 text-foreground hover:text-foreground"
        :aria-pressed="choice === 'sync'"
        @click="emit('choose', 'sync')"
      >
        Use this sync
      </Button>
    </div>
  </div>
</template>
