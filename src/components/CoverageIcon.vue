<script setup lang="ts">
import { Unplug } from '@lucide/vue'

defineProps<{
  covered: boolean
}>()
</script>

<template>
  <span
    v-if="!covered"
    class="inline-flex shrink-0 text-muted-foreground"
    role="img"
    title="Not covered"
    aria-label="Not covered"
  >
    <Unplug class="size-3.5" />
  </span>
</template>
