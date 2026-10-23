import { z } from 'zod'
import { idSchema } from './common'

export const catalogQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  /** `refresh=1` bypasses the server cache (the Refresh button). */
  refresh: z.enum(['1']).optional(),
})

export const idParamsSchema = z.object({ id: idSchema })
