<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import DataSection from '@/components/DataSection.vue'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import ReadonlyField from '@/components/ReadonlyField.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { terminalVoyageText } from '@/features/terminal-voyage/columns'
import {
  TERMINAL_VOYAGE_COLUMNS,
  findTerminalVoyage,
} from '@/features/terminal-voyage/model'
import { useVesselStore } from '@/stores/vessels'

const route = useRoute()
const store = useVesselStore()

const row = computed(() => findTerminalVoyage(store.vessels, String(route.params.id)))
const title = computed(() => row.value?.vesselNameEn || row.value?.vesselNameCn || 'Terminal voyage')
</script>

<template>
  <div v-if="row" class="space-y-4">
    <PageBreadcrumb
      :items="[
        { label: 'Terminal voyage', to: '/terminal-voyages' },
        { label: title },
      ]"
    />
    <DataSection title="Terminal">
      <dl>
        <ReadonlyField
          v-for="column in TERMINAL_VOYAGE_COLUMNS"
          :key="column.id"
          layout="row"
          :label="column.label"
          :value="terminalVoyageText(row, column.id)"
        />
      </dl>
    </DataSection>
  </div>
  <Alert v-else variant="warning">
    <AlertDescription>This terminal voyage was not found.</AlertDescription>
  </Alert>
</template>
