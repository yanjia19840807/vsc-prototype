<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export type BreadcrumbCrumb = {
  label: string
  to?: string
}

const props = defineProps<{
  items: BreadcrumbCrumb[]
}>()

/** Virtual root level shared by every page. */
const crumbs = computed<BreadcrumbCrumb[]>(() => [
  { label: 'Home', to: '/' },
  ...props.items,
])
</script>

<template>
  <Breadcrumb>
    <BreadcrumbList>
      <template v-for="(item, index) in crumbs" :key="`${item.label}-${index}`">
        <BreadcrumbSeparator v-if="index > 0" />
        <BreadcrumbItem>
          <BreadcrumbPage v-if="index === crumbs.length - 1 || !item.to">
            {{ item.label }}
          </BreadcrumbPage>
          <BreadcrumbLink v-else as-child>
            <RouterLink :to="item.to">{{ item.label }}</RouterLink>
          </BreadcrumbLink>
        </BreadcrumbItem>
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>
