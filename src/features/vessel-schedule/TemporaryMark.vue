<script setup lang="ts">
import { Badge, type BadgeVariants } from '@/components/ui/badge'

defineProps<{
  size?: BadgeVariants['size']
}>()
</script>

<template>
  <Badge variant="warning" :size="size" title="Temporary vessel">TMP</Badge>
</template>
