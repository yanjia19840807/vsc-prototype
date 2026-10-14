import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSessionStore = defineStore('session', () => {
  const username = ref(localStorage.getItem('vsp-user') || 'Wendy Zhang')

  function setUsername(name: string) {
    username.value = name
    localStorage.setItem('vsp-user', name)
  }

  return { username, setUsername }
})
