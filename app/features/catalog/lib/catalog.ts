import type { Task } from '#shared/schemas/catalog'
import type { TaskNode } from '../model/types'

/**
 * Nests tasks under their `parent` when that parent is in the same list; everything else is top
 * level. The API doesn't fully document `parent`, so unknown parents never hide a task.
 */
export function nestTasks(tasks: Task[]): TaskNode[] {
  const nodes = new Map(tasks.map(task => [task.id, { task, children: [] as TaskNode[] }]))
  const roots: TaskNode[] = []
  for (const node of nodes.values()) {
    const parent = node.task.parent ? nodes.get(node.task.parent) : undefined
    if (parent && parent !== node && !isAncestor(node, parent, nodes)) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** Guards against parent cycles (a → b → a) so no task disappears. */
function isAncestor(node: TaskNode, candidate: TaskNode, nodes: Map<number, TaskNode>): boolean {
  let current: TaskNode | undefined = candidate
  const seen = new Set<number>()
  while (current?.task.parent && !seen.has(current.task.id)) {
    seen.add(current.task.id)
    if (current.task.parent === node.task.id) return true
    current = nodes.get(current.task.parent)
  }
  return false
}
