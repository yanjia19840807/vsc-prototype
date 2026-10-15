<script setup lang="ts">
import { computed, watch } from 'vue'
import { useForm } from 'vee-validate'
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
  LARA_VESSEL_TYPES,
  type LaraBrand,
  type LaraVesselType,
  type LaraVoyageStatus,
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
  vesselName: '',
  pointCode: '',
  vesselType: 'Group vsl' as LaraVesselType,
  brand: undefined as LaraBrand | undefined,
  service: '',
  poolLocation: '',
  etb: '',
  etd: '',
  voyageStatus: 'Active' as LaraVoyageStatus,
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
  if (LARA_BRANDS.includes(vessel.brand as LaraBrand)) return vessel.brand as LaraBrand
  return undefined
}

function vesselTypeOf(vessel: VesselRecord): LaraVesselType {
  if (vessel.groupKind === 'Partner Vessel') return 'Partner vsl'
  if (vessel.groupKind === '3PF') return '3PF'
  return 'Group vsl'
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
          vesselName: v.vesselName,
          pointCode: v.pointCode,
          vesselType: vesselTypeOf(v),
          brand: brandOf(v),
          service: v.service,
          poolLocation: v.poolLocation,
          etb: datetimeInputValue(v.laraEtb),
          etd: datetimeInputValue(v.laraEtd),
          voyageStatus: v.voyageStatus === 'Omit' ? 'Omit' : 'Active',
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
  const payload = {
    voyage: form.voyage.trim(),
    vesselName: form.vesselName.trim(),
    pointCode: form.pointCode,
    vesselType: form.vesselType,
    brand: form.brand,
    service: form.service.trim(),
    poolLocation: form.poolLocation.trim(),
    etb: datetimeToIso(form.etb),
    etd: datetimeToIso(form.etd),
    voyageStatus: form.voyageStatus,
    remark: form.remark?.trim() ?? '',
  }
  if (editing.value && props.vessel) {
    store.updateManualVessel(props.vessel.id, payload)
    toast.success('Vessel updated')
    emit('update:open', false)
    return
  }
  const created = store.addManualVessel(payload)
  toast.success('Vessel created')
  emit('created', created)
  emit('update:open', false)
}, ({ errors: formErrors }) => {
  toastFormErrors(formErrors, [
    'voyage',
    'vesselName',
    'pointCode',
    'vesselType',
    'brand',
    'service',
    'poolLocation',
    'etb',
    'etd',
    'voyageStatus',
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
        Create a schedule row when the vessel is at the terminal but LARA has no voyage yet. Manual vessel records stay after sync. Link to LARA later when the formal voyage appears to avoid duplicates.
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
          <Select
            :model-value="values.pointCode || undefined"
            @update:model-value="(v) => setValue('pointCode', String(v ?? ''))"
          >
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Select point code" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="port in pointCodeOptions" :key="port.portCode" :value="port.portCode">
                {{ port.portCode }} · {{ port.portName }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FieldError v-if="fieldError('pointCode')">{{ fieldError('pointCode') }}</FieldError>
        </Field>

        <Field :data-invalid="fieldError('vesselType') ? true : undefined">
          <FieldLabel>Vessel type</FieldLabel>
          <Select
            :model-value="values.vesselType"
            @update:model-value="(v) => setValue('vesselType', String(v ?? 'Group vsl'))"
          >
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="type in LARA_VESSEL_TYPES" :key="type" :value="type">
                {{ type }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FieldError v-if="fieldError('vesselType')">{{ fieldError('vesselType') }}</FieldError>
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

        <Field :data-invalid="fieldError('poolLocation') ? true : undefined">
          <FieldLabel>Pool location</FieldLabel>
          <Input
            :model-value="values.poolLocation"
            class="h-8"
            @update:model-value="setValue('poolLocation', String($event))"
          />
          <FieldError v-if="fieldError('poolLocation')">{{ fieldError('poolLocation') }}</FieldError>
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

        <Field>
          <FieldLabel>Voyage status</FieldLabel>
          <Input :model-value="values.voyageStatus || 'Active'" class="h-8" disabled />
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
