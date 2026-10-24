<script setup lang="ts">
import { ChevronDownIcon } from '@lucide/vue'
import { computed, ref } from 'vue'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    options: string[]
    modelValue: string[]
    placeholder?: string
    ariaLabel?: string
    disabled?: boolean
    emptyText?: string
    searchable?: boolean
    searchPlaceholder?: string
    class?: string
  }>(),
  {
    placeholder: 'Select…',
    ariaLabel: undefined,
    disabled: false,
    emptyText: 'No options available.',
    searchable: false,
    searchPlaceholder: 'Search…',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter((o) => o.toLowerCase().includes(q))
})

const displayValue = computed(() => {
  if (!props.modelValue.length) return props.placeholder
  if (props.modelValue.length <= 2) return props.modelValue.join(', ')
  return `${props.modelValue.slice(0, 2).join(', ')} +${props.modelValue.length - 2}`
})

function isSelected(option: string) {
  return props.modelValue.includes(option)
}

const allSelected = computed(
  () => props.options.length > 0 && props.options.every((option) => isSelected(option)),
)

function toggle(option: string) {
  if (props.disabled) return
  emit(
    'update:modelValue',
    isSelected(option)
      ? props.modelValue.filter((item) => item !== option)
      : [...props.modelValue, option],
  )
}

function selectAll() {
  if (props.disabled) return
  emit('update:modelValue', [...props.options])
}

function clear() {
  if (props.disabled) return
  emit('update:modelValue', [])
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        :disabled="disabled"
        :aria-label="ariaLabel || placeholder"
        :data-placeholder="modelValue.length ? undefined : ''"
        :class="
          cn(
            'w-full justify-between bg-card px-3 font-normal text-foreground data-placeholder:bg-background data-placeholder:text-muted-foreground',
            props.class,
          )
        "
      >
        <span class="min-w-0 flex-1 truncate text-left">{{ displayValue }}</span>
        <ChevronDownIcon class="size-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-72 p-1.5">
      <div v-if="searchable" class="mb-1.5 px-1">
        <Input v-model="query" :placeholder="searchPlaceholder" />
      </div>
      <div class="max-h-60 space-y-0.5 overflow-y-auto">
        <label
          v-for="option in filtered"
          :key="option"
          class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          :class="isSelected(option) ? 'bg-accent/70' : undefined"
        >
          <Checkbox
            :model-value="isSelected(option)"
            :disabled="disabled"
            @update:model-value="toggle(option)"
          />
          <span class="min-w-0 truncate">{{ option }}</span>
        </label>
        <p
          v-if="!filtered.length"
          class="px-2 py-3 text-center text-sm text-muted-foreground italic"
        >
          {{ emptyText }}
        </p>
      </div>
      <div
        v-if="options.length"
        class="mt-1 flex items-center justify-between gap-2 border-t px-2 pt-1.5 pb-0.5"
      >
        <button
          type="button"
          class="text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground disabled:no-underline"
          :disabled="disabled || allSelected"
          @click="selectAll"
        >
          Select all
        </button>
        <button
          type="button"
          class="text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground disabled:no-underline"
          :disabled="disabled || !modelValue.length"
          @click="clear"
        >
          Clear
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
