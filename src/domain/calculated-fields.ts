import { findTerminal, type PortCoverage } from '@/features/terminal-coverage/model'
import type { VesselRecord } from '@/types/vsc'
import { vesselTypeText, type VesselTypeLabel } from '@/domain/vessel-type'

type VesselTypeTarget = Pick<
  VesselRecord,
  'laraVoyage' | 'brand' | 'vesselOperator' | 'vesselTypeLabel' | 'groupKind' | 'vesselType'
>

/** Write the vessel-type column from the voyage, brand, and operator already stored on the row. */
export function applyStoredVesselType(vessel: VesselTypeTarget) {
  const label: VesselTypeLabel = vesselTypeText({
    laraVoyage: vessel.laraVoyage,
    brand: vessel.brand,
    vesselOperator: vessel.vesselOperator,
  })
  vessel.vesselTypeLabel = label
  if (label === '3PF') {
    vessel.groupKind = '3PF'
    vessel.vesselType = '3PF'
  } else if (label === 'Partner vsl') {
    vessel.groupKind = 'Partner Vessel'
    vessel.vesselType = 'MV'
  } else if (label === 'Group vsl') {
    vessel.groupKind = 'Group Vessel'
    vessel.vesselType = 'MV'
  }
}

/** Write the terminal 9code column from the bound terminal and the TML matrix. */
export function applyStoredTerminal9code(
  vessel: Pick<VesselRecord, 'pointCode' | 'terminalSchedule' | 'terminal9code'>,
  ports: PortCoverage[],
) {
  const terminal = vessel.terminalSchedule?.terminal
  vessel.terminal9code = terminal ? findTerminal(ports, vessel.pointCode, terminal)?.pool ?? '' : ''
}
