<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ActivityLogBrowser from '@/features/vessel-schedule/ActivityLogBrowser.vue'
import { useVesselStore } from '@/stores/vessels'

const route = useRoute()
const router = useRouter()
const store = useVesselStore()
const vessel = computed(() => store.byId(String(route.params.id)))
const field = computed(() => (typeof route.query.field === 'string' ? route.query.field : ''))

function clearField() {
  if (route.query.field) void router.replace({ path: route.path, query: {} })
}
</script>

<template>
  <div v-if="vessel" class="space-y-4">
    <PageBreadcrumb
      :items="[
        { label: 'Vessel schedule search', to: '/search' },
        { label: vessel.vesselName, to: `/vessels/${vessel.id}/view` },
        { label: 'Activity logs' },
      ]"
    />
    <p class="text-sm text-muted-foreground">{{ vessel.pointCode }} · {{ vessel.laraVoyage }}</p>
    <ActivityLogBrowser :vessel="vessel" :field="field" @clear="clearField" />
  </div>
  <Alert v-else variant="warning">
    <AlertDescription>This schedule record is no longer available.</AlertDescription>
  </Alert>
</template>
