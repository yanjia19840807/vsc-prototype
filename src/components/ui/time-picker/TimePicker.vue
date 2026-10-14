<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { Clock } from '@lucide/vue'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import TimePickerInput from './TimePickerInput.vue'

const props = withDefaults(
  defineProps<{
    date?: Date
    withSeconds?: boolean
    withLabels?: boolean
    showIcon?: boolean
    class?: string
  }>(),
  {
    date: () => new Date(new Date().setHours(0, 0, 0, 0)),
    withSeconds: false,
    withLabels: false,
    showIcon: true,
  },
)

const emit = defineEmits<{
  'update:date': [date: Date]
}>()

const uid = useId()
const hourRef = ref<InstanceType<typeof TimePickerInput> | null>(null)
const minuteRef = ref<InstanceType<typeof TimePickerInput> | null>(null)
const secondRef = ref<InstanceType<typeof TimePickerInput> | null>(null)

const internalDate = computed({
  get: () => props.date,
  set: (value: Date) => emit('update:date', value),
})

function updateDate(next: Date) {
  internalDate.value = next
}
</script>

<template>
  <div :class="cn('flex items-end gap-1', props.class)">
    <div class="flex flex-col items-center gap-1">
      <Label v-if="withLabels" :for="`${uid}-hours`" class="text-xs">Hours</Label>
      <TimePickerInput
        :id="`${uid}-hours`"
        ref="hourRef"
        picker="hours"
        :date="internalDate"
        @update:date="updateDate"
        @right-focus="minuteRef?.focus()"
      />
    </div>
    <span v-if="!withLabels" class="pb-1.5 text-sm text-muted-foreground">:</span>
    <div class="flex flex-col items-center gap-1">
      <Label v-if="withLabels" :for="`${uid}-minutes`" class="text-xs">Minutes</Label>
      <TimePickerInput
        :id="`${uid}-minutes`"
        ref="minuteRef"
        picker="minutes"
        :date="internalDate"
        @update:date="updateDate"
        @left-focus="hourRef?.focus()"
        @right-focus="withSeconds ? secondRef?.focus() : undefined"
      />
    </div>
    <template v-if="withSeconds">
      <span v-if="!withLabels" class="pb-1.5 text-sm text-muted-foreground">:</span>
      <div class="flex flex-col items-center gap-1">
        <Label v-if="withLabels" :for="`${uid}-seconds`" class="text-xs">Seconds</Label>
        <TimePickerInput
          :id="`${uid}-seconds`"
          ref="secondRef"
          picker="seconds"
          :date="internalDate"
          @update:date="updateDate"
          @left-focus="minuteRef?.focus()"
        />
      </div>
    </template>
    <div v-if="showIcon" class="flex h-8 items-center">
      <Clock class="size-3.5 text-muted-foreground" />
    </div>
  </div>
</template>
