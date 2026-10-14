import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import {
  cloneListSetting,
  createListSetting,
  loadUserSettings,
  persistUserSettings,
  type ListSetting,
} from '@/features/vessel-search/list-setting-model'
import { useSessionStore } from '@/stores/session'

export const useListSettingsStore = defineStore('list-settings', () => {
  const session = useSessionStore()
  const items = ref<ListSetting[]>([])
  const activeId = ref('')
  const revision = ref(0)

  function load() {
    const data = loadUserSettings(session.username)
    items.value = data.items
    activeId.value = data.activeId
  }

  function persist() {
    persistUserSettings(session.username, {
      activeId: activeId.value,
      items: items.value,
    })
    revision.value += 1
  }

  load()

  watch(
    () => session.username,
    () => load(),
  )

  const active = computed(() => items.value.find((item) => item.id === activeId.value) ?? items.value[0])

  function byId(id: string) {
    return items.value.find((item) => item.id === id)
  }

  function replace(setting: ListSetting) {
    const index = items.value.findIndex((item) => item.id === setting.id)
    if (index === -1) items.value = [...items.value, setting]
    else {
      const next = items.value.slice()
      next[index] = setting
      items.value = next
    }
    persist()
  }

  function create(name: string) {
    const setting = createListSetting(name.trim() || nextName('Setting'))
    items.value = [...items.value, setting]
    persist()
    return setting
  }

  function duplicate(id: string) {
    const source = byId(id)
    if (!source) return null
    const copy = cloneListSetting(source, nextName(`${source.name} copy`))
    items.value = [...items.value, copy]
    persist()
    return copy
  }

  function rename(id: string, name: string) {
    const setting = byId(id)
    if (!setting) return false
    const next = name.trim()
    if (!next) return false
    replace({ ...setting, name: next })
    return true
  }

  function activate(id: string) {
    if (!byId(id)) return false
    activeId.value = id
    persist()
    return true
  }

  function remove(id: string) {
    if (items.value.length <= 1) return false
    if (id === activeId.value) return false
    const next = items.value.filter((item) => item.id !== id)
    if (next.length === items.value.length) return false
    items.value = next
    persist()
    return true
  }

  function nextName(base: string) {
    const names = new Set(items.value.map((item) => item.name))
    if (!names.has(base)) return base
    let index = 2
    while (names.has(`${base} ${index}`)) index += 1
    return `${base} ${index}`
  }

  return {
    items,
    activeId,
    revision,
    active,
    byId,
    load,
    replace,
    create,
    duplicate,
    rename,
    activate,
    remove,
    nextName,
  }
})
