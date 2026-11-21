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
  MAX_ZOOM,
  MIN_ZOOM,
  type CanvasPoint,
  type CanvasViewport,
  type InfiniteNode,
} from './types'

export function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM)
}

/** Screen (container-relative) point → world point. */
export function screenToWorld(
  viewport: CanvasViewport,
  point: CanvasPoint
): CanvasPoint {
  return {
    x: (point.x - viewport.x) / viewport.k,
    y: (point.y - viewport.y) / viewport.k,
  }
}

/** World point → screen (container-relative) point. */
export function worldToScreen(
  viewport: CanvasViewport,
  point: CanvasPoint
): CanvasPoint {
  return {
    x: point.x * viewport.k + viewport.x,
    y: point.y * viewport.k + viewport.y,
  }
}

/**
 * Zoom around a fixed screen anchor so the world point under the cursor stays
 * put — same behaviour as the reference canvas.
 */
export function zoomAtPoint(
  viewport: CanvasViewport,
  anchor: CanvasPoint,
  nextZoom: number
): CanvasViewport {
  const k = clampZoom(nextZoom)
  const world = screenToWorld(viewport, anchor)
  return {
    k,
    x: anchor.x - world.x * k,
    y: anchor.y - world.y * k,
  }
}

/** Multiplicative zoom step used by the wheel handler and the zoom buttons. */
export function zoomByFactor(
  viewport: CanvasViewport,
  anchor: CanvasPoint,
  factor: number
): CanvasViewport {
  return zoomAtPoint(viewport, anchor, viewport.k * factor)
}

export function zoomStep(viewport: CanvasViewport, direction: 1 | -1): number {
  return clampZoom(viewport.k * (direction === 1 ? 1.2 : 1 / 1.2))
}

export function nodeBounds(nodes: InfiniteNode[]) {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + node.width)
    maxY = Math.max(maxY, node.position.y + node.height)
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/** Fit every node into the viewport with padding, clamped to sane zoom levels. */
export function fitViewport(
  nodes: InfiniteNode[],
  size: { width: number; height: number },
  padding = 80
): CanvasViewport {
  if (nodes.length === 0) {
    return { x: size.width / 2, y: size.height / 2, k: 1 }
  }
  const bounds = nodeBounds(nodes)
  const availableWidth = Math.max(size.width - padding * 2, 1)
  const availableHeight = Math.max(size.height - padding * 2, 1)
  const k = clampZoom(
    Math.min(
      availableWidth / Math.max(bounds.width, 1),
      availableHeight / Math.max(bounds.height, 1),
      1
    )
  )
  return {
    k,
    x: (size.width - bounds.width * k) / 2 - bounds.minX * k,
    y: (size.height - bounds.height * k) / 2 - bounds.minY * k,
  }
}

export function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function normalizeRect(start: CanvasPoint, current: CanvasPoint) {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  }
}

/**
 * Cubic bezier from the right edge of the source node to the left edge of the
 * target node, mirroring the reference canvas' connection shape.
 */
export function connectionPath(
  from: InfiniteNode,
  to: InfiniteNode
): { d: string; start: CanvasPoint; end: CanvasPoint } {
  const start = {
    x: from.position.x + from.width,
    y: from.position.y + from.height / 2,
  }
  const end = {
    x: to.position.x,
    y: to.position.y + to.height / 2,
  }
  const curve = Math.max(Math.abs(end.x - start.x) * 0.5, 60)
  return {
    start,
    end,
    d: `M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${end.x - curve} ${end.y}, ${end.x} ${end.y}`,
  }
}
