<script setup lang="ts">
import { ArrowDown, ArrowUp, ArrowUpDown } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

defineProps<{
  title: string
  sorted: false | 'asc' | 'desc'
  sortIndex: number
}>()

const emit = defineEmits<{
  sort: [desc: boolean]
  clearSort: []
  clearAllSort: []
}>()
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="-ml-3 h-8 px-2"
        :class="cn(sorted && 'text-foreground')"
        :aria-label="`${title} column menu`"
      >
        <span>{{ title }}</span>
        <span v-if="sortIndex" class="text-xs tabular-nums text-muted-foreground">{{ sortIndex }}</span>
        <ArrowUp v-if="sorted === 'asc'" class="size-4" />
        <ArrowDown v-else-if="sorted === 'desc'" class="size-4" />
        <ArrowUpDown v-else class="size-4 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-48 gap-1 p-2" align="start">
      <Button type="button" size="sm" class="w-full justify-start" :variant="sorted === 'asc' ? 'secondary' : 'ghost'" @click="emit('sort', false)">
        <ArrowUp class="size-4" /> Ascending
        <span v-if="sorted === 'asc'" class="ml-auto text-xs text-muted-foreground">{{ sortIndex }}</span>
      </Button>
      <Button type="button" size="sm" class="w-full justify-start" :variant="sorted === 'desc' ? 'secondary' : 'ghost'" @click="emit('sort', true)">
        <ArrowDown class="size-4" /> Descending
        <span v-if="sorted === 'desc'" class="ml-auto text-xs text-muted-foreground">{{ sortIndex }}</span>
      </Button>
      <div class="flex gap-1">
        <Button type="button" size="sm" variant="outline" class="flex-1" @click="emit('clearSort')">Clear</Button>
        <Button type="button" size="sm" variant="outline" class="flex-1" @click="emit('clearAllSort')">Clear all</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
