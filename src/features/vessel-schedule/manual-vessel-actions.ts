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

/** Call identity: voyage + point code + pool location + visit no. */
export function scheduleCallKey(voyage: string, pointCode: string, poolLocation: string, visitNo: string) {
  return [voyage, pointCode, poolLocation, visitNo || '1'].map((part) => part.trim().toUpperCase()).join('\0')
}

export function findScheduleCall(
  vessels: readonly VesselRecord[],
  input: { voyage: string; pointCode: string; poolLocation: string; visitNo: string },
  exceptId?: string,
) {
  if (!input.voyage.trim() || !input.pointCode.trim() || !input.poolLocation.trim()) return undefined
  const key = scheduleCallKey(input.voyage, input.pointCode, input.poolLocation, input.visitNo)
  const editing = exceptId ? vessels.find((vessel) => vessel.id === exceptId) : undefined
  return vessels.find((vessel) => {
    if (vessel.id === exceptId) return false
    if (scheduleCallKey(vessel.laraVoyage, vessel.pointCode, vessel.laraPoolLocation, vessel.visitNo || '1') !== key) {
      return false
    }
    // A temporary row and the formal row of the same call are one schedule, not two.
    return !(editing?.createdManually && !vessel.createdManually)
  })
}

export function duplicateScheduleCallMessage(
  voyage: string,
  pointCode: string,
  poolLocation: string,
  visitNo: string,
) {
  return `Voyage ${voyage.trim()}, point code ${pointCode.trim()}, pool location ${poolLocation.trim()}, and visit no ${visitNo.trim() || '1'} already exist.`
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
