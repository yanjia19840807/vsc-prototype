<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseDate } from '@internationalized/date'
import type { DateValue } from 'reka-ui'
import { CalendarIcon } from '@lucide/vue'

import { Button, type ButtonVariants } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    ariaLabel?: string
    disabled?: boolean
    size?: ButtonVariants['size']
    class?: string
  }>(),
  {
    modelValue: '',
    placeholder: 'Pick a date',
    ariaLabel: 'Choose date',
    disabled: false,
    size: 'default',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)

function parseCivil(value?: string): DateValue | undefined {
  if (!value) return undefined
  try {
    return parseDate(value.slice(0, 10)) as unknown as DateValue
  } catch {
    return undefined
  }
}

const date = computed<DateValue | undefined>({
  get() {
    return parseCivil(props.modelValue)
  },
  set(value) {
    emit('update:modelValue', value ? String(value).slice(0, 10) : '')
  },
})

function formatLabel(value: DateValue) {
  return String(value).slice(0, 10)
}

function onSelect(value: DateValue | undefined) {
  date.value = value
  open.value = false
}

function clear() {
  emit('update:modelValue', '')
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        :size="size"
        :disabled="disabled"
        :aria-label="ariaLabel || placeholder"
        :data-placeholder="date ? undefined : ''"
        :class="
          cn(
            'min-w-[160px] justify-start bg-card text-left font-normal data-placeholder:bg-background',
            !date && 'text-muted-foreground',
            props.class,
          )
        "
      >
        <CalendarIcon class="size-3.5" />
        {{ date ? formatLabel(date) : placeholder }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0" align="start">
      <Calendar
        :model-value="date"
        initial-focus
        @update:model-value="onSelect"
      />
      <div v-if="date" class="border-t p-1">
        <Button type="button" variant="ghost" class="w-full" @click="clear">
          Clear
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
