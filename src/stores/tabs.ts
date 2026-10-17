import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

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
  if (to.name === 'vessel-link-lara') {
    const vessel = useVesselStore().byId(String(to.params.id))
    return vessel ? `Link to LARA · ${vessel.vesselName}` : 'Link to LARA'
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
      && to.name !== 'vessel-link-lara'
      && to.name !== 'terminal-coverage'
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
      cacheKey: to.name === 'vessel-review' || to.name === 'vessel-link-lara' ? `${id}:${++pageCacheSeq}` : undefined,
    })
  }

  /** Remove a tab. Returns the path to open when the closed tab was active. */
  function close(id: string, activePath: string) {
    const index = tabs.value.findIndex((tab) => tab.id === id)
    const tab = tabs.value[index]
    if (!tab?.closable) return null
    const fallback = tabs.value[index - 1] ?? tabs.value[index + 1]
    tabs.value.splice(index, 1)
    if (activePath !== tab.fullPath && activePath !== tab.id) return null
    return fallback?.fullPath ?? '/search'
  }

  return { tabs, openFromRoute, close }
})
