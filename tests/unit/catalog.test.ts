// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Task } from '../../shared/schemas/catalog'
import { nestTasks } from '../../app/features/catalog/lib/catalog'

const task = (id: number, parent = 0): Task => ({ id, parent, name: `T${id}`, status: 'active', createdAt: '', updatedAt: '' })
const shape = (nodes: ReturnType<typeof nestTasks>): unknown => nodes.map(n => [n.task.id, shape(n.children)])

describe('nestTasks', () => {
  it('keeps tasks with parent 0 at the top level', () => {
    expect(shape(nestTasks([task(1), task(2)]))).toEqual([[1, []], [2, []]])
  })

  it('nests a task under a parent from the same list', () => {
    expect(shape(nestTasks([task(1), task(2, 1), task(3, 2)]))).toEqual([[1, [[2, [[3, []]]]]]])
  })

  it('shows tasks whose parent is not loaded at the top level instead of hiding them', () => {
    expect(shape(nestTasks([task(1, 99)]))).toEqual([[1, []]])
  })

  it('never loses tasks in a parent cycle', () => {
    const ids = (nodes: ReturnType<typeof nestTasks>): number[] => nodes.flatMap(n => [n.task.id, ...ids(n.children)])
    expect(ids(nestTasks([task(1, 2), task(2, 1), task(3, 3)])).sort()).toEqual([1, 2, 3])
  })
})
