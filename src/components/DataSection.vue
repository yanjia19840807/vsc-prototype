<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  title?: string
  class?: HTMLAttributes['class']
  titleClass?: HTMLAttributes['class']
}>()
</script>

<template>
  <section data-slot="data-section" :class="cn('min-w-0', props.class)">
    <div
      data-slot="data-section-title"
      :class="cn('mb-2 text-sm font-medium text-foreground', props.titleClass)"
    >
      <slot name="title">
        <h2 class="text-sm font-medium">{{ title }}</h2>
      </slot>
    </div>
    <slot />
  </section>
</template>
