import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

import { useVesselStore } from '@/stores/vessels'

export type PageTab = {
  id: string
  title: string
  fullPath: string
  closable: boolean
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
  return typeof to.meta.title === 'string' ? to.meta.title : 'Page'
}

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
