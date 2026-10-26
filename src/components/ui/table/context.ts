import type { InjectionKey, Ref } from 'vue'

export const tableHeaderPinnedKey: InjectionKey<Ref<boolean>> = Symbol('tableHeaderPinned')
