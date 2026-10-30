import type { ScheduleReview } from '@/domain/schedule-model'
import type { MatchingStatus, VesselRecord } from '@/types/vsc'
import type { TerminalDraftKey } from '@/features/vessel-schedule/mismatch-fields'

/** Matching still needs a person to add, select, fill voyage, or confirm a gap. */
const OPEN_REVIEW_STATUSES = new Set<MatchingStatus>([
  'No terminal record',
  'Multiple terminal records',
  'No external voyage',
  'ETA gap > 3 days',
])

const VOYAGE_KEYS = new Set<TerminalDraftKey>(['evoyage', 'ivoyage'])

export type TerminalEditMode = 'all' | 'voyage' | 'none'

export function scheduleNeedsReview(vessel: VesselRecord, review: ScheduleReview) {
  if (review.shape) return true
  if (OPEN_REVIEW_STATUSES.has(vessel.matchingStatus)) return true
  if (vessel.matchingStatus === 'Auto matched') return false
  return review.pending
}

export function scheduleHighlight(review: ScheduleReview) {
  return review.fields.some((field) => field.status === 'applied')
}

export function terminalEditMode(vessel: VesselRecord): TerminalEditMode {
  if (vessel.matchingStatus === 'No terminal record') return 'all'
  if (vessel.matchingStatus === 'No external voyage') return 'voyage'
  if ((vessel.matchingStatus === 'Manual matched' || vessel.matchingStatus === 'Pending match') && vessel.terminalSource === 'manual') return 'all'
  return 'none'
}

export function canEditTerminalDraft(vessel: VesselRecord, key: TerminalDraftKey) {
  const mode = terminalEditMode(vessel)
  if (mode === 'all') return true
  if (mode === 'voyage') return VOYAGE_KEYS.has(key)
  return false
}

export function canAddTerminalRecord(vessel: VesselRecord, review: ScheduleReview) {
  if (vessel.matchingStatus === 'Multiple terminal records') return false
  if (review.shape === 'many') return false
  if (review.shape === 'none') return true
  return vessel.matchingStatus === 'No terminal record'
}

export function canSelectTerminalRecord(vessel: VesselRecord, review: ScheduleReview) {
  return vessel.matchingStatus === 'Multiple terminal records' || review.shape === 'many'
}
