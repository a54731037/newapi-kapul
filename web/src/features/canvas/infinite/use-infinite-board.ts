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
import { useCallback } from 'react'

import { nextStickyTint, nodeTypeDefinition } from './node-registry'
import type {
  CanvasPoint,
  InfiniteBoard,
  InfiniteConnection,
  InfiniteNode,
  InfiniteNodeKind,
} from './types'

let sequence = 0
function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}-${Date.now().toString(36)}-${sequence}`
}

/** Board operations on top of the active project's board. */
export function useBoardOperations(
  board: InfiniteBoard,
  updateBoard: (updater: (board: InfiniteBoard) => InfiniteBoard) => void
) {
  const addNode = useCallback(
    (kind: InfiniteNodeKind, position?: CanvasPoint): InfiniteNode => {
      const definition = nodeTypeDefinition(kind)
      const stickyTint =
        kind === 'sticky'
          ? nextStickyTint(
              board.nodes.filter((node) => node.kind === 'sticky').length % 4
            )
          : undefined
      const node: InfiniteNode = {
        id: nextId(kind),
        kind,
        title: definition.defaults.title,
        position: position ?? { x: 0, y: 0 },
        width: definition.defaults.width,
        height: definition.defaults.height,
        content: definition.defaults.content,
        status: 'idle',
        tint: stickyTint,
      }
      updateBoard((previous) => ({
        ...previous,
        nodes: [...previous.nodes, node],
      }))
      return node
    },
    [board.nodes, updateBoard]
  )

  const updateNode = useCallback(
    (id: string, patch: Partial<InfiniteNode>) => {
      updateBoard((previous) => ({
        ...previous,
        nodes: previous.nodes.map((node) =>
          node.id === id ? { ...node, ...patch } : node
        ),
      }))
    },
    [updateBoard]
  )

  const removeNodes = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      updateBoard((previous) => ({
        ...previous,
        nodes: previous.nodes.filter((node) => !ids.includes(node.id)),
        connections: previous.connections.filter(
          (connection) =>
            !ids.includes(connection.fromNodeId) &&
            !ids.includes(connection.toNodeId)
        ),
      }))
    },
    [updateBoard]
  )

  const connect = useCallback(
    (fromNodeId: string, toNodeId: string) => {
      if (fromNodeId === toNodeId) return
      updateBoard((previous) => {
        const exists = previous.connections.some(
          (connection) =>
            connection.fromNodeId === fromNodeId &&
            connection.toNodeId === toNodeId
        )
        if (exists) return previous
        const connection: InfiniteConnection = {
          id: nextId('edge'),
          fromNodeId,
          toNodeId,
        }
        return {
          ...previous,
          connections: [...previous.connections, connection],
        }
      })
    },
    [updateBoard]
  )

  const clearBoard = useCallback(() => {
    updateBoard((previous) => ({ ...previous, nodes: [], connections: [] }))
  }, [updateBoard])

  return { addNode, updateNode, removeNodes, connect, clearBoard }
}
