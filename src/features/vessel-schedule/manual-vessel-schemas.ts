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
  visitNo: string
  vesselName: string
  pointCode: string
  brand?: LaraBrand | ''
  service: string
  laraPoolLocation: string
  eta: string
  etb: string
  etd: string
  remark?: string
}

export const addVesselSchema = toTypedSchema(
  z.object({
    voyage: requiredText('Voyage is required'),
    visitNo: requiredText('Visit no is required'),
    vesselName: requiredText('Vessel name is required'),
    pointCode: requiredText('Point code is required'),
    brand: z.union([z.enum(LARA_BRANDS), z.literal('')]).optional(),
    service: z.string(),
    laraPoolLocation: z.string(),
    eta: z.string(),
    etb: z.string(),
    etd: z.string(),
    remark: z.string(),
  }),
)

