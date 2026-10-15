<script setup lang="ts">
import { computed } from 'vue'

import { DateRangePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/multi-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  allPlaceholder,
  filterIsSearchable,
  normalizeDayOffset,
  relativeDateLabel,
  resolveFilterDefault,
  type FilterFieldDef,
  type FilterState,
} from '@/features/vessel-search/list-setting-model'

const props = withDefaults(
  defineProps<{
    field: FilterFieldDef
    state: FilterState
    options?: string[]
    dateDefault?: boolean
  }>(),
  { dateDefault: false },
)

const emit = defineEmits<{
  'update:state': [value: FilterState]
}>()

function patch(next: Partial<FilterState>) {
  emit('update:state', { ...props.state, ...next })
}

function setDateMode(mode: unknown) {
  if (mode === 'relative') {
    patch({ dateMode: 'relative' })
    return
  }
  if (props.state.dateMode === 'relative') {
    const resolved = resolveFilterDefault(props.field, props.state)
    patch({ dateMode: 'fixed', from: resolved.from, to: resolved.to, fromDays: null, toDays: null })
    return
  }
  patch({ dateMode: 'fixed', fromDays: null, toDays: null })
}

function setDayOffset(key: 'fromDays' | 'toDays', value: string | number) {
  patch({ dateMode: 'relative', [key]: normalizeDayOffset(value) })
}

const preview = computed(() => relativeDateLabel(props.state.fromDays ?? null, props.state.toDays ?? null))
</script>

<template>
  <div v-if="field.kind === 'datetime' && dateDefault" class="flex flex-wrap items-center gap-2">
    <Select :model-value="state.dateMode === 'relative' ? 'relative' : 'fixed'" @update:model-value="setDateMode">
      <SelectTrigger class="h-8 w-44" :aria-label="`${field.label} default type`">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="fixed">Fixed dates</SelectItem>
        <SelectItem value="relative">Relative to today</SelectItem>
      </SelectContent>
    </Select>
    <DateRangePicker
      v-if="state.dateMode !== 'relative'"
      :from="state.from"
      :to="state.to"
      :aria-label="field.label"
      @change="patch"
    />
    <template v-else>
      <Input
        :model-value="state.fromDays ?? ''"
        type="number"
        min="0"
        step="1"
        class="h-8 w-16"
        placeholder="—"
        :aria-label="`${field.label} days before today`"
        @update:model-value="setDayOffset('fromDays', $event)"
      />
      <span class="text-xs text-muted-foreground">days before today</span>
      <span class="text-muted-foreground" aria-hidden="true">–</span>
      <Input
        :model-value="state.toDays ?? ''"
        type="number"
        min="0"
        step="1"
        class="h-8 w-16"
        placeholder="—"
        :aria-label="`${field.label} days after today`"
        @update:model-value="setDayOffset('toDays', $event)"
      />
      <span class="text-xs text-muted-foreground">days after today</span>
      <span class="text-xs text-muted-foreground">{{ preview }}</span>
    </template>
  </div>
  <DateRangePicker
    v-else-if="field.kind === 'datetime'"
    :from="state.from"
    :to="state.to"
    :aria-label="field.label"
    @change="patch"
  />
  <MultiSelect
    v-else-if="field.kind === 'multi'"
    :model-value="state.values"
    :options="options ?? []"
    :placeholder="allPlaceholder(field.label)"
    :aria-label="field.label"
    :searchable="filterIsSearchable(field)"
    :search-placeholder="`Search ${field.label.toLowerCase()}…`"
    class="w-[220px]"
    @update:model-value="patch({ values: $event })"
  />
  <Input
    v-else
    :model-value="state.text"
    class="h-8 w-52"
    :aria-label="field.label"
    @update:model-value="patch({ text: String($event) })"
  />
</template>
