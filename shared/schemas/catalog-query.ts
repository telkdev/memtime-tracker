import { z } from 'zod'
import { decimalIntSchema, idSchema } from './common'

export const catalogQuerySchema = z.object({
  offset: decimalIntSchema.default(0),
})

export const idParamsSchema = z.object({ id: idSchema })
