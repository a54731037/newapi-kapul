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
import type { CanvasPoint, InfiniteNode } from './types'

export type AlignMode =
  | 'left'
  | 'hcenter'
  | 'right'
  | 'top'
  | 'vcenter'
  | 'bottom'

export type PositionPatch = { id: string; position: CanvasPoint }

function selected(nodes: InfiniteNode[], ids: string[]): InfiniteNode[] {
  return nodes.filter((node) => ids.includes(node.id))
}

/** Align the selection to its own bounding box (not the board). */
export function alignNodes(
  nodes: InfiniteNode[],
  ids: string[],
  mode: AlignMode
): PositionPatch[] {
  const targets = selected(nodes, ids)
  if (targets.length < 2) return []

  const minX = Math.min(...targets.map((node) => node.position.x))
  const maxX = Math.max(...targets.map((node) => node.position.x + node.width))
  const minY = Math.min(...targets.map((node) => node.position.y))
  const maxY = Math.max(...targets.map((node) => node.position.y + node.height))

  return targets.map((node) => {
    switch (mode) {
      case 'left':
        return { id: node.id, position: { ...node.position, x: minX } }
      case 'right':
        return {
          id: node.id,
          position: { ...node.position, x: maxX - node.width },
        }
      case 'hcenter':
        return {
          id: node.id,
          position: {
            ...node.position,
            x: (minX + maxX) / 2 - node.width / 2,
          },
        }
      case 'top':
        return { id: node.id, position: { ...node.position, y: minY } }
      case 'bottom':
        return {
          id: node.id,
          position: { ...node.position, y: maxY - node.height },
        }
      default:
        return {
          id: node.id,
          position: {
            ...node.position,
            y: (minY + maxY) / 2 - node.height / 2,
          },
        }
    }
  })
}

/** Spread the selection evenly between its first and last node. */
export function distributeNodes(
  nodes: InfiniteNode[],
  ids: string[],
  axis: 'x' | 'y'
): PositionPatch[] {
  const targets = selected(nodes, ids)
  if (targets.length < 3) return []

  const sorted = [...targets].sort((a, b) =>
    axis === 'x' ? a.position.x - b.position.x : a.position.y - b.position.y
  )
  const first = sorted[0]
  const last = sorted.at(-1) as InfiniteNode
  const start = axis === 'x' ? first.position.x : first.position.y
  const end = axis === 'x' ? last.position.x : last.position.y
  const step = (end - start) / (sorted.length - 1)

  return sorted.slice(1, -1).map((node, index) => {
    const value = start + step * (index + 1)
    return {
      id: node.id,
      position:
        axis === 'x'
          ? { ...node.position, x: value }
          : { ...node.position, y: value },
    }
  })
}

/** Array order is z-order: later entries paint on top. */
export function bringToFront(
  nodes: InfiniteNode[],
  ids: string[]
): InfiniteNode[] {
  return [
    ...nodes.filter((node) => !ids.includes(node.id)),
    ...nodes.filter((node) => ids.includes(node.id)),
  ]
}

export function sendToBack(
  nodes: InfiniteNode[],
  ids: string[]
): InfiniteNode[] {
  return [
    ...nodes.filter((node) => ids.includes(node.id)),
    ...nodes.filter((node) => !ids.includes(node.id)),
  ]
}

/** Copy selected nodes into standalone clones offset by `offset`. */
export function cloneNodes(
  nodes: InfiniteNode[],
  ids: string[],
  offset = 40,
  suffix = Date.now().toString(36)
): InfiniteNode[] {
  return selected(nodes, ids).map((node, index) => ({
    ...node,
    id: `${node.id}-copy-${suffix}-${index}`,
    position: {
      x: node.position.x + offset,
      y: node.position.y + offset,
    },
    status: 'idle',
  }))
}
