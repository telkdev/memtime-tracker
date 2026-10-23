import { z } from 'zod'
import { idSchema } from './common'

export const catalogQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
})

export const idParamsSchema = z.object({ id: idSchema })
