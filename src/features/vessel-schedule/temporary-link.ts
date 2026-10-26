import type { LinkLaraDiff, LinkReview, LinkTerminalChoice, TerminalSchedule, VesselRecord } from '@/types/vsp'

/** Formal rows a temporary vessel can link to. Each row is still identified by its id. */
export function temporaryLinkKey(
  vessel: Pick<VesselRecord, 'laraVoyage' | 'pointCode' | 'laraPoolLocation' | 'visitNo'>,
) {
  return [vessel.laraVoyage, vessel.pointCode, vessel.laraPoolLocation, vessel.visitNo || '1']
    .map((part) => part.trim().toUpperCase())
    .join('\u0000')
}

const LARA_FIELDS: { field: keyof VesselRecord; label: string }[] = [
  { field: 'vesselName', label: 'Vessel name' },
  { field: 'service', label: 'Service' },
  { field: 'brand', label: 'Brand' },
  { field: 'laraEta', label: 'ETA' },
  { field: 'laraEtb', label: 'ETB' },
  { field: 'laraEtd', label: 'ETD' },
  { field: 'voyageStatus', label: 'Voyage status' },
]

function text(value: unknown) {
  return String(value ?? '').trim()
}

/** Fields the temporary vessel actually carries. Empty temporary values stay out of the comparison. */
export function laraDiffs(official: VesselRecord, temporary: VesselRecord): LinkLaraDiff[] {
  const diffs: LinkLaraDiff[] = []
  for (const column of LARA_FIELDS) {
    const incoming = text(temporary[column.field])
    if (!incoming) continue
    const current = text(official[column.field])
    if (current === incoming) continue
    diffs.push({ field: column.field, label: column.label, official: current, temporary: incoming })
  }
  return diffs
}

export function terminalSignature(schedule: TerminalSchedule | null | undefined) {
  if (!schedule) return ''
  return [
    schedule.terminal,
    schedule.evoyage,
    schedule.ivoyage,
    schedule.etb,
    schedule.etd,
    schedule.atb,
    schedule.atd,
  ]
    .map((part) => text(part))
    .join('|')
}

function terminalRows(vessel: VesselRecord) {
  const rows: TerminalSchedule[] = []
  const seen = new Set<string>()
  const push = (schedule: TerminalSchedule | null | undefined) => {
    if (!schedule) return
    const key = terminalSignature(schedule)
    if (!key || seen.has(key)) return
    seen.add(key)
    rows.push(schedule)
  }
  push(vessel.terminalSchedule)
  for (const candidate of vessel.terminalCandidates) push(candidate)
  return rows
}

export function mergedTerminalChoices(official: VesselRecord, temporary: VesselRecord): LinkTerminalChoice[] {
  const officialKeys = new Set(terminalRows(official).map((row) => terminalSignature(row)))
  const temporaryKeys = new Set(terminalRows(temporary).map((row) => terminalSignature(row)))
  const choices: LinkTerminalChoice[] = []
  const seen = new Set<string>()
  const push = (schedule: TerminalSchedule, origin: 'official' | 'temporary') => {
    const key = terminalSignature(schedule)
    if (!key || seen.has(key)) return
    seen.add(key)
    const fromOfficial = officialKeys.has(key)
    const fromTemporary = temporaryKeys.has(key)
    const source = fromOfficial && fromTemporary ? 'Both' : origin === 'official' ? 'Official' : 'Temporary'
    choices.push({ id: `terminal-${choices.length + 1}`, source, schedule: { ...schedule } })
  }
  for (const row of terminalRows(official)) push(row, 'official')
  for (const row of terminalRows(temporary)) push(row, 'temporary')
  return choices
}

/** No review when every maintained LARA field matches and the current terminal rows match. */
export function buildTemporaryLinkReview(official: VesselRecord, temporary: VesselRecord): LinkReview | null {
  const diffs = laraDiffs(official, temporary)
  const terminalMatched = terminalSignature(official.terminalSchedule) === terminalSignature(temporary.terminalSchedule)
  if (!diffs.length && terminalMatched) return null
  return {
    temporaryId: temporary.id,
    laraDiffs: diffs,
    terminalChoices: terminalMatched ? [] : mergedTerminalChoices(official, temporary),
    terminalMatched,
  }
}
