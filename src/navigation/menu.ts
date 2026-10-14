export type MenuItem = {
  label: string
  to: string
  match?: string[]
}

export const menuItems: MenuItem[] = [
  {
    label: 'Vessel schedule search',
    to: '/search',
    match: ['/vessels', '/list-settings'],
  },
  {
    label: 'Terminal coverage',
    to: '/coverage',
  },
]

export function isMenuItemActive(item: MenuItem, path: string) {
  if (path === item.to || path.startsWith(item.to + '/')) return true
  return (item.match ?? []).some((m) => path === m || path.startsWith(m + '/'))
}
