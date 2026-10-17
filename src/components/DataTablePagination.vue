<script setup lang="ts">
import { computed } from 'vue'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    total: number
    /** 0-based page index (TanStack Table) */
    pageIndex: number
    pageSize: number
    pageCount: number
    pageSizes?: number[]
    class?: string
  }>(),
  {
    pageSizes: () => [10, 20, 50, 100],
  },
)

const emit = defineEmits<{
  'update:pageIndex': [value: number]
  'update:pageSize': [value: number]
}>()

const from = computed(() =>
  props.total === 0 ? 0 : props.pageIndex * props.pageSize + 1,
)
const to = computed(() =>
  Math.min(props.total, (props.pageIndex + 1) * props.pageSize),
)

function onPageSize(value: unknown) {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0) return
  emit('update:pageSize', size)
}
</script>

<template>
  <div
    :class="
      cn(
        'flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 py-4 text-sm text-muted-foreground',
        props.class,
      )
    "
  >
    <span class="mr-auto">
      Showing {{ from }}–{{ to }} of {{ total }}
    </span>
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-2">
        <span class="whitespace-nowrap">Rows per page</span>
        <Select :model-value="String(pageSize)" @update:model-value="onPageSize">
          <SelectTrigger class="h-8 w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="s in pageSizes" :key="s" :value="String(s)">
              {{ s }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <span class="whitespace-nowrap">
        Page {{ pageCount === 0 ? 0 : pageIndex + 1 }} of {{ Math.max(pageCount, 1) }}
      </span>
      <div class="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          :disabled="pageIndex <= 0"
          @click="emit('update:pageIndex', pageIndex - 1)"
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          :disabled="pageIndex >= pageCount - 1 || pageCount === 0"
          @click="emit('update:pageIndex', pageIndex + 1)"
        >
          Next
        </Button>
      </div>
    </div>
  </div>
</template>
