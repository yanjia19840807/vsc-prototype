import { createRouter, createWebHashHistory } from 'vue-router'

import { isMenuItemActive, menuItems } from '@/navigation/menu'

const router = createRouter({
  /** Hash history so the single-file HTML build can open via file:// (double-click). */
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/search' },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/pages/SearchPage.vue'),
      meta: { title: 'Vessel schedule search', flush: true },
    },
    {
      path: '/list-settings',
      name: 'list-settings',
      component: () => import('@/pages/ListSettingsPage.vue'),
      meta: { title: 'List settings' },
    },
    {
      path: '/terminal-voyages',
      name: 'terminal-voyage-search',
      component: () => import('@/pages/TerminalVoyageSearchPage.vue'),
      meta: { title: 'Terminal voyage', flush: true },
    },
    {
      path: '/terminal-voyages/:id',
      name: 'terminal-voyage-detail',
      component: () => import('@/pages/TerminalVoyageDetailPage.vue'),
      meta: { title: 'Terminal voyage' },
    },
    {
      path: '/coverage',
      name: 'terminal-coverage',
      component: () => import('@/pages/TerminalCoveragePage.vue'),
      meta: { title: 'Port terminal', flush: true },
    },
    {
      path: '/vessels/:id/view',
      name: 'vessel-detail-view',
      component: () => import('@/pages/VesselDetailViewPage.vue'),
      meta: { title: 'Schedule detail' },
    },
    {
      path: '/vessels/:id/activity-log',
      name: 'activity-log',
      component: () => import('@/pages/ActivityLogPage.vue'),
      meta: { title: 'Activity logs' },
    },
    {
      path: '/vessels/:id/review',
      name: 'vessel-review',
      component: () => import('@/pages/ReviewPage.vue'),
      meta: { title: 'Review' },
    },
  ],
})

router.beforeEach((to) => {
  if (to.path.startsWith('/vessels')) return true
  if (menuItems.some((item) => isMenuItemActive(item, to.path))) return true
  return '/search'
})

export default router
