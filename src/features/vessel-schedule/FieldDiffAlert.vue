<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'

defineProps<{
  previous: string
  current: string
}>()
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="inline-flex size-5 items-center justify-center rounded-sm text-sky-700"
          aria-label="Previous and current"
          @click.stop
        >
          <TriangleAlert class="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="bottom"
          :side-offset="6"
          class="z-50 w-72 max-w-(--reka-tooltip-content-available-width) rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <p class="mb-2 font-medium">This change</p>
          <table class="w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr class="text-xs text-muted-foreground">
                <th class="border-b pb-1 pr-3 font-medium" scope="col" />
                <th class="border-b pb-1 font-medium" scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th class="border-b py-1.5 pr-3 font-medium text-muted-foreground" scope="row">Previous</th>
                <td class="border-b py-1.5">{{ previous }}</td>
              </tr>
              <tr>
                <th class="py-1.5 pr-3 font-medium text-muted-foreground" scope="row">Current</th>
                <td class="py-1.5">{{ current }}</td>
              </tr>
            </tbody>
          </table>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
