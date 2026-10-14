<script setup lang="ts">
import { computed, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'

import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { toastFormErrors } from '@/lib/form-toast'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  MISMATCH_ACTION_LABEL,
  MISMATCH_EDIT_LABEL,
  addTerminalAlert,
  isManualTerminalEditable,
} from '@/features/vessel-schedule/mismatch-actions'
import {
  draftToSchedule,
  emptyTerminalDraft,
  scheduleToDraft,
  type TerminalDraft,
} from '@/features/vessel-schedule/mismatch-fields'
import { addTerminalSchema } from '@/features/vessel-schedule/mismatch-schemas'
import LaraReadonlyPanel from '@/features/vessel-schedule/LaraReadonlyPanel.vue'
import MismatchRemarkField from '@/features/vessel-schedule/MismatchRemarkField.vue'
import TerminalFieldsPanel from '@/features/vessel-schedule/TerminalFieldsPanel.vue'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

const props = defineProps<{
  open: boolean
  vessel: VesselRecord | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useVesselStore()

const editingExisting = computed(() =>
  props.vessel ? isManualTerminalEditable(props.vessel) : false,
)

const title = computed(() =>
  editingExisting.value ? MISMATCH_EDIT_LABEL.addTerminal : MISMATCH_ACTION_LABEL.addTerminal,
)

const alertText = computed(() => (props.vessel ? addTerminalAlert(props.vessel) : ''))

const { handleSubmit, resetForm, values } = useForm({
  validationSchema: addTerminalSchema,
  initialValues: { ...emptyTerminalDraft(), remark: '' },
})

watch(
  () => [props.open, props.vessel?.id] as const,
  ([open]) => {
    if (!open || !props.vessel) return
    if (isManualTerminalEditable(props.vessel)) {
      resetForm({
        values: {
          ...scheduleToDraft(props.vessel.terminalSchedule, props.vessel),
          remark: '',
        },
      })
      return
    }
    resetForm({
      values: {
        ...emptyTerminalDraft(),
        remark: '',
      },
    })
  },
)

const onSubmit = handleSubmit((form) => {
  if (!props.vessel) return
  const { remark, ...draft } = form
  const schedule = draftToSchedule(draft)
  if (editingExisting.value) {
    store.saveTerminalOverrides(props.vessel.id, {
      schedule,
      vesselOperator: draft.vesselOperator,
      reason: remark ?? '',
    })
    toast.success('Terminal details updated')
  } else {
    store.addManualTerminalFromDraft(props.vessel.id, {
      schedule,
      vesselOperator: draft.vesselOperator,
      reason: remark ?? '',
    })
    toast.success('Terminal details saved')
  }
  emit('update:open', false)
}, ({ errors }) => {
  toastFormErrors(errors)
})

function close() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      size="2xl"
      class="max-h-[calc(100dvh-2rem)] min-w-0 overflow-x-hidden overflow-y-auto"
    >
      <DialogHeader class="min-w-0">
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">{{ alertText }}</p>

      <LaraReadonlyPanel v-if="vessel" :vessel="vessel" />

      <TerminalFieldsPanel
        :draft="values as TerminalDraft"
        mode="edit"
        use-form-fields
      />

      <MismatchRemarkField />

      <DialogFooter>
        <Button type="button" variant="outline" @click="close">Cancel</Button>
        <Button type="button" variant="primary" @click="onSubmit">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
