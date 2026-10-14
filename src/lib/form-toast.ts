import { toast } from 'vue-sonner'

/** Page-level form validation, using vue-sonner's error toast. */
export function toastFormErrors(
  errors: Record<string, string | undefined> | Array<string | undefined>,
  order?: readonly string[],
) {
  const messages: string[] = []
  const seen = new Set<string>()
  const push = (message: string | undefined) => {
    if (!message || seen.has(message)) return
    seen.add(message)
    messages.push(message)
  }
  if (Array.isArray(errors)) {
    errors.forEach(push)
  } else {
    const keys = [...(order ?? []), ...Object.keys(errors)]
    for (const key of keys) push(errors[key])
  }
  const [title, ...rest] = messages
  if (!title) return
  if (rest.length === 0) {
    toast.error(title)
    return
  }
  toast.error(title, { description: rest.join('\n') })
}
