<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
  MISMATCH_REEDIT_ALERT,
  isMismatchReedit,
} from '@/features/vessel-schedule/mismatch-actions'
import {
  draftToSchedule,
  emptyTerminalDraft,
  reviewAlertText,
  reviewWarnKeys,
  scheduleToDraft,
  type TerminalDraft,
  type TerminalDraftKey,
} from '@/features/vessel-schedule/mismatch-fields'
import { reviewMatchSchema } from '@/features/vessel-schedule/mismatch-schemas'
import LaraReadonlyPanel from '@/features/vessel-schedule/LaraReadonlyPanel.vue'
import MismatchRemarkField from '@/features/vessel-schedule/MismatchRemarkField.vue'
import TerminalFieldsPanel from '@/features/vessel-schedule/TerminalFieldsPanel.vue'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsc'

const props = defineProps<{
  open: boolean
  vessel: VesselRecord | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useVesselStore()
const editing = ref(false)
const viewDraft = ref<TerminalDraft>(emptyTerminalDraft())
const reedit = computed(() => (props.vessel ? isMismatchReedit(props.vessel) : false))
const title = computed(() =>
  reedit.value ? MISMATCH_EDIT_LABEL.reviewMatch : MISMATCH_ACTION_LABEL.reviewMatch,
)

const schedule = computed(() => {
  const vessel = props.vessel
  if (!vessel) return null
  return vessel.terminalSchedule ?? vessel.terminalCandidates[0] ?? null
})

const warnKeys = computed(() =>
  props.vessel ? reviewWarnKeys(props.vessel, schedule.value) : new Set<TerminalDraftKey>(),
)

const lockedKeys = computed(() => new Set<TerminalDraftKey>())

const alertText = computed(() => {
  if (!props.vessel) return ''
  if (reedit.value) return MISMATCH_REEDIT_ALERT.reviewMatch
  return reviewAlertText(props.vessel, schedule.value)
})

const { handleSubmit, resetForm, values, setValues } = useForm({
  validationSchema: reviewMatchSchema,
  initialValues: { ...emptyTerminalDraft(), remark: '' },
})

watch(
  () => [props.open, props.vessel?.id] as const,
  ([open]) => {
    if (!open || !props.vessel) return
    editing.value = false
    const draft = scheduleToDraft(schedule.value, props.vessel)
    viewDraft.value = { ...draft }
    resetForm({
      values: { ...draft, remark: '' },
    })
  },
)

watch(
  values,
  (next) => {
    if (!editing.value) return
    const { remark: _remark, ...draft } = next as TerminalDraft & { remark: string }
    viewDraft.value = draft as TerminalDraft
  },
  { deep: true },
)

function startEdit() {
  editing.value = true
  setValues({ ...viewDraft.value, remark: values.remark ?? '' })
}

function cancelEdit() {
  editing.value = false
  const draft = scheduleToDraft(schedule.value, props.vessel)
  viewDraft.value = { ...draft }
  setValues({ ...draft, remark: values.remark ?? '' })
}

const onConfirm = handleSubmit((form) => {
  if (!props.vessel) return
  const { remark, ...draft } = form
  const next = draftToSchedule(draft as TerminalDraft, schedule.value)
  if (editing.value) {
    store.saveTerminalOverrides(props.vessel.id, {
      schedule: next,
      vesselOperator: draft.vesselOperator,
      reason: remark,
      includeMatch: true,
      remediation: 'reviewMatch',
    })
  } else {
    store.confirmCandidateMatch(props.vessel.id, {
      candidate: next,
      reason: remark,
      remediation: 'reviewMatch',
    })
  }
  toast.success(reedit.value ? 'Terminal match updated' : 'Terminal match reviewed')
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

      <div class="flex justify-end gap-2">
        <Button v-if="!editing" type="button" variant="outline" @click="startEdit">
          Edit
        </Button>
        <Button v-else type="button" variant="outline" @click="cancelEdit">
          Cancel edit
        </Button>
      </div>

      <TerminalFieldsPanel
        :draft="viewDraft"
        :mode="editing ? 'edit' : 'view'"
        :locked-keys="lockedKeys"
        :warn-keys="warnKeys"
        :use-form-fields="editing"
      />

      <MismatchRemarkField />

      <DialogFooter>
        <Button type="button" variant="outline" @click="close">Cancel</Button>
        <Button type="button" variant="primary" @click="onConfirm">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
