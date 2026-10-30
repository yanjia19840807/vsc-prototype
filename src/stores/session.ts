import { defineStore } from 'pinia'
import { ref } from 'vue'

import { readStored } from '@/lib/browser-storage'

export const useSessionStore = defineStore('session', () => {
  const username = ref(readStored('vsc-user') || 'Wendy Zhang')

  function setUsername(name: string) {
    username.value = name
    localStorage.setItem('vsc-user', name)
  }

  return { username, setUsername }
})
