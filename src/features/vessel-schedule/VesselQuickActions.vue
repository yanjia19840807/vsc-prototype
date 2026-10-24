<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import DeleteManualVesselDialog from '@/features/vessel-schedule/DeleteManualVesselDialog.vue'
import ManualAddVesselDialog from '@/features/vessel-schedule/ManualAddVesselDialog.vue'
import type { ScheduleQuickAction } from '@/features/vessel-schedule/mismatch-actions'
import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { buildSlcSdcFileName } from '@/lib/vessel-utils'
import { useSettingsStore } from '@/stores/settings'
import type { VesselRecord } from '@/types/vsp'

export type { ScheduleQuickAction }

const props = defineProps<{
  vessel: VesselRecord | null
  action: ScheduleQuickAction | null
}>()

const emit = defineEmits<{
  close: []
  deleted: []
}>()

const settings = useSettingsStore()
const router = useRouter()

const editVesselOpen = ref(false)
const deleteVesselOpen = ref(false)
const rfiOpen = ref(false)
const fileOpen = ref(false)
const generatedFile = ref('')

const rfiDraft = computed(() => {
  const v = props.vessel
  if (!v) return { subject: '', body: '', to: '', cc: '' }
  const tpl =
    settings.rfiTemplates.find((t) => t.active && t.port === v.pointCode) ||
    settings.rfiTemplates.find((t) => t.active)
  if (!tpl) return { subject: '', body: '', to: '', cc: '' }
  const subject = tpl.subjectFormat
    .replace('{{service}}', v.service)
    .replace('{{vessel}}', v.vesselName)
    .replace('{{laraVoyage}}', v.laraVoyage)
    .replace('{{tmlVoyage}}', v.externalVoyage || v.localVoyage)
    .replace('{{port}}', v.pointCode)
  return { subject, body: tpl.body, to: tpl.to, cc: tpl.cc }
})

function finish() {
  editVesselOpen.value = false
  deleteVesselOpen.value = false
  rfiOpen.value = false
  fileOpen.value = false
  emit('close')
}

function onDeleted() {
  emit('deleted')
  finish()
}

function onMismatchOpen(open: boolean) {
  if (!open) finish()
}

function generateFile(kind: 'SLC' | 'SDC') {
  const v = props.vessel
  if (!v) return
  if (!v.vesselName || !v.laraVoyage || !v.pointCode) {
    toast.error('Missing fields required to generate filename')
    emit('close')
    return
  }
  if (!v.tmlAtd) {
    toast.error('TML ATD is required to generate SLC/SDC filename')
    emit('close')
    return
  }
  generatedFile.value = buildSlcSdcFileName(kind, v)
  fileOpen.value = true
}

let syncing = false

function onUtilityOpen(open: boolean) {
  if (syncing || open) return
  finish()
}

watch(
  () => [props.vessel?.id, props.action] as const,
  async () => {
    const action = props.action
    const v = props.vessel
    syncing = true
    editVesselOpen.value = false
    deleteVesselOpen.value = false
    rfiOpen.value = false
    fileOpen.value = false
    syncing = false
    if (!v || !action) return
    if (action === 'selectMatch' || action === 'reviewMatch' || action === 'addTerminal' || action === 'linkReview') {
      emit('close')
      void router.push(`/vessels/${v.id}/review`)
      return
    }
    await nextTick()
    if (props.action !== action) return
    if (action === 'editVessel') editVesselOpen.value = true
    else if (action === 'deleteVessel') deleteVesselOpen.value = true
    else if (action === 'rfi') rfiOpen.value = true
    else if (action === 'slc' || action === 'sdc') generateFile(action === 'slc' ? 'SLC' : 'SDC')
  },
)

async function copyGeneratedFile() {
  await navigator.clipboard.writeText(generatedFile.value)
  toast.success('Filename copied')
  finish()
}
</script>

<template>
  <ManualAddVesselDialog
    :open="editVesselOpen"
    :vessel="vessel"
    @update:open="onMismatchOpen"
  />
  <DeleteManualVesselDialog
    :open="deleteVesselOpen"
    :vessel="vessel"
    @update:open="onMismatchOpen"
    @deleted="onDeleted"
  />

  <Dialog :open="rfiOpen" @update:open="onUtilityOpen">
    <DialogContent size="md">
      <DialogHeader>
        <DialogTitle>RFI Outlook draft (demo)</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">
        Draft content is generated from the active RFI template. This prototype does not launch Outlook.
      </p>
      <p v-if="vessel" class="text-sm text-muted-foreground">
        {{ vessel.vesselName }} · {{ vessel.laraVoyage }} · {{ vessel.pointCode }}
      </p>
      <div class="grid gap-3 text-sm">
        <Field>
          <FieldLabel>To</FieldLabel>
          <p class="text-sm leading-snug">{{ rfiDraft.to || '—' }}</p>
        </Field>
        <Field>
          <FieldLabel>CC</FieldLabel>
          <p class="text-sm leading-snug">{{ rfiDraft.cc || '—' }}</p>
        </Field>
        <Field>
          <FieldLabel>Subject</FieldLabel>
          <p class="text-sm leading-snug">{{ rfiDraft.subject || '—' }}</p>
        </Field>
        <Field>
          <FieldLabel>Body</FieldLabel>
          <pre class="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{{ rfiDraft.body }}</pre>
        </Field>
      </div>
      <DialogFooter>
        <Button variant="default" @click="finish">Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog :open="fileOpen" @update:open="onUtilityOpen">
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Generated file name</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">Copy the standardized SLC/SDC filename for download use.</p>
      <code class="block rounded-md bg-muted p-3 text-sm break-all">{{ generatedFile }}</code>
      <DialogFooter>
        <Button variant="default" @click="copyGeneratedFile">Copy</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
