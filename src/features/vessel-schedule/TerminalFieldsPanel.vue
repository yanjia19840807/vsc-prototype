<script setup lang="ts">
import { useField } from 'vee-validate'
import { computed, h, defineComponent } from 'vue'

import DataSection from '@/components/DataSection.vue'
import ReadonlyField from '@/components/ReadonlyField.vue'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  datetimeInputValue,
  datetimeToIso,
  displayDraftValue,
  draftKeyForColumn,
  terminalPanelColumns,
  type TerminalDraft,
  type TerminalDraftKey,
} from '@/features/vessel-schedule/mismatch-fields'

const props = withDefaults(
  defineProps<{
    /** When not using vee-validate field names, pass draft for view mode. */
    draft?: TerminalDraft
    mode?: 'view' | 'edit'
    lockedKeys?: Set<TerminalDraftKey>
    warnKeys?: Set<TerminalDraftKey>
    title?: string
    /** Bind inputs via vee-validate useField by draft key name. */
    useFormFields?: boolean
  }>(),
  {
    mode: 'view',
    lockedKeys: () => new Set(),
    warnKeys: () => new Set(),
    title: 'Terminal',
    useFormFields: false,
  },
)

const columns = terminalPanelColumns()

function keyOf(columnId: string) {
  return draftKeyForColumn(columnId)!
}

function isLocked(key: TerminalDraftKey) {
  return props.lockedKeys.has(key)
}

function isEditing(key: TerminalDraftKey) {
  return props.mode === 'edit' && !isLocked(key)
}

function warnClass(key: TerminalDraftKey) {
  return props.warnKeys.has(key) ? 'text-amber-800' : undefined
}

function fieldKind(kind: string): 'text' | 'datetime' {
  return kind === 'datetime' ? 'datetime' : 'text'
}

const FormTextField = defineComponent({
  props: {
    name: { type: String, required: true },
    label: { type: String, required: true },
    kind: { type: String as () => 'text' | 'datetime', required: true },
  },
  setup(fieldProps) {
    const { value, errorMessage } = useField<string>(() => fieldProps.name)
    return () =>
      h(Field, { 'data-invalid': errorMessage.value ? true : undefined, class: 'h-full min-h-[3.25rem] min-w-0 border-b py-2' }, () => [
        h(FieldLabel, null, () => fieldProps.label),
        fieldProps.kind === 'datetime'
          ? h(DateTimePicker, {
              modelValue: datetimeInputValue(value.value ?? ''),
              class: 'w-full',
              'onUpdate:modelValue': (v: string | undefined) => {
                value.value = datetimeToIso(v ?? '')
              },
            })
          : h(Input, {
              modelValue: value.value ?? '',
              class: 'h-8',
              'onUpdate:modelValue': (v: string | number) => {
                value.value = String(v)
              },
            }),
        errorMessage.value ? h(FieldError, null, () => errorMessage.value) : null,
      ])
  },
})

const gridClass = computed(() => 'grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3')
</script>

<template>
  <DataSection :title="title" class="min-w-0">
    <dl :class="gridClass">
      <template v-for="column in columns" :key="column.id">
        <FormTextField
          v-if="useFormFields && isEditing(keyOf(column.id))"
          :name="keyOf(column.id)"
          :label="column.label"
          :kind="fieldKind(column.kind)"
        />
        <ReadonlyField
          v-else
          class="h-full min-h-[3.25rem]"
          :label="column.label"
          :value="displayDraftValue(
            draft ?? ({} as TerminalDraft),
            keyOf(column.id),
            fieldKind(column.kind),
          )"
        >
          <span :class="warnClass(keyOf(column.id))">
            {{
              displayDraftValue(
                draft ?? ({} as TerminalDraft),
                keyOf(column.id),
                fieldKind(column.kind),
              )
            }}
          </span>
        </ReadonlyField>
      </template>
    </dl>
  </DataSection>
</template>
