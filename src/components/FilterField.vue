<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <label class="flex items-center gap-2">
    <span class="shrink-0 text-sm text-muted-foreground">{{ label }}</span>
    <slot />
  </label>
</template>
