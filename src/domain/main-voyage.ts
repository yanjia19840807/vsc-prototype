export function isMainVoyage(record: { laraVoyage?: string; mainVoyage?: string }) {
  const voyage = record.laraVoyage?.trim() ?? ''
  const main = record.mainVoyage?.trim() ?? ''
  return voyage.length > 0 && voyage === main
}

export function mainVoyageText(record: { laraVoyage?: string; mainVoyage?: string }) {
  return isMainVoyage(record) ? 'Yes' : 'No'
}
