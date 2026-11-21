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

import {
  alignNodes,
  bringToFront,
  cloneNodes,
  distributeNodes,
  sendToBack,
} from '../layout'
import type { InfiniteNode } from '../types'

function node(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 80
): InfiniteNode {
  return {
    id,
    kind: 'prompt',
    title: id,
    position: { x, y },
    width,
    height,
    content: '',
  }
}

const nodes = [node('a', 0, 0), node('b', 200, 120), node('c', 400, 60)]

describe('canvas layout helpers', () => {
  it('aligns a selection to its left edge', () => {
    const patches = alignNodes(nodes, ['a', 'b', 'c'], 'left')
    expect(patches.map((patch) => patch.position.x)).toEqual([0, 0, 0])
  })

  it('aligns to the right edge using each width', () => {
    const patches = alignNodes(nodes, ['a', 'b'], 'right')
    // Bounding box right edge is 300, so both nodes end at 300.
    expect(patches).toEqual([
      { id: 'a', position: { x: 200, y: 0 } },
      { id: 'b', position: { x: 200, y: 120 } },
    ])
  })

  it('centers a selection vertically inside its bounding box', () => {
    const patches = alignNodes(nodes, ['a', 'b', 'c'], 'vcenter')
    const center = (0 + 200) / 2
    expect(patches[0].position.y).toBe(center - 40)
    expect(patches[1].position.y).toBe(center - 40)
  })

  it('ignores alignments with fewer than two nodes', () => {
    expect(alignNodes(nodes, ['a'], 'left')).toEqual([])
  })

  it('distributes the middle node evenly between the outer ones', () => {
    const patches = distributeNodes(
      [node('a', 0, 0), node('b', 100, 0), node('c', 400, 0)],
      ['a', 'b', 'c'],
      'x'
    )
    expect(patches).toEqual([{ id: 'b', position: { x: 200, y: 0 } }])
  })

  it('requires three nodes to distribute', () => {
    expect(distributeNodes(nodes, ['a', 'b'], 'x')).toEqual([])
  })

  it('moves the selection to the top of the paint order', () => {
    const ordered = bringToFront(nodes, ['a']).map((item) => item.id)
    expect(ordered).toEqual(['b', 'c', 'a'])
  })

  it('moves the selection behind everything else', () => {
    const ordered = sendToBack(nodes, ['c']).map((item) => item.id)
    expect(ordered).toEqual(['c', 'a', 'b'])
  })

  it('clones nodes with fresh ids and an offset', () => {
    const clones = cloneNodes(nodes, ['a'], 24, 'x')
    expect(clones).toHaveLength(1)
    expect(clones[0].id).toBe('a-copy-x-0')
    expect(clones[0].position).toEqual({ x: 24, y: 24 })
  })
})
