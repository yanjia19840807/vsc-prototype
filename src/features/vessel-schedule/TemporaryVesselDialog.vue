<script setup lang="ts">
import { computed, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'

import { brandFromVoyage } from '@/domain/lara-brand'
import SearchSelect from '@/components/SearchSelect.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { isLaraLinkSource, temporaryLinkStatusLabel } from '@/features/vessel-schedule/lara-link'
import {
  addVesselSchema,
  LARA_BRANDS,
  type LaraBrand,
} from '@/features/vessel-schedule/manual-vessel-schemas'
import { datetimeInputValue, datetimeToIso } from '@/features/vessel-schedule/mismatch-fields'
import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { toastFormErrors } from '@/lib/form-toast'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

const props = defineProps<{
  open: boolean
  vesselId?: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useVesselStore()
const coverage = useTerminalCoverageStore()

const vessel = computed(() => (props.vesselId ? store.byId(props.vesselId) : undefined))
const linked = computed(() => (vessel.value ? isLaraLinkSource(vessel.value) : false))
const linkStatus = computed(() => (vessel.value ? temporaryLinkStatusLabel(vessel.value) : 'Unlink'))
const title = computed(() => (props.vesselId ? 'Edit temporary vessel' : 'New temporary vessel'))

const emptyValues = {
  voyage: '',
  visitNo: '1',
  vesselName: '',
  pointCode: '',
  brand: undefined as LaraBrand | undefined,
  service: '',
  laraPoolLocation: '',
  eta: '',
  etb: '',
  etd: '',
  remark: '',
}

const { handleSubmit, resetForm, values, setFieldValue, errors, submitCount } = useForm({
  validationSchema: addVesselSchema,
  validateOnMount: false,
  initialValues: emptyValues,
})

function fieldError(name: keyof typeof errors.value) {
  if (submitCount.value < 1) return undefined
  return errors.value[name]
}

function setValue(name: keyof typeof emptyValues, value: string) {
  if (linked.value) return
  setFieldValue(name, value as never, false)
}

const pointCodeOptions = computed(() =>
  coverage.ports.filter((port) => port.active || port.portCode === values.pointCode),
)

function brandOf(row: VesselRecord): LaraBrand | undefined {
  const derived = brandFromVoyage(row.laraVoyage)
  if (LARA_BRANDS.includes(derived as LaraBrand)) return derived as LaraBrand
  if (LARA_BRANDS.includes(row.brand as LaraBrand)) return row.brand as LaraBrand
  return undefined
}

watch(
  () => [props.open, props.vesselId, vessel.value?.laraVoyage] as const,
  ([open]) => {
    if (!open) return
    const row = vessel.value
    if (!props.vesselId || !row) {
      resetForm({ values: { ...emptyValues }, errors: {}, touched: {}, submitCount: 0 })
      return
    }
    resetForm({
      values: {
        voyage: row.laraVoyage,
        visitNo: row.visitNo || '1',
        vesselName: row.vesselName,
        pointCode: row.pointCode,
        brand: brandOf(row),
        service: row.service,
        laraPoolLocation: row.laraPoolLocation,
        eta: datetimeInputValue(row.laraEta),
        etb: datetimeInputValue(row.laraEtb),
        etd: datetimeInputValue(row.laraEtd),
        remark: row.remark ?? '',
      },
      errors: {},
      touched: {},
      submitCount: 0,
    })
  },
)

const onSubmit = handleSubmit((form) => {
  if (linked.value) return
  const visitNo = vessel.value?.visitNo || '1'
  const payload = {
    voyage: form.voyage.trim(),
    visitNo,
    vesselName: form.vesselName.trim(),
    pointCode: form.pointCode,
    brand: form.brand,
    service: form.service.trim(),
    laraPoolLocation: form.laraPoolLocation.trim(),
    eta: datetimeToIso(form.eta),
    etb: datetimeToIso(form.etb),
    etd: datetimeToIso(form.etd),
    remark: form.remark?.trim() ?? '',
  }
  if (vessel.value) {
    if (!store.updateManualVessel(vessel.value.id, payload)) return
    toast.success('Temporary vessel updated')
  } else {
    const created = store.addManualVessel(payload)
    if (!created) return
    toast.success('Temporary vessel created. Terminal data was synced.')
  }
  emit('update:open', false)
}, ({ errors: formErrors }) => {
  toastFormErrors(formErrors, [
    'voyage',
    'visitNo',
    'vesselName',
    'pointCode',
    'brand',
    'service',
    'laraPoolLocation',
    'eta',
    'etb',
    'etd',
  ])
})
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
      <p class="text-sm">
        Saving a new row syncs terminal data immediately. A matching formal schedule uses the same voyage, point code, pool location, and visit no.
      </p>

      <Alert v-if="vesselId && !vessel">
        <AlertDescription>This temporary vessel is no longer available.</AlertDescription>
      </Alert>
      <Alert v-else-if="linked">
        <AlertDescription>
          This temporary vessel is linked. It stays out of vessel schedule search and can only be viewed.
        </AlertDescription>
      </Alert>

      <div v-if="!vesselId || vessel" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field>
          <FieldLabel>Link status</FieldLabel>
          <div class="flex h-8 items-center">
            <StatusBadge :status="linkStatus" />
          </div>
        </Field>
        <Field :data-invalid="fieldError('voyage') ? true : undefined">
          <FieldLabel>Voyage</FieldLabel>
          <Input :model-value="values.voyage" class="h-8" :disabled="linked" @update:model-value="setValue('voyage', String($event))" />
          <FieldError v-if="fieldError('voyage')">{{ fieldError('voyage') }}</FieldError>
        </Field>
        <Field :data-invalid="fieldError('vesselName') ? true : undefined">
          <FieldLabel>Vessel name</FieldLabel>
          <Input :model-value="values.vesselName" class="h-8" :disabled="linked" @update:model-value="setValue('vesselName', String($event))" />
          <FieldError v-if="fieldError('vesselName')">{{ fieldError('vesselName') }}</FieldError>
        </Field>
        <Field :data-invalid="fieldError('pointCode') ? true : undefined">
          <FieldLabel>Point code</FieldLabel>
          <SearchSelect
            :model-value="values.pointCode"
            :disabled="linked"
            :options="pointCodeOptions.map((port) => ({ value: port.portCode, label: `${port.portCode} · ${port.portName}` }))"
            placeholder="Select point code"
            search-placeholder="Search point code"
            @update:model-value="setValue('pointCode', $event)"
          />
          <FieldError v-if="fieldError('pointCode')">{{ fieldError('pointCode') }}</FieldError>
        </Field>
        <Field :data-invalid="fieldError('brand') ? true : undefined">
          <FieldLabel>Brand</FieldLabel>
          <Select :model-value="values.brand || undefined" :disabled="linked" @update:model-value="(value) => setValue('brand', String(value ?? ''))">
            <SelectTrigger class="w-full"><SelectValue placeholder="Select brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="brand in LARA_BRANDS" :key="brand" :value="brand">{{ brand }}</SelectItem>
            </SelectContent>
          </Select>
          <FieldError v-if="fieldError('brand')">{{ fieldError('brand') }}</FieldError>
        </Field>
        <Field :data-invalid="fieldError('service') ? true : undefined">
          <FieldLabel>Service</FieldLabel>
          <Input :model-value="values.service" class="h-8" :disabled="linked" @update:model-value="setValue('service', String($event))" />
          <FieldError v-if="fieldError('service')">{{ fieldError('service') }}</FieldError>
        </Field>
        <Field :data-invalid="fieldError('laraPoolLocation') ? true : undefined">
          <FieldLabel>Pool location</FieldLabel>
          <Input :model-value="values.laraPoolLocation" class="h-8" :disabled="linked" @update:model-value="setValue('laraPoolLocation', String($event))" />
          <FieldError v-if="fieldError('laraPoolLocation')">{{ fieldError('laraPoolLocation') }}</FieldError>
        </Field>
        <Field :data-invalid="fieldError('eta') ? true : undefined">
          <FieldLabel>ETA</FieldLabel>
          <DateTimePicker :model-value="values.eta" class="w-full" @update:model-value="setValue('eta', $event ?? '')" />
          <FieldError v-if="fieldError('eta')">{{ fieldError('eta') }}</FieldError>
        </Field>
        <Field :data-invalid="fieldError('etb') ? true : undefined">
          <FieldLabel>ETB</FieldLabel>
          <DateTimePicker :model-value="values.etb" class="w-full" @update:model-value="setValue('etb', $event ?? '')" />
          <FieldError v-if="fieldError('etb')">{{ fieldError('etb') }}</FieldError>
        </Field>
        <Field :data-invalid="fieldError('etd') ? true : undefined">
          <FieldLabel>ETD</FieldLabel>
          <DateTimePicker :model-value="values.etd" class="w-full" @update:model-value="setValue('etd', $event ?? '')" />
          <FieldError v-if="fieldError('etd')">{{ fieldError('etd') }}</FieldError>
        </Field>
        <Field class="sm:col-span-2 lg:col-span-3">
          <FieldLabel>Remark</FieldLabel>
          <Textarea :model-value="values.remark" :disabled="linked" placeholder="Why this vessel is added manually" @update:model-value="setValue('remark', String($event))" />
        </Field>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button v-if="!linked && (!vesselId || vessel)" type="button" variant="primary" @click="onSubmit">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
