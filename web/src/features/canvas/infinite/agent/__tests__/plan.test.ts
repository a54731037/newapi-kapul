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
import { describe, expect, it, vi } from 'vitest'

import type { InfiniteNode, InfiniteNodeKind } from '../../types'
import { applyPlan, parsePlan, planFromText } from '../plan'

describe('canvas agent planner', () => {
  it('maps an image request to image nodes with the requested count', () => {
    const actions = planFromText('添加 3 个图像节点')
    expect(actions.filter((action) => action.type === 'add-node')).toHaveLength(
      3
    )
    expect(actions[0]).toMatchObject({ type: 'add-node', kind: 'image' })
  })

  it('adds a clear action for reset requests', () => {
    const actions = planFromText('清空画布')
    expect(actions).toContainEqual({ type: 'clear' })
  })

  it('reads arrangement layout from the instruction', () => {
    expect(planFromText('排布成单行')).toContainEqual({
      type: 'arrange',
      layout: 'row',
    })
    expect(planFromText('整理成网格')).toContainEqual({
      type: 'arrange',
      layout: 'grid',
    })
  })

  it('falls back to a prompt node for unmatched text', () => {
    const actions = planFromText('一段关于城市夜景的文案')
    expect(actions).toEqual([
      {
        type: 'add-node',
        kind: 'prompt',
        title: '一段关于城市夜景的文案',
        content: '一段关于城市夜景的文案',
      },
    ])
  })

  it('parses a fenced JSON plan and drops unknown actions', () => {
    const raw = [
      '```json',
      '{"actions":[{"type":"add-node","kind":"sticky"},{"type":"drop-table"}]}',
      '```',
    ].join('\n')
    expect(parsePlan(raw)).toEqual([{ type: 'add-node', kind: 'sticky' }])
  })

  it('returns an empty plan for malformed model output', () => {
    expect(parsePlan('no json here')).toEqual([])
    expect(parsePlan('{"actions":"nope"}')).toEqual([])
  })

  it('executes add-node and arrange through the provided operations', () => {
    const added: InfiniteNodeKind[] = []
    const arrange = vi.fn()
    const applied = applyPlan(
      [
        { type: 'add-node', kind: 'video', title: 'Clip', content: 'waves' },
        { type: 'arrange', layout: 'row' },
      ],
      {
        addNode: (kind, content, title) => {
          added.push(kind)
          return {
            id: 'node-1',
            kind,
            title: title ?? '',
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            content: content ?? '',
          } satisfies InfiniteNode
        },
        connect: vi.fn(),
        arrange,
        clear: vi.fn(),
      }
    )
    expect(applied).toBe(2)
    expect(added).toEqual(['video'])
    expect(arrange).toHaveBeenCalledWith('row')
  })
})
