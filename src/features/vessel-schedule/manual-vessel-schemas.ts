import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

const requiredText = (message: string) => z.string().trim().min(1, message)

/** Values shown in the LARA columns of vessel schedule search. */
export const LARA_VESSEL_TYPES = ['Group vsl', 'Partner vsl', '3PF'] as const
export const LARA_BRANDS = ['CMA', 'ANL', 'APL', 'CNC'] as const
export const LARA_VOYAGE_STATUSES = ['Active', 'Omit'] as const

export type LaraVesselType = (typeof LARA_VESSEL_TYPES)[number]
export type LaraBrand = (typeof LARA_BRANDS)[number]
export type LaraVoyageStatus = (typeof LARA_VOYAGE_STATUSES)[number]

export type ManualVesselInput = {
  voyage: string
  vesselName: string
  pointCode: string
  vesselType: LaraVesselType
  brand: LaraBrand
  service: string
  poolLocation: string
  etb: string
  etd: string
  voyageStatus: LaraVoyageStatus
  remark?: string
}

export const addVesselSchema = toTypedSchema(
  z.object({
    voyage: requiredText('Voyage is required'),
    vesselName: requiredText('Vessel name is required'),
    pointCode: requiredText('Point code is required'),
    vesselType: z.enum(LARA_VESSEL_TYPES, { message: 'Vessel type is required' }),
    brand: z.enum(LARA_BRANDS, { message: 'Brand is required' }),
    service: requiredText('Service is required'),
    poolLocation: requiredText('Pool location is required'),
    etb: requiredText('ETB is required'),
    etd: requiredText('ETD is required'),
    voyageStatus: z.enum(LARA_VOYAGE_STATUSES, { message: 'Voyage status is required' }),
    remark: z.string(),
  }),
)

