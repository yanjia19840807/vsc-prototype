import { defineStore } from 'pinia'
import { ref } from 'vue'

import { readStored } from '@/lib/browser-storage'
import { PORTS } from '@/mock/ports'
import { QUICK_LINKS, RFI_TEMPLATES, SCOPE_RULES, TASK_TEMPLATES, USERS } from '@/mock/settings'
import type { PortDef, QuickLink, RfiTemplate, ScopeRule, TaskTemplate, UserAccount } from '@/types/vsc'

export const useSettingsStore = defineStore('settings', () => {
  const users = ref<UserAccount[]>([...USERS])
  const ports = ref<PortDef[]>([...PORTS])
  const rfiTemplates = ref<RfiTemplate[]>([...RFI_TEMPLATES])
  const quickLinks = ref<QuickLink[]>([...QUICK_LINKS])
  const taskTemplates = ref<TaskTemplate[]>([...TASK_TEMPLATES])
  const scopeRules = ref<ScopeRule[]>([...SCOPE_RULES])
  const defaultPort = ref(readStored('vsc-default-port') || '')

  function setDefaultPort(code: string) {
    defaultPort.value = code
    if (code) localStorage.setItem('vsc-default-port', code)
    else localStorage.removeItem('vsc-default-port')
  }

  function upsertUser(user: UserAccount) {
    const idx = users.value.findIndex((u) => u.id === user.id)
    if (idx >= 0) users.value[idx] = user
    else users.value.push(user)
  }

  function toggleScope(id: string, field: 'includePostSailing' | 'includeCargoOps') {
    const row = scopeRules.value.find((s) => s.id === id)
    if (row) row[field] = !row[field]
  }

  function addQuickLink(link: QuickLink) {
    quickLinks.value.push(link)
  }

  function removeQuickLink(id: string) {
    quickLinks.value = quickLinks.value.filter((l) => l.id !== id)
  }

  function upsertRfi(t: RfiTemplate) {
    const idx = rfiTemplates.value.findIndex((x) => x.id === t.id)
    if (idx >= 0) rfiTemplates.value[idx] = t
    else rfiTemplates.value.push(t)
  }

  return {
    users,
    ports,
    rfiTemplates,
    quickLinks,
    taskTemplates,
    scopeRules,
    defaultPort,
    setDefaultPort,
    upsertUser,
    toggleScope,
    addQuickLink,
    removeQuickLink,
    upsertRfi,
  }
})
