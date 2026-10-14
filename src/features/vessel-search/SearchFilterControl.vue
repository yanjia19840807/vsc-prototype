<script setup lang="ts">
import { DateRangePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/multi-select'
import {
  allPlaceholder,
  filterIsSearchable,
  type FilterFieldDef,
  type FilterState,
} from '@/features/vessel-search/list-setting-model'

const props = defineProps<{
  field: FilterFieldDef
  state: FilterState
  options?: string[]
}>()

const emit = defineEmits<{
  'update:state': [value: FilterState]
}>()

function patch(next: Partial<FilterState>) {
  emit('update:state', { ...props.state, ...next })
}
</script>

<template>
  <DateRangePicker
    v-if="field.kind === 'datetime'"
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
