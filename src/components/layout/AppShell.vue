<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { X } from '@lucide/vue'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { isMenuItemActive, menuItems } from '@/navigation/menu'
import { useSessionStore } from '@/stores/session'
import { useTabsStore, type PageTab } from '@/stores/tabs'

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

function forgetScroll(closed: PageTab[]) {
  for (const tab of closed) {
    pageScroll.delete(tab.id)
    if (tab.cacheKey) pageScroll.delete(tab.cacheKey)
  }
}

function settleClose(closed: PageTab[], next: string | null) {
  forgetScroll(closed)
  if (next) void router.push(next)
}

function closeTab(id: string) {
  const tab = tabs.tabs.find((item) => item.id === id)
  settleClose(tab ? [tab] : [], tabs.close(id, route.fullPath))
}

function closeOtherTabs(id: string) {
  const closed = tabs.tabs.filter((tab) => tab.closable && tab.id !== id)
  settleClose(closed, tabs.closeOthers(id, route.fullPath))
}

function closeTabsToRight(id: string) {
  const index = tabs.tabs.findIndex((tab) => tab.id === id)
  const closed = index < 0 ? [] : tabs.tabs.slice(index + 1).filter((tab) => tab.closable)
  settleClose(closed, tabs.closeToRight(id, route.fullPath))
}

function closeAllTabs() {
  settleClose(tabs.tabs.filter((tab) => tab.closable), tabs.closeAll(route.fullPath))
}

function canCloseOthers(id: string) {
  return tabs.tabs.some((tab) => tab.closable && tab.id !== id)
}

function canCloseToRight(index: number) {
  return tabs.tabs.slice(index + 1).some((tab) => tab.closable)
}

const canCloseAll = computed(() => tabs.tabs.some((tab) => tab.closable))

const draggingId = ref<string | null>(null)
const dropIndex = ref<number | null>(null)
let ignoreDrag = false

function clearDrag() {
  draggingId.value = null
  dropIndex.value = null
  ignoreDrag = false
}

function onClosePointerDown() {
  ignoreDrag = true
}

function onClosePointerUp() {
  ignoreDrag = false
}

function onDragStart(event: DragEvent, tab: PageTab) {
  if (ignoreDrag || !tab.closable) {
    event.preventDefault()
    ignoreDrag = false
    return
  }
  draggingId.value = tab.id
  dropIndex.value = null
  event.dataTransfer?.setData('text/plain', tab.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent, index: number) {
  if (!draggingId.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const after = event.clientX >= rect.left + rect.width / 2
  const insertAt = Math.max(1, index + (after ? 1 : 0))
  dropIndex.value = insertAt
}

function showInsertBefore(index: number) {
  const insertAt = dropIndex.value
  const from = tabs.tabs.findIndex((tab) => tab.id === draggingId.value)
  if (insertAt == null || from < 0) return false
  if (from === insertAt || from + 1 === insertAt) return false
  return insertAt === index
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  const id = draggingId.value
  const insertAt = dropIndex.value
  if (id != null && insertAt != null) tabs.move(id, insertAt)
  clearDrag()
}

const flush = computed(() => route.meta.flush === true)
const copyrightYear = new Date().getFullYear()
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <header class="flex h-16 shrink-0 items-center justify-between gap-2 bg-brand-navy px-4 text-white">
      <RouterLink to="/search" class="flex min-w-0 items-center gap-2.5" aria-label="Vessel Schedule Center">
        <span class="inline-flex flex-col">
          <span class="text-base font-bold leading-none tracking-wide">VSC</span>
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
            ? 'border-brand-red text-foreground'
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
      @dragover.prevent
      @drop="onDrop"
    >
      <div class="flex h-10 w-max min-w-full items-end gap-1 px-2">
        <ContextMenu v-for="(tab, index) in tabs.tabs" :key="tab.id">
          <ContextMenuTrigger as-child>
            <div
              class="relative flex h-8 max-w-56 shrink-0 items-center rounded-t-md border border-b-0 px-2 text-sm"
              :class="[
                route.path === tab.id ? 'bg-card font-medium text-foreground' : 'border-transparent text-muted-foreground',
                draggingId === tab.id ? 'opacity-40' : '',
                tab.closable ? 'cursor-grab active:cursor-grabbing' : '',
              ]"
              role="tab"
              :aria-selected="route.path === tab.id"
              :draggable="tab.closable ? true : undefined"
              @dragstart="onDragStart($event, tab)"
              @dragend="clearDrag"
              @dragover="onDragOver($event, index)"
            >
              <span
                v-if="showInsertBefore(index)"
                class="pointer-events-none absolute inset-y-1 -left-1 w-0.5 rounded-full bg-foreground"
                aria-hidden="true"
              />
              <span
                v-if="showInsertBefore(tabs.tabs.length) && index === tabs.tabs.length - 1"
                class="pointer-events-none absolute inset-y-1 -right-1 w-0.5 rounded-full bg-foreground"
                aria-hidden="true"
              />
              <button type="button" class="truncate" @click="router.push(tab.fullPath)">
                {{ tab.title }}
              </button>
              <button
                v-if="tab.closable"
                type="button"
                class="ml-1 grid size-4 cursor-pointer place-items-center rounded-sm hover:bg-muted"
                :aria-label="`Close ${tab.title}`"
                @pointerdown="onClosePointerDown"
                @pointerup="onClosePointerUp"
                @pointercancel="onClosePointerUp"
                @click="closeTab(tab.id)"
              >
                <X class="size-3" />
              </button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-44">
            <ContextMenuItem :disabled="!tab.closable" @select="closeTab(tab.id)">
              Close
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem :disabled="!canCloseOthers(tab.id)" @select="closeOtherTabs(tab.id)">
              Close others
            </ContextMenuItem>
            <ContextMenuItem :disabled="!canCloseToRight(index)" @select="closeTabsToRight(tab.id)">
              Close to the right
            </ContextMenuItem>
            <ContextMenuItem :disabled="!canCloseAll" @select="closeAllTabs()">
              Close all
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
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

    <footer class="shrink-0 border-t bg-card px-4 py-3 text-center text-xs text-muted-foreground sm:px-6">
      © {{ copyrightYear }} CMA CGM Group
    </footer>
  </div>
</template>
