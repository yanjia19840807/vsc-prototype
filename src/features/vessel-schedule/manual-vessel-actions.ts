import { isLaraLinkSource, isLaraLinkTarget } from '@/features/vessel-schedule/lara-link'
import type { VesselRecord } from '@/types/vsp'

export function isManualVessel(vessel: VesselRecord) {
  return Boolean(vessel.createdManually)
}

export function canEditManualVessel(vessel: VesselRecord) {
  return isManualVessel(vessel)
}

export function canLinkManualVessel(vessel: VesselRecord) {
  return isManualVessel(vessel) && !isLaraLinkSource(vessel) && !isLaraLinkTarget(vessel)
}

export function canUnlinkManualVessel(vessel: VesselRecord) {
  return isManualVessel(vessel) && isLaraLinkSource(vessel)
}

export function canDeleteManualVessel(vessel: VesselRecord) {
  return isManualVessel(vessel) && !isLaraLinkSource(vessel)
}
