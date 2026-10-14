<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseDate } from '@internationalized/date'
import { CalendarIcon } from '@lucide/vue'
import type { DateRange, DateValue } from 'reka-ui'

import { Button, type ButtonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RangeCalendar } from '@/components/ui/range-calendar'
import { cn } from '@/lib/utils'

const from = defineModel<string>('from', { default: '' })
const to = defineModel<string>('to', { default: '' })
const emit = defineEmits<{
  change: [value: { from: string; to: string }]
}>()

const props = withDefaults(
  defineProps<{
    placeholder?: string
    ariaLabel?: string
    disabled?: boolean
    size?: ButtonVariants['size']
    class?: string
  }>(),
  {
    placeholder: 'Pick a date range',
    ariaLabel: 'Date range',
    disabled: false,
    size: 'default',
  },
)

const open = ref(false)
const clearing = ref(false)

function parseCivil(value?: string): DateValue | undefined {
  if (!value) return undefined
  try {
    return parseDate(value.slice(0, 10)) as unknown as DateValue
  } catch {
    return undefined
  }
}

function civil(value?: DateValue) {
  return value ? String(value).slice(0, 10) : ''
}

const range = computed<DateRange>(() => ({
  start: parseCivil(from.value),
  end: parseCivil(to.value),
}))

function formatLabel(value: DateValue) {
  return String(value).slice(0, 10)
}

function apply(nextFrom: string, nextTo: string) {
  from.value = nextFrom
  to.value = nextTo
  emit('change', { from: nextFrom, to: nextTo })
}

const label = computed(() => {
  const start = range.value.start
  const end = range.value.end
  if (start && end) return `${formatLabel(start)} – ${formatLabel(end)}`
  if (start) return formatLabel(start)
  return ''
})

function onRange(value: DateRange) {
  if (clearing.value) return
  apply(civil(value.start), civil(value.end))
  if (value.start && value.end) open.value = false
}

function clear() {
  clearing.value = true
  apply('', '')
  open.value = false
}

function onOpen(next: boolean) {
  open.value = next
  if (!next) clearing.value = false
}
</script>

<template>
  <Popover :open="open" @update:open="onOpen">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        :size="size"
        :disabled="disabled"
        :aria-label="ariaLabel || placeholder"
        :data-placeholder="label ? undefined : ''"
        :class="
          cn(
            'min-w-[280px] justify-start text-left font-normal',
            !label && 'text-muted-foreground',
            props.class,
          )
        "
      >
        <CalendarIcon class="size-3.5" />
        {{ label || placeholder }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0" align="start">
      <RangeCalendar
        :model-value="range"
        :number-of-months="2"
        initial-focus
        @update:model-value="onRange"
      />
      <div v-if="from || to" class="border-t p-1">
        <Button type="button" variant="ghost" class="w-full" @click.stop="clear">
          Clear
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
