<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    label: string
    value?: string | number | null
    layout?: 'row' | 'stack'
    class?: HTMLAttributes['class']
  }>(),
  {
    layout: 'stack',
  },
)
</script>

<template>
  <div
    data-slot="readonly-field"
    :class="
      cn(
        'min-w-0 border-b py-2',
        layout === 'row'
          ? 'grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-center'
          : 'space-y-1',
        props.class,
      )
    "
  >
    <dt data-slot="readonly-field-label" class="text-sm text-muted-foreground">{{ label }}</dt>
    <dd data-slot="readonly-field-value" class="text-sm">
      <slot>{{ value == null || value === '' ? '—' : value }}</slot>
    </dd>
  </div>
</template>
