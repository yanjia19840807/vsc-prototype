import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

import { findTerminalVoyage } from '@/features/terminal-voyage/model'
import { useScheduleStore } from '@/stores/schedule'
import { useVesselStore } from '@/stores/vessels'

export type PageTab = {
  id: string
  title: string
  fullPath: string
  closable: boolean
  /** Stable while the tab stays open. A new value is assigned each time the tab is created. */
  cacheKey?: string
}

function tabId(to: RouteLocationNormalizedLoaded) {
  if (to.name === 'vessel-detail-view') return to.path
  return to.path
}

function tabTitle(to: RouteLocationNormalizedLoaded) {
  if (to.name === 'vessel-detail-view') {
    const vessel = useVesselStore().byId(String(to.params.id))
    return vessel?.vesselName ?? 'Schedule detail'
  }
  if (to.name === 'activity-log') {
    const vessel = useVesselStore().byId(String(to.params.id))
    return vessel ? `Activity logs · ${vessel.vesselName}` : 'Activity logs'
  }
  if (to.name === 'vessel-review') {
    const vessel = useVesselStore().byId(String(to.params.id))
    return vessel ? `Review · ${vessel.vesselName}` : 'Review'
  }
  if (to.name === 'terminal-voyage-detail') {
    const row = findTerminalVoyage(useScheduleStore().payloadState, useVesselStore().vessels, String(to.params.id))
    return row?.vesselNameEn || row?.vesselNameCn || 'Terminal voyage'
  }
  return typeof to.meta.title === 'string' ? to.meta.title : 'Page'
}

let pageCacheSeq = 0

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<PageTab[]>([])

  function ensureHome() {
    if (tabs.value.some((tab) => tab.id === '/search')) return
    tabs.value.unshift({
      id: '/search',
      title: 'Vessel schedule search',
      fullPath: '/search',
      closable: false,
    })
  }

  function openFromRoute(to: RouteLocationNormalizedLoaded) {
    if (
      to.name !== 'search'
      && to.name !== 'list-settings'
      && to.name !== 'vessel-detail-view'
      && to.name !== 'activity-log'
      && to.name !== 'vessel-review'
      && to.name !== 'terminal-coverage'
      && to.name !== 'terminal-voyage-search'
      && to.name !== 'terminal-voyage-detail'
    ) return
    ensureHome()
    const id = tabId(to)
    const existing = tabs.value.find((tab) => tab.id === id)
    if (existing) {
      existing.fullPath = to.fullPath
      existing.title = tabTitle(to)
      return
    }
    tabs.value.push({
      id,
      title: tabTitle(to),
      fullPath: to.fullPath,
      closable: to.name !== 'search',
      cacheKey: to.name === 'vessel-review' ? `${id}:${++pageCacheSeq}` : undefined,
    })
  }

  function isActive(tab: PageTab, activePath: string) {
    return activePath === tab.fullPath || activePath === tab.id
  }

  /**
   * Remove closable tabs matching the predicate.
   * Returns the path to open when the active tab was among those removed.
   */
  function closeWhere(
    match: (tab: PageTab, index: number) => boolean,
    activePath: string,
    fallbackPath: string,
  ) {
    const removed = tabs.value.filter((tab, index) => tab.closable && match(tab, index))
    if (removed.length === 0) return null
    const removedIds = new Set(removed.map((tab) => tab.id))
    const activeClosed = removed.some((tab) => isActive(tab, activePath))
    tabs.value = tabs.value.filter((tab) => !removedIds.has(tab.id))
    return activeClosed ? fallbackPath : null
  }

  /** Remove a tab. Returns the path to open when the closed tab was active. */
  function close(id: string, activePath: string) {
    const index = tabs.value.findIndex((tab) => tab.id === id)
    const tab = tabs.value[index]
    if (!tab?.closable) return null
    const fallback = (tabs.value[index - 1] ?? tabs.value[index + 1])?.fullPath ?? '/search'
    return closeWhere((item) => item.id === id, activePath, fallback)
  }

  /** Close every closable tab except the one that was targeted. */
  function closeOthers(id: string, activePath: string) {
    const anchor = tabs.value.find((tab) => tab.id === id)
    return closeWhere((tab) => tab.id !== id, activePath, anchor?.fullPath ?? '/search')
  }

  /** Close closable tabs to the right of the targeted tab. */
  function closeToRight(id: string, activePath: string) {
    const index = tabs.value.findIndex((tab) => tab.id === id)
    if (index < 0) return null
    const anchor = tabs.value[index]
    return closeWhere((_tab, itemIndex) => itemIndex > index, activePath, anchor?.fullPath ?? '/search')
  }

  /** Close every closable tab and return to search when the active tab was closed. */
  function closeAll(activePath: string) {
    return closeWhere(() => true, activePath, '/search')
  }

  /**
   * Move a closable tab so it occupies `insertAt` in the current list.
   * Index 0 is the pinned search tab and is never a valid destination.
   */
  function move(id: string, insertAt: number) {
    const from = tabs.value.findIndex((tab) => tab.id === id)
    const moving = tabs.value[from]
    if (!moving?.closable) return
    const clamped = Math.min(Math.max(insertAt, 1), tabs.value.length)
    if (from === clamped || from + 1 === clamped) return
    const next = tabs.value.slice()
    next.splice(from, 1)
    next.splice(from < clamped ? clamped - 1 : clamped, 0, moving)
    tabs.value = next
  }

  return { tabs, openFromRoute, close, closeOthers, closeToRight, closeAll, move }
})
