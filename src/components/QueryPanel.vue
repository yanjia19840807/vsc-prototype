<script setup lang="ts">
import { Button } from '@/components/ui/button'

withDefaults(
  defineProps<{
    title?: string
    searchVariant?: 'primary' | 'outline'
  }>(),
  { searchVariant: 'primary' },
)

const emit = defineEmits<{
  search: []
  clear: []
}>()

function onSubmit(e: Event) {
  e.preventDefault()
  emit('search')
}
</script>

<template>
  <section>
    <form class="flex flex-wrap items-center gap-2" @submit="onSubmit">
      <slot />
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" @click="emit('clear')">Clear</Button>
        <Button type="submit" :variant="searchVariant">Search</Button>
        <slot name="actions" />
      </div>
    </form>
  </section>
</template>
