import { z } from 'zod'

// Plain z.object strips unknown keys, so upstream fields we don't know never reach the browser.

export const clientSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullish(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const projectSchema = z.object({
  id: z.number().int(),
  clientId: z.number().int(),
  name: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const taskSchema = z.object({
  id: z.number().int(),
  // The real API sends projectId and no `parent`, despite the docs. Nothing reads either, so a
  // documented `parent` is simply dropped.
  projectId: z.number().int().optional(),
  name: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Client = z.infer<typeof clientSchema>
export type Project = z.infer<typeof projectSchema>
export type Task = z.infer<typeof taskSchema>
