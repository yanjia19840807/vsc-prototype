import type { DeadlineAlert, HighlightKind, VesselRecord } from '@/types/vsp'

export function getHighlightKind(v: VesselRecord, selected = false): HighlightKind {
  if (selected) return 'selected'
  if (v.omit || v.voyageStatus === 'Omit') return 'omit'
  const hasAtd = Boolean(v.tmlAtd)
  if (hasAtd && v.workflowStatus === 'Completed') return 'completed'
  if (
    hasAtd &&
    (v.workflowStatus === 'New' ||
      v.workflowStatus === 'Pending' ||
      v.workflowStatus === 'In Progress' ||
      v.workflowStatus === 'Reopened')
  ) {
    return 'pending_after_atd'
  }
  if (!hasAtd && v.laraEtb) {
    const etb = new Date(v.laraEtb).getTime()
    const twoDays = 2 * 24 * 60 * 60 * 1000
    if (Date.now() - etb > twoDays) return 'missing_atd'
  }
  return 'normal'
}

export function highlightRowClass(kind: HighlightKind): string {
  switch (kind) {
    case 'completed':
      return 'bg-muted/80 text-muted-foreground'
    case 'pending_after_atd':
      return 'bg-red-100/90'
    case 'missing_atd':
      return 'bg-orange-100/90'
    case 'omit':
      return 'bg-muted/70 text-muted-foreground'
    case 'selected':
      return 'bg-sky-100'
    default:
      return 'bg-card'
  }
}

export function getDeadlineAlert(deadline?: string): DeadlineAlert {
  if (!deadline) return 'Normal'
  const ms = new Date(deadline).getTime() - Date.now()
  if (ms < 0) return 'Overdue'
  const hours = ms / (1000 * 60 * 60)
  if (hours < 1) return 'Urgent'
  if (hours < 4) return 'Warning'
  return 'Normal'
}

export function deadlineBadgeClass(alert: DeadlineAlert): string {
  switch (alert) {
    case 'Warning':
      return 'bg-yellow-100 text-yellow-900 border-yellow-300'
    case 'Urgent':
      return 'bg-orange-100 text-orange-900 border-orange-300'
    case 'Overdue':
      return 'bg-red-100 text-red-900 border-red-300'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/** Terminal schedule API datetime: `YYYY-MM-DD HH:mm:ss`. */
export function formatApiDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatFileStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()} ${pad(d.getHours())}${pad(d.getMinutes())}`
}

export function buildSlcSdcFileName(
  kind: 'SLC' | 'SDC',
  v: VesselRecord,
): string {
  return `${kind}-${v.laraVoyage}-${v.vesselName}-${v.poolLocation}-${formatFileStamp()}.xlsx`
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0]!)
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n')
}
