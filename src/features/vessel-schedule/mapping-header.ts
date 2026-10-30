import type { AlertVariants } from '@/components/ui/alert'
import type { TerminalShape } from '@/domain/schedule-model/sync-diff'
import { addTerminalAlert, MISMATCH_ALERT } from '@/features/vessel-schedule/mismatch-actions'
import { candidateCountLabel, sharedLaraRemark } from '@/features/vessel-search/search-columns'
import type { VesselRecord } from '@/types/vsp'

export type MappingAlertVariant = NonNullable<AlertVariants['variant']>

export type MappingHeaderAlert = {
  variant: MappingAlertVariant
  title: string
  text: string
}

/** Same meaning as StatusBadge: pending is danger, mismatch statuses are warning. */
export function mappingAlertVariant(status: string): MappingAlertVariant {
  if (
    [
      'Multiple terminal records',
      'ETA gap > 3 days',
      'No external voyage',
      'No terminal record',
      'Failed',
    ].includes(status)
  ) {
    return 'warning'
  }
  if (status === 'Pending match') return 'destructive'
  if (status === 'Auto matched' || status === 'Manual matched') return 'success'
  return 'warning'
}

export function mappingStatusChangeAlert(
  field?: { previousValue: string; incomingValue: string } | null,
): MappingHeaderAlert | null {
  if (!field) return null
  if (field.previousValue === field.incomingValue) return null
  return {
    variant: mappingAlertVariant(field.incomingValue),
    title: 'Mapping status',
    text: `Previous: ${field.previousValue || '—'}. This sync: ${field.incomingValue || '—'}`,
  }
}

function withPreviousStatus(text: string, previous?: string, current?: string) {
  if (!previous || previous === current) return text
  return `Previous: ${previous}. ${text}`
}

/** Count shown beside the status badge, in the same style as the search list. */
export function mappingStatusRemark(vessel: VesselRecord) {
  if (vessel.matchingStatus === 'Multiple terminal records' && vessel.terminalCandidates.length) {
    return candidateCountLabel(vessel)
  }
  if (vessel.matchingStatus === 'Auto matched') return sharedLaraRemark(vessel.sharedLaraCount)
  return ''
}

function multipleTerminalAlert(count: number, previous?: string): MappingHeaderAlert {
  const remark = count === 1 ? '1 candidate' : count > 1 ? `${count} candidates` : ''
  const text = remark ? `${remark}. ${MISMATCH_ALERT.selectMatch}` : MISMATCH_ALERT.selectMatch
  return {
    variant: mappingAlertVariant('Multiple terminal records'),
    title: 'Multiple terminal records',
    text: withPreviousStatus(text, previous, 'Multiple terminal records'),
  }
}

function noTerminalAlert(vessel: VesselRecord, previous?: string): MappingHeaderAlert {
  return {
    variant: mappingAlertVariant('No terminal record'),
    title: 'No terminal record',
    text: withPreviousStatus(addTerminalAlert(vessel), previous, 'No terminal record'),
  }
}

/** Same prompt on view and review. Review adds the actions; the wording stays here. */
export function mappingHeaderAlert(
  vessel: VesselRecord,
  review?: { shape: TerminalShape | null; candidateCount: number; previousStatus?: string },
): MappingHeaderAlert | null {
  const previous = review?.previousStatus
  if (review?.shape === 'many') return multipleTerminalAlert(review.candidateCount || vessel.terminalCandidates.length, previous)
  if (review?.shape === 'none') {
    return {
      variant: mappingAlertVariant('No terminal record'),
      title: 'No terminal record',
      text: withPreviousStatus(
        'The latest sync has no terminal record. Confirm the current terminal record, or add a new one.',
        previous,
        'No terminal record',
      ),
    }
  }
  switch (vessel.matchingStatus) {
    case 'Multiple terminal records':
      return multipleTerminalAlert(vessel.terminalCandidates.length, previous)
    case 'ETA gap > 3 days':
      return {
        variant: mappingAlertVariant('ETA gap > 3 days'),
        title: 'ETA gap > 3 days',
        text: withPreviousStatus(MISMATCH_ALERT.reviewMatch, previous, 'ETA gap > 3 days'),
      }
    case 'No external voyage':
      return {
        variant: mappingAlertVariant('No external voyage'),
        title: 'No external voyage',
        text: withPreviousStatus(
          'A terminal schedule was found, but export and import voyage are missing.',
          previous,
          'No external voyage',
        ),
      }
    case 'No terminal record':
      return noTerminalAlert(vessel, previous)
    default:
      return null
  }
}
