<script setup lang="ts">
import DataSection from '@/components/DataSection.vue'
import ReadonlyField from '@/components/ReadonlyField.vue'
import { searchCellText } from '@/features/vessel-search/search-columns'
import { LARA_COLUMNS } from '@/features/vessel-schedule/mismatch-fields'
import type { VesselRecord } from '@/types/vsc'

defineProps<{
  vessel: VesselRecord
}>()
</script>

<template>
  <DataSection title="LARA" class="min-w-0">
    <dl class="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
      <ReadonlyField
        v-for="column in LARA_COLUMNS"
        :key="column.id"
        :label="column.label"
        :value="searchCellText(vessel, column.id)"
      />
    </dl>
  </DataSection>
</template>
