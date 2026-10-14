<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus } from '@lucide/vue'
import { toast } from 'vue-sonner'

import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import StatusBadge from '@/components/StatusBadge.vue'
import DeleteRegionDialog from '@/features/terminal-coverage/DeleteRegionDialog.vue'
import {
  regionFieldErrors,
  type RegionFieldErrors,
  type RegionRecord,
} from '@/features/terminal-coverage/model'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'

const open = defineModel<boolean>('open', { required: true })

const store = useTerminalCoverageStore()
const mode = ref<'idle' | 'create' | 'edit'>('idle')
const editingCode = ref('')
const draft = ref<RegionRecord>({ code: '', name: '', active: true })
const submitted = ref(false)
const deleteOpen = ref(false)
const deleting = ref<RegionRecord | null>(null)

const fieldErrors = computed<RegionFieldErrors>(() => {
  if (!submitted.value) return {}
  return regionFieldErrors(draft.value, store.regions, mode.value === 'edit' ? editingCode.value : undefined)
})

function portCount(code: string) {
  return store.ports.filter((port) => port.regionCode === code).length
}

function resetEditor() {
  mode.value = 'idle'
  editingCode.value = ''
  draft.value = { code: '', name: '', active: true }
  submitted.value = false
}

function startCreate() {
  if (mode.value !== 'idle') return
  mode.value = 'create'
  editingCode.value = ''
  draft.value = { code: '', name: '', active: true }
  submitted.value = false
}

function startEdit(region: RegionRecord) {
  if (mode.value !== 'idle') return
  mode.value = 'edit'
  editingCode.value = region.code
  draft.value = { code: region.code, name: region.name, active: region.active }
  submitted.value = false
}

function saveDraft() {
  submitted.value = true
  const errors = regionFieldErrors(draft.value, store.regions, mode.value === 'edit' ? editingCode.value : undefined)
  if (errors.code || errors.name) return
  const creating = mode.value === 'create'
  store.saveRegion(draft.value, creating ? undefined : editingCode.value)
  toast.success(creating ? 'Region added' : 'Region updated')
  resetEditor()
}

function openDelete(region: RegionRecord) {
  deleting.value = region
  deleteOpen.value = true
  if (mode.value === 'edit' && editingCode.value === region.code) resetEditor()
}

function onOpenChange(value: boolean) {
  open.value = value
  if (!value) resetEditor()
}

function keepNested(event: Event) {
  if (deleteOpen.value) {
    event.preventDefault()
    return
  }
  const target = event.target
  if (target instanceof Element && target.closest('[data-slot="dialog-content"], [data-slot="dialog-overlay"]')) {
    event.preventDefault()
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      size="xl"
      class="max-h-[calc(100vh-4rem)] overflow-y-auto"
      @interact-outside="keepNested"
      @pointer-down-outside="keepNested"
    >
      <DialogHeader>
        <DialogTitle>Regions</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">
        Ports choose a region from this list. Deleting a region clears it on the ports and vessels that used it.
      </p>

      <div class="flex justify-end">
        <Button type="button" variant="primary" :disabled="mode !== 'idle'" @click="startCreate">
          <Plus class="size-3.5" /> Add region
        </Button>
      </div>

      <div class="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Ports</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="mode === 'create'">
              <TableCell class="whitespace-normal align-top">
                <Input v-model="draft.code" aria-label="Code" autocomplete="off" :aria-invalid="fieldErrors.code ? true : undefined" />
                <FieldError v-if="fieldErrors.code" class="mt-1">{{ fieldErrors.code }}</FieldError>
              </TableCell>
              <TableCell class="whitespace-normal align-top">
                <Input v-model="draft.name" aria-label="Name" autocomplete="off" :aria-invalid="fieldErrors.name ? true : undefined" />
                <FieldError v-if="fieldErrors.name" class="mt-1">{{ fieldErrors.name }}</FieldError>
              </TableCell>
              <TableCell class="align-top">
                <div class="flex h-8 items-center">
                  <Switch v-model="draft.active" aria-label="Active" />
                </div>
              </TableCell>
              <TableCell class="align-top">
                <div class="flex h-8 items-center">—</div>
              </TableCell>
              <TableCell class="align-top">
                <div class="flex h-8 items-center gap-1">
                  <Button type="button" size="xs" variant="primary" @click="saveDraft">Save</Button>
                  <Button type="button" size="xs" variant="outline" @click="resetEditor">Cancel</Button>
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-for="region in store.regions" :key="region.code">
              <template v-if="mode === 'edit' && editingCode === region.code">
                <TableCell class="whitespace-normal align-top">
                  <Input :model-value="draft.code" aria-label="Code" disabled />
                </TableCell>
                <TableCell class="whitespace-normal align-top">
                  <Input v-model="draft.name" aria-label="Name" autocomplete="off" :aria-invalid="fieldErrors.name ? true : undefined" />
                  <FieldError v-if="fieldErrors.name" class="mt-1">{{ fieldErrors.name }}</FieldError>
                </TableCell>
                <TableCell class="align-top">
                  <div class="flex h-8 items-center">
                    <Switch v-model="draft.active" aria-label="Active" />
                  </div>
                </TableCell>
                <TableCell class="align-top">
                  <div class="flex h-8 items-center">{{ portCount(region.code) }}</div>
                </TableCell>
                <TableCell class="align-top">
                  <div class="flex h-8 items-center gap-1">
                    <Button type="button" size="xs" variant="primary" @click="saveDraft">Save</Button>
                    <Button type="button" size="xs" variant="outline" @click="resetEditor">Cancel</Button>
                    <Button type="button" size="xs" variant="destructive" @click="openDelete(region)">Delete</Button>
                  </div>
                </TableCell>
              </template>
              <template v-else>
                <TableCell class="font-medium">{{ region.code }}</TableCell>
                <TableCell>{{ region.name }}</TableCell>
                <TableCell>
                  <StatusBadge :status="region.active ? 'Active' : 'Inactive'" />
                </TableCell>
                <TableCell>{{ portCount(region.code) }}</TableCell>
                <TableCell>
                  <div class="flex items-center gap-1">
                    <Button type="button" size="xs" variant="outline" :disabled="mode !== 'idle'" @click="startEdit(region)">Edit</Button>
                    <Button type="button" size="xs" variant="destructive" @click="openDelete(region)">Delete</Button>
                  </div>
                </TableCell>
              </template>
            </TableRow>
            <TableEmpty v-if="!store.regions.length && mode !== 'create'" :colspan="5">No regions.</TableEmpty>
          </TableBody>
        </Table>
      </div>
    </DialogContent>
  </Dialog>

  <DeleteRegionDialog v-model:open="deleteOpen" :region="deleting" />
</template>
