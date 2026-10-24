import type { VesselRecord } from '@/types/vsp'

/** Business key shown for a LARA call: Voyage · Point code · Pool location · Visit no. */
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
