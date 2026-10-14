<script setup lang="ts">
import 'vue-sonner/style.css'
import { Toaster } from '@/components/ui/sonner'
import AppShell from '@/components/layout/AppShell.vue'
</script>

<template>
  <AppShell />
  <Toaster rich-colors position="top-center" />
</template>
