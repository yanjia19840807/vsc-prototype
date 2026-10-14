<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import {
  getArrowByType,
  getDateByType,
  setDateByType,
  type Period,
  type TimePickerType,
} from './time-picker-utils'

const props = withDefaults(
  defineProps<{
    picker: TimePickerType
    date?: Date
    period?: Period
    class?: string
    id?: string
    name?: string
  }>(),
  {
    date: () => new Date(new Date().setHours(0, 0, 0, 0)),
  },
)

const emit = defineEmits<{
  'update:date': [date: Date]
  rightFocus: []
  leftFocus: []
}>()

const flag = ref(false)
const prevIntKey = ref('0')
const inputRef = ref<{ $el?: HTMLInputElement } | null>(null)

watch(flag, (newFlag) => {
  if (!newFlag) return
  const timer = setTimeout(() => {
    flag.value = false
  }, 2000)
  return () => clearTimeout(timer)
})

const calculatedValue = computed(() => getDateByType(props.date, props.picker))

function calculateNewValue(key: string) {
  if (props.picker === '12hours') {
    if (flag.value && calculatedValue.value.slice(1, 2) === '1' && prevIntKey.value === '0') {
      return `0${key}`
    }
  }
  return !flag.value ? `0${key}` : calculatedValue.value.slice(1, 2) + key
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Tab') return
  e.preventDefault()

  if (e.key === 'ArrowRight') emit('rightFocus')
  if (e.key === 'ArrowLeft') emit('leftFocus')

  if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
    const step = e.key === 'ArrowUp' ? 1 : -1
    const newValue = getArrowByType(calculatedValue.value, step, props.picker)
    if (flag.value) flag.value = false
    const tempDate = new Date(props.date)
    emit('update:date', setDateByType(tempDate, newValue, props.picker, props.period))
  }

  if (e.key >= '0' && e.key <= '9') {
    if (props.picker === '12hours') prevIntKey.value = e.key
    const newValue = calculateNewValue(e.key)
    if (flag.value) emit('rightFocus')
    flag.value = !flag.value
    const tempDate = new Date(props.date)
    emit('update:date', setDateByType(tempDate, newValue, props.picker, props.period))
  }
}

function focus() {
  inputRef.value?.$el?.focus()
}

defineExpose({ focus })
</script>

<template>
  <Input
    ref="inputRef"
    :id="id || picker"
    :name="name || picker"
    :model-value="calculatedValue"
    type="tel"
    inputmode="decimal"
    :class="
      cn(
        'w-[48px] shrink-0 px-1 text-center font-mono text-base tabular-nums caret-transparent focus:bg-accent focus:text-accent-foreground [&::-webkit-inner-spin-button]:appearance-none',
        props.class,
      )
    "
    @update:model-value="() => {}"
    @keydown="handleKeyDown"
  />
</template>
