<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { X } from '@lucide/vue'

import { isMenuItemActive, menuItems } from '@/navigation/menu'
import { useSessionStore } from '@/stores/session'
import { useTabsStore } from '@/stores/tabs'

type ScrollPoint = { top: number; left: number }

const route = useRoute()
const router = useRouter()
const tablistRef = ref<HTMLElement | null>(null)
const session = useSessionStore()
const tabs = useTabsStore()
const pageScroll = new Map<string, { main: ScrollPoint; panes: Record<string, ScrollPoint> }>()
let pageScrollKey = ''

function scrollActiveTabIntoView() {
  const list = tablistRef.value
  if (!list) return
  const active = list.querySelector<HTMLElement>('[aria-selected="true"]')
  if (!active) return
  const listRect = list.getBoundingClientRect()
  const tabRect = active.getBoundingClientRect()
  if (tabRect.left < listRect.left) {
    list.scrollLeft -= listRect.left - tabRect.left + 8
  } else if (tabRect.right > listRect.right) {
    list.scrollLeft += tabRect.right - listRect.right + 8
  }
}

function scrollPaneKey(main: HTMLElement, el: HTMLElement) {
  const parts: string[] = []
  let node: HTMLElement | null = el
  while (node && node !== main) {
    const parent: HTMLElement | null = node.parentElement
    if (!parent) break
    const index = Array.prototype.indexOf.call(parent.children, node)
    parts.push(`${node.dataset.slot ?? node.tagName.toLowerCase()}:${index}`)
    node = parent
  }
  return parts.reverse().join('>')
}

function scrollPanes(main: HTMLElement) {
  return [...main.querySelectorAll<HTMLElement>('*')].filter((el) => {
    const style = getComputedStyle(el)
    return style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowY === 'auto' || style.overflowY === 'scroll'
  })
}

function savePageScroll(key: string) {
  const main = document.getElementById('main-content')
  if (!main) return
  const panes: Record<string, ScrollPoint> = {}
  for (const el of scrollPanes(main)) {
    panes[scrollPaneKey(main, el)] = { top: el.scrollTop, left: el.scrollLeft }
  }
  pageScroll.set(key, {
    main: { top: main.scrollTop, left: main.scrollLeft },
    panes,
  })
}

function restorePageScroll(key: string) {
  const main = document.getElementById('main-content')
  if (!main) return
  const saved = pageScroll.get(key)
  main.scrollTop = saved?.main.top ?? 0
  main.scrollLeft = saved?.main.left ?? 0
  for (const el of scrollPanes(main)) {
    const point = saved?.panes[scrollPaneKey(main, el)]
    el.scrollTop = point?.top ?? 0
    el.scrollLeft = point?.left ?? 0
  }
}

function scrollKeyFor(path: string) {
  const tab = tabs.tabs.find((item) => item.id === path)
  return tab?.cacheKey ?? path
}

watch(
  () => route.fullPath,
  async () => {
    if (pageScrollKey && tabs.tabs.some((tab) => tab.id === pageScrollKey || tab.cacheKey === pageScrollKey)) {
      savePageScroll(pageScrollKey)
    }
    tabs.openFromRoute(route)
    const nextKey = scrollKeyFor(route.path)
    await nextTick()
    restorePageScroll(nextKey)
    requestAnimationFrame(() => {
      if (scrollKeyFor(route.path) === nextKey) restorePageScroll(nextKey)
    })
    pageScrollKey = nextKey
    scrollActiveTabIntoView()
  },
  { immediate: true, flush: 'pre' },
)

function cacheKey() {
  const tab = tabs.tabs.find((item) => item.id === route.path)
  return tab?.cacheKey ?? route.path
}

function closeTab(id: string) {
  const tab = tabs.tabs.find((item) => item.id === id)
  const next = tabs.close(id, route.fullPath)
  pageScroll.delete(id)
  if (tab?.cacheKey) pageScroll.delete(tab.cacheKey)
  if (next) void router.push(next)
}

const flush = computed(() => route.meta.flush === true)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <header class="flex h-16 shrink-0 items-center justify-between gap-2 bg-brand-navy px-4 text-white">
      <RouterLink to="/search" class="flex min-w-0 items-center gap-2.5" aria-label="Vessel schedule platform">
        <span class="inline-flex flex-col">
          <span class="text-base font-bold leading-none tracking-wide">VSP</span>
          <span class="mt-1 h-0.5 w-full bg-brand-red" aria-hidden="true" />
        </span>
        <span class="hidden truncate text-sm font-medium text-white/80 sm:inline">Vessel schedule</span>
      </RouterLink>

      <div class="flex min-w-0 items-center gap-2 sm:gap-3">
        <div class="hidden items-center gap-2 md:flex">
          <span class="max-w-40 truncate text-sm">{{ session.username }}</span>
          <span
            class="grid size-7 place-items-center rounded-full bg-white/15 text-xs font-semibold"
            aria-hidden="true"
          >
            {{ session.username.slice(0, 1) }}
          </span>
        </div>
      </div>
    </header>

    <nav class="flex h-12 min-w-0 shrink-0 items-end gap-1 overflow-x-auto border-b bg-card px-4" aria-label="Modules">
      <RouterLink
        v-for="item in menuItems"
        :key="item.to"
        :to="item.to"
        class="inline-flex h-9 shrink-0 items-center border-b-2 px-2.5 text-sm font-medium transition-colors"
        :class="
          isMenuItemActive(item, route.path)
            ? 'border-foreground text-foreground'
            : 'border-transparent text-foreground/60 hover:text-foreground'
        "
      >
        {{ item.label }}
      </RouterLink>
    </nav>

    <div
      ref="tablistRef"
      class="min-w-0 w-full shrink-0 overflow-x-auto border-b bg-muted/40"
      role="tablist"
      aria-label="Open pages"
    >
      <div class="flex h-10 w-max min-w-full items-end gap-1 px-2">
        <div
          v-for="tab in tabs.tabs"
          :key="tab.id"
          class="flex h-8 max-w-56 shrink-0 items-center rounded-t-md border border-b-0 px-2 text-sm"
          :class="route.path === tab.id ? 'bg-card font-medium text-foreground' : 'border-transparent text-muted-foreground'"
          role="tab"
          :aria-selected="route.path === tab.id"
        >
          <button type="button" class="truncate" @click="router.push(tab.fullPath)">
            {{ tab.title }}
          </button>
          <button
            v-if="tab.closable"
            type="button"
            class="ml-1 grid size-4 place-items-center rounded-sm hover:bg-muted"
            :aria-label="`Close ${tab.title}`"
            @click="closeTab(tab.id)"
          >
            <X class="size-3" />
          </button>
        </div>
      </div>
    </div>

    <main
      id="main-content"
      class="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-auto bg-card"
      :class="flush ? 'px-4' : 'px-4 py-4 sm:px-6'"
    >
      <RouterView v-slot="{ Component }">
        <KeepAlive :max="12">
          <component :is="Component" :key="cacheKey()" />
        </KeepAlive>
      </RouterView>
    </main>
  </div>
</template>
