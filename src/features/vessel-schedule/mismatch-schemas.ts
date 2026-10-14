import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

const remarkSchema = z.string()

/** Plain strings — defaults come from useForm initialValues (ZodDefault breaks @vee-validate/zod). */
const optionalText = z.string()

/** Shared terminal draft fields (string values for form binding). */
export const terminalDraftSchema = z.object({
  status: optionalText,
  vesselNameEn: optionalText,
  vesselNameCn: optionalText,
  shipCode: optionalText,
  shipName: optionalText,
  agentCode: optionalText,
  agentName: optionalText,
  lineCode: optionalText,
  terminal: optionalText,
  portsEn: optionalText,
  portsCn: optionalText,
  eta: optionalText,
  ata: optionalText,
  etb: optionalText,
  atb: optionalText,
  etd: optionalText,
  atd: optionalText,
  cyOpen: optionalText,
  cyClosing: optionalText,
  portCloseDate: optionalText,
  customsCloseDate: optionalText,
  updateTime: optionalText,
  ivoyage: optionalText,
  evoyage: optionalText,
  vesselOperator: optionalText,
})

export type TerminalDraftValues = z.infer<typeof terminalDraftSchema>

export const selectMatchSchema = toTypedSchema(
  z.object({
    candidateIndex: z.string().min(1, 'Select a terminal row'),
    remark: remarkSchema,
  }),
)

export const reviewMatchSchema = toTypedSchema(
  terminalDraftSchema.extend({
    remark: remarkSchema,
  }),
)

export const addTerminalSchema = toTypedSchema(
  terminalDraftSchema
    .extend({
      remark: remarkSchema,
      terminal: z.string().trim().min(1, 'Terminal is required'),
    })
    .superRefine((value, ctx) => {
      if (!value.evoyage?.trim() && !value.ivoyage?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter export or import voyage',
          path: ['evoyage'],
        })
      }
    }),
)
