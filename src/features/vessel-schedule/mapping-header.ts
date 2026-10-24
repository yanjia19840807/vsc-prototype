import type { TerminalShape } from '@/domain/schedule-model/sync-diff'
import { addTerminalAlert, MISMATCH_ALERT } from '@/features/vessel-schedule/mismatch-actions'
import { candidateCountLabel, sharedLaraRemark } from '@/features/vessel-search/search-columns'
import type { VesselRecord } from '@/types/vsp'

export type MappingHeaderAlert = {
  variant: 'warning'
  title: string
  text: string
}

/** Count shown beside the status badge, in the same style as the search list. */
export function mappingStatusRemark(vessel: VesselRecord) {
  if (vessel.matchingStatus === 'Multiple terminal records' && vessel.terminalCandidates.length) {
    return candidateCountLabel(vessel)
  }
  if (vessel.matchingStatus === 'Auto matched') return sharedLaraRemark(vessel.sharedLaraCount)
  return ''
}

function multipleTerminalAlert(count: number): MappingHeaderAlert {
  const remark = count === 1 ? '1 candidate' : count > 1 ? `${count} candidates` : ''
  return {
    variant: 'warning',
    title: 'Multiple terminal records',
    text: remark ? `${remark}. ${MISMATCH_ALERT.selectMatch}` : MISMATCH_ALERT.selectMatch,
  }
}

function noTerminalAlert(vessel: VesselRecord): MappingHeaderAlert {
  return {
    variant: 'warning',
    title: 'No terminal record',
    text: addTerminalAlert(vessel),
  }
}

/** Same prompt on view and review. Review adds the actions; the wording stays here. */
export function mappingHeaderAlert(
  vessel: VesselRecord,
  review?: { shape: TerminalShape | null; candidateCount: number },
): MappingHeaderAlert | null {
  if (review?.shape === 'many') return multipleTerminalAlert(review.candidateCount || vessel.terminalCandidates.length)
  if (review?.shape === 'none') return noTerminalAlert(vessel)
  switch (vessel.matchingStatus) {
    case 'Multiple terminal records':
      return multipleTerminalAlert(vessel.terminalCandidates.length)
    case 'ETD gap > 3 days':
      return {
        variant: 'warning',
        title: 'ETD gap > 3 days',
        text: MISMATCH_ALERT.reviewMatch,
      }
    case 'No external voyage':
      return {
        variant: 'warning',
        title: 'No external voyage',
        text: 'A terminal schedule was found, but export and import voyage are missing.',
      }
    case 'No terminal record':
      return noTerminalAlert(vessel)
    default:
      return null
  }
}
