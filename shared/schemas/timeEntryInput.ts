import { z } from 'zod'
import { utcTimestampSchema } from './timeEntry'

// Shared by the entry form and the BFF, so a field error reads the same in both places.
// The API documents no limits; the comment cap and the 24 h cap are our own rules.

export const COMMENT_MAX = 500
export const MAX_ENTRY_MS = 24 * 60 * 60_000

// The shared UTC-only rule (hard rule 4): Z only, no local or offset times.
const utcIso = utcTimestampSchema

export const timeEntryInputSchema = z.object({
  taskId: z.number({ message: 'Pick a task.' }).int().nonnegative({ message: 'Pick a task.' }),
  comment: z.string({ message: 'Add a short comment.' })
    .trim()
    .min(1, { message: 'Add a short comment about what you worked on.' })
    .max(COMMENT_MAX, { message: `Keep the comment under ${COMMENT_MAX} characters.` }),
  start: utcIso,
  end: utcIso,
}).superRefine((v, ctx) => {
  const ms = Date.parse(v.end) - Date.parse(v.start)
  if (ms <= 0) {
    ctx.addIssue({ code: 'custom', path: ['end'], message: 'End must be after start.' })
  }
  else if (ms > MAX_ENTRY_MS) {
    ctx.addIssue({ code: 'custom', path: ['end'], message: 'An entry can be at most 24 hours. Split longer work into several entries.' })
  }
})

export type TimeEntryInput = z.infer<typeof timeEntryInputSchema>
