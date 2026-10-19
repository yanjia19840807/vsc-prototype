import type { VesselRecord } from '@/types/vsp'

/** Business key shown for a LARA link: Voyage · Point code · Pool location. */
export function laraLinkKey(vessel: Pick<VesselRecord, 'laraVoyage' | 'pointCode' | 'poolLocation'>) {
  return [vessel.laraVoyage, vessel.pointCode, vessel.poolLocation]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ')
}

export function isLaraLinkTarget(vessel: Pick<VesselRecord, 'laraLinkSourceId'>) {
  return Boolean(vessel.laraLinkSourceId)
}

export function isInactiveRecord(vessel: Pick<VesselRecord, 'recordStatus'>) {
  return vessel.recordStatus === 'Inactive'
}

export function isLaraLinkSource(vessel: Pick<VesselRecord, 'laraLinkTargetId' | 'laraLinked'>) {
  return Boolean(vessel.laraLinkTargetId) || Boolean(vessel.laraLinked)
}
