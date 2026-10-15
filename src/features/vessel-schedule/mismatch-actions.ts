import { isLaraLinkTarget } from '@/features/vessel-schedule/lara-link'
import type { VesselRecord } from '@/types/vsp'

/** Match / terminal remediation actions opened from list or detail. */
export type MismatchQuickAction = 'selectMatch' | 'reviewMatch' | 'addTerminal'

export type ManualVesselQuickAction = 'editVessel' | 'linkLara' | 'unlinkLara' | 'deleteVessel'

export type ScheduleQuickAction =
  | MismatchQuickAction
  | ManualVesselQuickAction
  | 'rfi'
  | 'slc'
  | 'sdc'

export const MISMATCH_ACTION_LABEL: Record<MismatchQuickAction, string> = {
  selectMatch: 'Select match',
  reviewMatch: 'Review match',
  addTerminal: 'Add terminal',
}

export const MISMATCH_EDIT_LABEL: Record<MismatchQuickAction, string> = {
  selectMatch: 'Change match',
  reviewMatch: 'Review match',
  addTerminal: 'Edit terminal',
}

/** Scene-specific hint shown in the dialog body. */
export const MISMATCH_ALERT: Record<MismatchQuickAction, string> = {
  selectMatch: 'Multiple terminal schedules match this LARA voyage. Select one to confirm.',
  reviewMatch:
    'The LARA ETD and terminal ETD differ by more than 5 days. Review and confirm or edit terminal data.',
  addTerminal: 'No terminal schedule was found for this port/voyage. Add terminal information manually.',
}

export const MISMATCH_REEDIT_ALERT: Record<MismatchQuickAction, string> = {
  selectMatch: 'This match was confirmed manually. You can select a different terminal row; the choice stays as Manual Override.',
  reviewMatch:
    'This match was reviewed manually. You can confirm again or edit terminal data; changes stay as Manual Override.',
  addTerminal:
    'This terminal schedule was entered manually. Edits remain Manual Override and are not overwritten by automatic sync.',
}

/** BRD: manual terminal data stays editable (Manual Override / Manual Maintenance). */
export function isManualTerminalEditable(vessel: VesselRecord) {
  return vessel.terminalSource === 'manual' && Boolean(vessel.terminalSchedule)
}

export function isMismatchReedit(vessel: VesselRecord) {
  return vessel.matchingStatus === 'Manual matched'
}

export function mismatchActionForStatus(vessel: VesselRecord): MismatchQuickAction | null {
  switch (vessel.matchingStatus) {
    case 'Multiple terminal records':
      return 'selectMatch'
    case 'ETD gap > 5 days':
    case 'No external voyage':
      return 'reviewMatch'
    case 'No terminal record':
    case 'Pending match':
      return 'addTerminal'
    default:
      return null
  }
}

export function addTerminalAlert(vessel: VesselRecord) {
  if (isMismatchReedit(vessel) || isManualTerminalEditable(vessel)) return MISMATCH_REEDIT_ALERT.addTerminal
  if (vessel.matchingStatus === 'Pending match') {
    return 'Matching has not run yet. Enter terminal information manually.'
  }
  return MISMATCH_ALERT.addTerminal
}

function remediationFromVessel(vessel: VesselRecord): MismatchQuickAction | null {
  if ((vessel.manualRemediation as string | undefined) === 'enterVoyage') return 'reviewMatch'
  if (vessel.manualRemediation) return vessel.manualRemediation
  if (isManualTerminalEditable(vessel)) return 'addTerminal'
  if (vessel.terminalCandidates.length > 1) return 'selectMatch'
  if (vessel.terminalSchedule) return 'reviewMatch'
  return null
}

/** Prefer open mismatch status; after Manual matched reopen the same remediation flow. */
export function mismatchActionForVessel(vessel: VesselRecord): MismatchQuickAction | null {
  if (isLaraLinkTarget(vessel)) return null
  const action = mismatchActionForStatus(vessel) ?? remediationFromVessel(vessel)
  if (vessel.matchingStatus === 'Auto matched' && action === 'reviewMatch') return null
  return action
}

export function mismatchActionLabel(vessel: VesselRecord): string | null {
  const action = mismatchActionForVessel(vessel)
  if (!action) return null
  if (isMismatchReedit(vessel)) return MISMATCH_EDIT_LABEL[action]
  return MISMATCH_ACTION_LABEL[action]
}
