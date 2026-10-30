/** Read a VSC key, copying the previous VSP key once when the new key is empty. */
export function readStored(key: string): string | null {
  const current = localStorage.getItem(key)
  if (current != null) return current
  if (!key.startsWith('vsc-')) return null
  const previous = localStorage.getItem(`vsp-${key.slice(4)}`)
  if (previous == null) return null
  localStorage.setItem(key, previous)
  return previous
}
