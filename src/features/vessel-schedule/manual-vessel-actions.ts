import { isLaraLinkSource } from '@/features/vessel-schedule/lara-link'
import { formatDateTime } from '@/lib/vessel-utils'
import type { HistoryDetail, VesselRecord } from '@/types/vsp'

export function isManualVessel(vessel: VesselRecord) {
  return Boolean(vessel.createdManually)
}

export function canEditManualVessel(vessel: VesselRecord) {
  return isManualVessel(vessel) && !isLaraLinkSource(vessel)
}

export function canDeleteManualVessel(vessel: VesselRecord) {
  return isManualVessel(vessel) && !isLaraLinkSource(vessel)
}

/** LARA values written when a temporary vessel is created. Empty values stay out of the log. */
export function manualLaraLogDetails(vessel: VesselRecord): HistoryDetail[] {
  const rows: [string, string][] = [
    ['laraVoyage', vessel.laraVoyage],
    ['vesselName', vessel.vesselName],
    ['brand', vessel.brand ?? ''],
    ['service', vessel.service],
    ['pointCode', vessel.pointCode],
    ['laraPoolLocation', vessel.laraPoolLocation],
    ['voyageStatus', vessel.omit ? 'omit' : vessel.voyageStatus],
    ['laraEta', vessel.laraEta.trim() ? formatDateTime(vessel.laraEta) : ''],
    ['laraEtb', vessel.laraEtb.trim() ? formatDateTime(vessel.laraEtb) : ''],
    ['laraEtd', vessel.laraEtd.trim() ? formatDateTime(vessel.laraEtd) : ''],
    ['vesselType', vessel.vesselTypeLabel],
    ['terminal9code', vessel.terminal9code],
    ['remark', vessel.remark],
  ]
  return rows
    .filter(([, value]) => value.trim())
    .map(([field, to]) => ({ field, from: '', to }))
}
