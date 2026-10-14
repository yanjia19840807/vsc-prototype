<script setup lang="ts">
import { computed } from 'vue'

import DatePicker from './DatePicker.vue'
import { TimePicker } from '@/components/ui/time-picker'
import { cn } from '@/lib/utils'

/** Combines DatePicker + community TimePicker into `YYYY-MM-DDTHH:mm`. */
const props = defineProps<{
  modelValue?: string
  class?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const datePart = computed({
  get: () => (props.modelValue ? props.modelValue.slice(0, 10) : ''),
  set: (d: string) => {
    const t = timeLabel.value
    emit('update:modelValue', d ? `${d}T${t}` : '')
  },
})

const timeDate = computed({
  get: () => {
    const base = new Date()
    base.setSeconds(0, 0)
    if (!props.modelValue || props.modelValue.length < 16) {
      base.setHours(0, 0, 0, 0)
      return base
    }
    const hours = Number.parseInt(props.modelValue.slice(11, 13), 10) || 0
    const minutes = Number.parseInt(props.modelValue.slice(14, 16), 10) || 0
    base.setHours(hours, minutes, 0, 0)
    return base
  },
  set: (next: Date) => {
    const d = datePart.value
    if (!d) return
    const hh = String(next.getHours()).padStart(2, '0')
    const mm = String(next.getMinutes()).padStart(2, '0')
    emit('update:modelValue', `${d}T${hh}:${mm}`)
  },
})

const timeLabel = computed(() => {
  const t = timeDate.value
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
})

function onTimeUpdate(next: Date) {
  timeDate.value = next
}
</script>

<template>
  <div :class="cn('flex flex-nowrap items-center gap-2', props.class)">
    <DatePicker v-model="datePart" class="w-[150px] shrink-0" />
    <TimePicker
      :date="timeDate"
      class="shrink-0"
      @update:date="onTimeUpdate"
    />
  </div>
</template>
