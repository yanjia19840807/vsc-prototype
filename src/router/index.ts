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
      path: '/coverage',
      name: 'terminal-coverage',
      component: () => import('@/pages/TerminalCoveragePage.vue'),
      meta: { title: 'Terminal coverage', flush: true },
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
  ],
})

router.beforeEach((to) => {
  if (to.path.startsWith('/vessels')) return true
  if (menuItems.some((item) => isMenuItemActive(item, to.path))) return true
  return '/search'
})

export default router
