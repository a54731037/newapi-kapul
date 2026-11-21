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
import { describe, expect, it } from 'vitest'

import type { InfiniteNode } from '../types'
import {
  clampZoom,
  connectionPath,
  fitViewport,
  normalizeRect,
  rectsIntersect,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
} from '../viewport'

function node(overrides: Partial<InfiniteNode>): InfiniteNode {
  return {
    id: 'n1',
    kind: 'image',
    title: 'Image',
    position: { x: 0, y: 0 },
    width: 200,
    height: 120,
    content: '',
    ...overrides,
  }
}

describe('infinite canvas viewport', () => {
  it('round-trips between screen and world space', () => {
    const viewport = { x: 120, y: -40, k: 1.5 }
    const world = screenToWorld(viewport, { x: 300, y: 200 })
    expect(worldToScreen(viewport, world)).toEqual({ x: 300, y: 200 })
  })

  it('keeps the anchored world point under the cursor when zooming', () => {
    const viewport = { x: 0, y: 0, k: 1 }
    const anchor = { x: 400, y: 300 }
    const before = screenToWorld(viewport, anchor)
    const next = zoomAtPoint(viewport, anchor, 2)
    const after = screenToWorld(next, anchor)
    expect(next.k).toBe(2)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('clamps zoom to the supported range', () => {
    expect(clampZoom(0.001)).toBe(0.1)
    expect(clampZoom(99)).toBe(3)
  })

  it('fits every node into the surface with padding', () => {
    const nodes = [
      node({ id: 'a', position: { x: -400, y: 100 } }),
      node({ id: 'b', position: { x: 600, y: 500 }, width: 300, height: 180 }),
    ]
    const viewport = fitViewport(nodes, { width: 1000, height: 600 }, 50)
    expect(viewport.k).toBeGreaterThan(0)
    expect(viewport.k).toBeLessThanOrEqual(1)
    const topLeft = worldToScreen(viewport, { x: -400, y: 100 })
    const bottomRight = worldToScreen(viewport, { x: 900, y: 680 })
    expect(topLeft.x).toBeGreaterThanOrEqual(0)
    expect(topLeft.y).toBeGreaterThanOrEqual(0)
    expect(bottomRight.x).toBeLessThanOrEqual(1000)
    expect(bottomRight.y).toBeLessThanOrEqual(600)
  })

  it('normalizes a marquee dragged in any direction', () => {
    expect(normalizeRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    })
  })

  it('detects overlapping and disjoint node rectangles', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    expect(rectsIntersect(a, { x: 50, y: 50, width: 100, height: 100 })).toBe(
      true
    )
    expect(rectsIntersect(a, { x: 200, y: 0, width: 100, height: 100 })).toBe(
      false
    )
  })

  it('draws connections from the source right edge to the target left edge', () => {
    const from = node({
      id: 'a',
      position: { x: 0, y: 0 },
      width: 200,
      height: 100,
    })
    const to = node({
      id: 'b',
      position: { x: 400, y: 200 },
      width: 200,
      height: 100,
    })
    const path = connectionPath(from, to)
    expect(path.start).toEqual({ x: 200, y: 50 })
    expect(path.end).toEqual({ x: 400, y: 250 })
    expect(path.d.startsWith('M 200 50 C ')).toBe(true)
  })
})
