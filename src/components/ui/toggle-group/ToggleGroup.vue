<script setup lang="ts">
import type { ToggleGroupRootEmits, ToggleGroupRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ToggleGroupVariants } from '.'
import { reactiveOmit } from '@vueuse/core'
import { ToggleGroupRoot, useForwardPropsEmits } from 'reka-ui'
import { provide } from 'vue'
import { cn } from '@/lib/utils'
import { toggleGroupVariants } from '.'

const props = withDefaults(
  defineProps<
    ToggleGroupRootProps & {
      class?: HTMLAttributes['class']
      variant?: ToggleGroupVariants['variant']
      size?: ToggleGroupVariants['size']
    }
  >(),
  {
    type: 'multiple',
    variant: 'outline',
    size: 'default',
  },
)

const emits = defineEmits<ToggleGroupRootEmits>()
const delegatedProps = reactiveOmit(props, 'class', 'variant', 'size')
const forwarded = useForwardPropsEmits(delegatedProps, emits)

provide('toggleGroup', {
  variant: props.variant,
  size: props.size,
})
</script>

<template>
  <ToggleGroupRoot
    v-slot="slotProps"
    data-slot="toggle-group"
    v-bind="forwarded"
    :class="cn(toggleGroupVariants({ variant, size }), props.class)"
  >
    <slot v-bind="slotProps" />
  </ToggleGroupRoot>
</template>
