<script setup lang="ts">
import type { ToggleGroupItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ToggleGroupVariants } from '.'
import { reactiveOmit } from '@vueuse/core'
import { ToggleGroupItem, useForwardProps } from 'reka-ui'
import { inject } from 'vue'
import { cn } from '@/lib/utils'
import { toggleVariants } from '.'

const props = defineProps<ToggleGroupItemProps & { class?: HTMLAttributes['class'] }>()

const context = inject<{
  variant?: ToggleGroupVariants['variant']
  size?: ToggleGroupVariants['size']
}>('toggleGroup', { variant: 'outline', size: 'default' })

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <ToggleGroupItem
    v-slot="slotProps"
    data-slot="toggle-group-item"
    v-bind="forwarded"
    :class="
      cn(
        toggleVariants({
          variant: context.variant,
          size: context.size,
        }),
        props.class,
      )
    "
  >
    <slot v-bind="slotProps" />
  </ToggleGroupItem>
</template>
