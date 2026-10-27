import type { VesselRecord } from '@/types/vsp'

/** Display label for a vessel schedule. The record's primary key is its id. */
export function laraLinkKey(
  vessel: Pick<VesselRecord, 'laraVoyage' | 'pointCode' | 'laraPoolLocation' | 'visitNo'>,
) {
  return [vessel.laraVoyage, vessel.pointCode, vessel.laraPoolLocation, vessel.visitNo]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ')
}

export function isInactiveRecord(vessel: Pick<VesselRecord, 'recordStatus'>) {
  return vessel.recordStatus === 'Inactive'
}

export function isLaraLinkSource(vessel: Pick<VesselRecord, 'laraLinkTargetId' | 'laraLinked'>) {
  return Boolean(vessel.laraLinkTargetId) || Boolean(vessel.laraLinked)
}

/** Link status shown on the temporary vessel list and edit page. */
export function temporaryLinkStatusLabel(vessel: Pick<VesselRecord, 'laraLinkTargetId' | 'laraLinked'>) {
  return isLaraLinkSource(vessel) ? 'Linked' : 'Unlink'
}

/** Schedule detail. Temporary vessels use this from vessel schedule search. */
export function vesselDetailPath(vessel: Pick<VesselRecord, 'id'>) {
  return `/vessels/${vessel.id}/view`
}
