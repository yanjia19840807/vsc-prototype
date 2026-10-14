<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus } from '@lucide/vue'
import { toast } from 'vue-sonner'

import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { toastFormErrors } from '@/lib/form-toast'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
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
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  clonePort,
  createTerminalId,
  emptyPort,
  normalizePort,
  portFieldErrors,
  regionLabel,
  type PortCoverage,
  type PortFieldErrors,
} from '@/features/terminal-coverage/model'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'

const props = defineProps<{
  open: boolean
  port: PortCoverage | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useTerminalCoverageStore()
const vessels = useVesselStore()
const form = ref<PortCoverage>(emptyPort())
const submitted = ref(false)
const previousCode = ref<string | undefined>()
const removeOpen = ref(false)
const removingId = ref('')

const editing = computed(() => Boolean(props.port))
const title = computed(() => (editing.value ? 'Edit port' : 'Add port'))
const emptyErrors: PortFieldErrors = { terminals: {} }
const regionOptions = computed(() => {
  const current = form.value.regionCode.trim().toUpperCase()
  return store.regions.filter((region) => region.active || region.code === current)
})
const fieldErrors = computed(() => (
  submitted.value
    ? portFieldErrors(form.value, store.ports, store.regions, previousCode.value, props.port?.regionCode)
    : emptyErrors
))

function terminalError(id: string, key: 'pool' | 'abbr') {
  return fieldErrors.value.terminals[id]?.[key]
}

watch(
  () => [props.open, props.port] as const,
  ([open]) => {
    if (!open) return
    form.value = props.port ? clonePort(props.port) : emptyPort()
    previousCode.value = props.port?.portCode
    submitted.value = false
  },
)

function addTerminal() {
  form.value.terminals.push({ id: createTerminalId(), pool: '', abbr: '', nameZh: '' })
}

function askRemoveTerminal(id: string) {
  removingId.value = id
  removeOpen.value = true
}

function confirmRemoveTerminal() {
  form.value.terminals = form.value.terminals.filter((terminal) => terminal.id !== removingId.value)
  removingId.value = ''
}

function close() {
  emit('update:open', false)
}

function save() {
  submitted.value = true
  const errors = portFieldErrors(form.value, store.ports, store.regions, previousCode.value, props.port?.regionCode)
  const messages = [
    errors.portCode,
    errors.portName,
    errors.regionCode,
    ...Object.values(errors.terminals).flatMap((row) => [row.pool, row.abbr]),
  ]
  if (messages.some(Boolean)) {
    toastFormErrors(messages)
    return
  }
  const saved = normalizePort(form.value)
  store.save(form.value, previousCode.value)
  vessels.syncRegionForPoint(saved.portCode, saved.regionCode)
  toast.success(editing.value ? 'Port updated' : 'Port added')
  close()
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent size="2xl" class="max-h-[calc(100vh-4rem)] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">
        Available ports are sent to the terminal schedule API. Terminal rows translate the returned terminal code into a 9code.
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <Field :data-invalid="fieldErrors.portCode ? true : undefined">
          <FieldLabel for="coverage-port-code">Port code</FieldLabel>
          <Input
            id="coverage-port-code"
            v-model="form.portCode"
            autocomplete="off"
            :aria-invalid="fieldErrors.portCode ? true : undefined"
          />
          <FieldError v-if="fieldErrors.portCode">{{ fieldErrors.portCode }}</FieldError>
        </Field>
        <Field :data-invalid="fieldErrors.portName ? true : undefined">
          <FieldLabel for="coverage-port-name">Port name</FieldLabel>
          <Input
            id="coverage-port-name"
            v-model="form.portName"
            autocomplete="off"
            :aria-invalid="fieldErrors.portName ? true : undefined"
          />
          <FieldError v-if="fieldErrors.portName">{{ fieldErrors.portName }}</FieldError>
        </Field>
        <Field class="sm:col-span-2" :data-invalid="fieldErrors.regionCode ? true : undefined">
          <FieldLabel>Region</FieldLabel>
          <Select
            :model-value="form.regionCode || undefined"
            @update:model-value="(value) => (form.regionCode = String(value ?? ''))"
          >
            <SelectTrigger class="w-full" :aria-invalid="fieldErrors.regionCode ? true : undefined">
              <SelectValue placeholder="Select region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="region in regionOptions" :key="region.code" :value="region.code">
                {{ regionLabel(region) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FieldError v-if="fieldErrors.regionCode">{{ fieldErrors.regionCode }}</FieldError>
        </Field>
      </div>

      <Field orientation="horizontal" class="w-fit">
        <Switch id="coverage-available" v-model="form.available" />
        <FieldLabel for="coverage-available">Available for Terminal</FieldLabel>
      </Field>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-medium">Terminals</h3>
          <Button type="button" variant="outline" @click="addTerminal">
            <Plus class="size-3.5" /> Add terminal
          </Button>
        </div>
        <div class="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Abbreviation</TableHead>
                <TableHead>Terminal 9code</TableHead>
                <TableHead>Terminal name</TableHead>
                <TableHead class="w-24"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="terminal in form.terminals" :key="terminal.id">
                <TableCell class="whitespace-normal align-top">
                  <Input
                    v-model="terminal.abbr"
                    aria-label="Abbreviation"
                    autocomplete="off"
                    :aria-invalid="terminalError(terminal.id, 'abbr') ? true : undefined"
                  />
                  <FieldError v-if="terminalError(terminal.id, 'abbr')" class="mt-1">
                    {{ terminalError(terminal.id, 'abbr') }}
                  </FieldError>
                </TableCell>
                <TableCell class="whitespace-normal align-top">
                  <Input
                    v-model="terminal.pool"
                    aria-label="Terminal 9code"
                    autocomplete="off"
                    :aria-invalid="terminalError(terminal.id, 'pool') ? true : undefined"
                  />
                  <FieldError v-if="terminalError(terminal.id, 'pool')" class="mt-1">
                    {{ terminalError(terminal.id, 'pool') }}
                  </FieldError>
                </TableCell>
                <TableCell class="align-top">
                  <Input v-model="terminal.nameZh" aria-label="Terminal name" autocomplete="off" />
                </TableCell>
                <TableCell class="align-top">
                  <Button type="button" size="xs" variant="outline" @click="askRemoveTerminal(terminal.id)">Remove</Button>
                </TableCell>
              </TableRow>
              <TableRow v-if="!form.terminals.length">
                <TableCell colspan="4" class="text-muted-foreground">
                  No terminals. An available port can still be called, and the returned code will not translate to a 9code.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" @click="close">Cancel</Button>
        <Button type="button" variant="primary" @click="save">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <ConfirmDialog
    v-model:open="removeOpen"
    title="Remove terminal"
    description="Remove this terminal row from the port?"
    confirm-label="Remove"
    @confirm="confirmRemoveTerminal"
  />
</template>
