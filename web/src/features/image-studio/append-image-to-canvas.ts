/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  loadProjects,
  saveProjects,
} from '@/features/canvas/infinite/canvas-store'
import type { InfiniteNode } from '@/features/canvas/infinite/types'
import { useAuthStore } from '@/stores/auth-store'

const DEFAULT_NODE = { width: 320, height: 260 }

/**
 * Drop a generated image onto the active infinite-canvas board. The board and
 * its media live in the browser, so this writes straight into the same store the
 * canvas page reads on mount.
 */
export async function appendImageToCanvas(args: {
  source: string
  title: string
}): Promise<string> {
  const auth = useAuthStore.getState().auth
  const ownerId = auth.user?.id
  const sessionId = auth.session?.sid
  if (!ownerId) throw new Error('no board')
  const stored = await loadProjects(ownerId)
  const current = useAuthStore.getState().auth
  if (current.user?.id !== ownerId || current.session?.sid !== sessionId) {
    throw new Error('canvas account changed')
  }
  if (!stored) throw new Error('no board')

  const active =
    stored.projects.find((project) => project.id === stored.activeId) ??
    stored.projects[0]
  if (!active) throw new Error('no board')

  const rightEdge = active.board.nodes.reduce(
    (max, node) => Math.max(max, node.position.x + node.width),
    Number.NEGATIVE_INFINITY
  )
  const topEdge = active.board.nodes.length
    ? Math.min(...active.board.nodes.map((node) => node.position.y))
    : 0

  const node: InfiniteNode = {
    id: `image-${Date.now().toString(36)}`,
    kind: 'image',
    title: args.title.slice(0, 32) || 'Image',
    position: Number.isFinite(rightEdge)
      ? { x: rightEdge + 80, y: topEdge }
      : { x: 0, y: 0 },
    width: DEFAULT_NODE.width,
    height: DEFAULT_NODE.height,
    content: args.source,
    status: 'success',
  }

  await saveProjects(
    {
      ...stored,
      projects: stored.projects.map((project) =>
        project.id === active.id
          ? {
              ...project,
              board: {
                ...project.board,
                nodes: [...project.board.nodes, node],
              },
              updatedAt: Date.now(),
            }
          : project
      ),
    },
    ownerId
  )

  const afterSave = useAuthStore.getState().auth
  if (afterSave.user?.id !== ownerId || afterSave.session?.sid !== sessionId) {
    throw new Error('canvas account changed')
  }
  return active.name
}
