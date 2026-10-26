<script setup lang="ts">
import { computed, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'

import { brandFromVoyage } from '@/domain/lara-brand'

import SearchSelect from '@/components/SearchSelect.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DateTimePicker } from '@/components/ui/date-picker'
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
  /** When set, dialog edits an existing manual vessel. */
  vessel?: VesselRecord | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [vessel: VesselRecord]
}>()

const store = useVesselStore()
const coverage = useTerminalCoverageStore()
const editing = computed(() => Boolean(props.vessel?.createdManually))
const title = computed(() => (editing.value ? 'Edit vessel' : 'Add vessel'))

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

/** Only surface validation after the user tries to submit. */
function fieldError(name: keyof typeof errors.value) {
  if (submitCount.value < 1) return undefined
  return errors.value[name]
}

function setValue(
  name: keyof typeof emptyValues,
  value: string,
) {
  setFieldValue(name, value as never, false)
}

const pointCodeOptions = computed(() =>
  coverage.ports.filter((port) => port.active || port.portCode === values.pointCode),
)

function brandOf(vessel: VesselRecord): LaraBrand | undefined {
  const derived = brandFromVoyage(vessel.laraVoyage)
  if (LARA_BRANDS.includes(derived as LaraBrand)) return derived as LaraBrand
  if (LARA_BRANDS.includes(vessel.brand as LaraBrand)) return vessel.brand as LaraBrand
  return undefined
}

watch(
  () => [props.open, props.vessel?.id] as const,
  ([open]) => {
    if (!open) return
    if (props.vessel?.createdManually) {
      const v = props.vessel
      resetForm({
        values: {
          voyage: v.laraVoyage,
          visitNo: v.visitNo || '1',
          vesselName: v.vesselName,
          pointCode: v.pointCode,
          brand: brandOf(v),
          service: v.service,
          laraPoolLocation: v.laraPoolLocation,
          eta: datetimeInputValue(v.laraEta),
          etb: datetimeInputValue(v.laraEtb),
          etd: datetimeInputValue(v.laraEtd),
          remark: v.laraLinked ? '' : v.remark?.startsWith('Manually added') ? '' : (v.remark ?? ''),
        },
        errors: {},
        touched: {},
        submitCount: 0,
      })
      return
    }
    resetForm({
      values: { ...emptyValues },
      errors: {},
      touched: {},
      submitCount: 0,
    })
  },
)

const onSubmit = handleSubmit((form) => {
  const visitNo = editing.value ? props.vessel?.visitNo || '1' : '1'
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
  if (editing.value && props.vessel) {
    if (!store.updateManualVessel(props.vessel.id, payload)) return
    toast.success('Vessel updated')
    emit('update:open', false)
    return
  }
  const created = store.addManualVessel(payload)
  if (!created) return
  toast.success('Vessel created')
  emit('created', created)
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
      <p class="text-sm">
        Create a schedule row when the vessel is at the terminal but LARA has no voyage yet. A matching formal schedule uses the same voyage, point code, pool location, and visit no.
      </p>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field :data-invalid="fieldError('voyage') ? true : undefined">
          <FieldLabel>Voyage</FieldLabel>
          <Input
            :model-value="values.voyage"
            class="h-8"
            @update:model-value="setValue('voyage', String($event))"
          />
          <FieldError v-if="fieldError('voyage')">{{ fieldError('voyage') }}</FieldError>
        </Field>

        <Field :data-invalid="fieldError('vesselName') ? true : undefined">
          <FieldLabel>Vessel name</FieldLabel>
          <Input
            :model-value="values.vesselName"
            class="h-8"
            @update:model-value="setValue('vesselName', String($event))"
          />
          <FieldError v-if="fieldError('vesselName')">{{ fieldError('vesselName') }}</FieldError>
        </Field>

        <Field :data-invalid="fieldError('pointCode') ? true : undefined">
          <FieldLabel>Point code</FieldLabel>
          <SearchSelect
            :model-value="values.pointCode"
            :options="pointCodeOptions.map((port) => ({ value: port.portCode, label: `${port.portCode} · ${port.portName}` }))"
            placeholder="Select point code"
            search-placeholder="Search point code"
            @update:model-value="setValue('pointCode', $event)"
          />
          <FieldError v-if="fieldError('pointCode')">{{ fieldError('pointCode') }}</FieldError>
        </Field>

        <Field :data-invalid="fieldError('brand') ? true : undefined">
          <FieldLabel>Brand</FieldLabel>
          <Select
            :model-value="values.brand || undefined"
            @update:model-value="(v) => setValue('brand', String(v ?? ''))"
          >
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Select brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="brand in LARA_BRANDS" :key="brand" :value="brand">
                {{ brand }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FieldError v-if="fieldError('brand')">{{ fieldError('brand') }}</FieldError>
        </Field>

        <Field :data-invalid="fieldError('service') ? true : undefined">
          <FieldLabel>Service</FieldLabel>
          <Input
            :model-value="values.service"
            class="h-8"
            @update:model-value="setValue('service', String($event))"
          />
          <FieldError v-if="fieldError('service')">{{ fieldError('service') }}</FieldError>
        </Field>

        <Field :data-invalid="fieldError('laraPoolLocation') ? true : undefined">
          <FieldLabel>Pool location</FieldLabel>
          <Input
            :model-value="values.laraPoolLocation"
            class="h-8"
            @update:model-value="setValue('laraPoolLocation', String($event))"
          />
          <FieldError v-if="fieldError('laraPoolLocation')">{{ fieldError('laraPoolLocation') }}</FieldError>
        </Field>

        <Field :data-invalid="fieldError('eta') ? true : undefined">
          <FieldLabel>ETA</FieldLabel>
          <DateTimePicker
            :model-value="values.eta"
            class="w-full"
            @update:model-value="setValue('eta', $event ?? '')"
          />
          <FieldError v-if="fieldError('eta')">{{ fieldError('eta') }}</FieldError>
        </Field>

        <Field :data-invalid="fieldError('etb') ? true : undefined">
          <FieldLabel>ETB</FieldLabel>
          <DateTimePicker
            :model-value="values.etb"
            class="w-full"
            @update:model-value="setValue('etb', $event ?? '')"
          />
          <FieldError v-if="fieldError('etb')">{{ fieldError('etb') }}</FieldError>
        </Field>

        <Field :data-invalid="fieldError('etd') ? true : undefined">
          <FieldLabel>ETD</FieldLabel>
          <DateTimePicker
            :model-value="values.etd"
            class="w-full"
            @update:model-value="setValue('etd', $event ?? '')"
          />
          <FieldError v-if="fieldError('etd')">{{ fieldError('etd') }}</FieldError>
        </Field>

        <Field class="sm:col-span-2 lg:col-span-3">
          <FieldLabel>Remark</FieldLabel>
          <Textarea
            :model-value="values.remark"
            placeholder="Why this vessel is added manually"
            @update:model-value="setValue('remark', String($event))"
          />
        </Field>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" @click="close">Cancel</Button>
        <Button type="button" variant="primary" @click="onSubmit">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
