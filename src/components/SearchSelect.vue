<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, ChevronsUpDown } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  modelValue?: string
  options: { value: string; label: string }[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Select',
  searchPlaceholder: 'Search',
  emptyText: 'No matches',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const query = ref('')

watch(open, (value) => {
  if (!value) query.value = ''
})

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return props.options
  return props.options.filter((option) =>
    option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle),
  )
})

const current = computed(() => props.options.find((option) => option.value === props.modelValue)?.label)

function choose(value: string) {
  emit('update:modelValue', value)
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        :disabled="disabled"
        :aria-expanded="open"
        class="h-8 w-full justify-between px-2 font-normal"
      >
        <span class="truncate" :class="current ? undefined : 'text-muted-foreground'">{{ current || placeholder }}</span>
        <ChevronsUpDown class="size-3.5 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-[var(--reka-popover-trigger-width)] p-2" align="start">
      <Input v-model="query" class="h-8" :placeholder="searchPlaceholder" />
      <div class="mt-2 max-h-60 overflow-auto">
        <button
          v-for="option in filtered"
          :key="option.value"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          @click="choose(option.value)"
        >
          <Check :class="cn('size-3.5 shrink-0', option.value === modelValue ? 'opacity-100' : 'opacity-0')" />
          <span class="truncate">{{ option.label }}</span>
        </button>
        <p v-if="filtered.length === 0" class="px-2 py-3 text-sm text-muted-foreground">{{ emptyText }}</p>
      </div>
    </PopoverContent>
  </Popover>
</template>
