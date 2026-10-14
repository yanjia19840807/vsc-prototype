<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="alert-description"
    :class="cn('text-sm text-balance md:text-pretty group-data-[variant=default]/alert:text-muted-foreground group-data-[variant=destructive]/alert:text-destructive/90 group-data-[variant=info]/alert:text-sky-900 group-data-[variant=success]/alert:text-emerald-900 group-data-[variant=warning]/alert:text-amber-900 [&_p:not(:last-child)]:mb-4 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground', props.class)"
  >
    <slot />
  </div>
</template>
