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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadProjects,
  saveProjects,
} from '@/features/canvas/infinite/canvas-store'
import type { CanvasProject } from '@/features/canvas/infinite/types'
import { useAuthStore } from '@/stores/auth-store'

import { appendImageToCanvas } from '../append-image-to-canvas'

const project: CanvasProject = {
  id: 'board-1',
  name: 'Board 1',
  createdAt: 1,
  updatedAt: 1,
  board: {
    nodes: [
      {
        id: 'node-1',
        kind: 'prompt',
        title: 'Prompt',
        position: { x: 100, y: 40 },
        width: 200,
        height: 120,
        content: 'hello',
      },
    ],
    connections: [],
    viewport: { x: 0, y: 0, k: 1 },
  },
}

describe('appendImageToCanvas', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    useAuthStore.getState().auth.setUser({ id: 1, username: 'owner', role: 1 })
    await saveProjects({ projects: [project], activeId: project.id }, 1)
  })

  it('appends an image node to the right of existing content', async () => {
    const boardName = await appendImageToCanvas({
      source: 'data:image/png;base64,AAAA',
      title: 'a bright red circle',
    })
    expect(boardName).toBe('Board 1')

    const stored = await loadProjects(1)
    const nodes = stored?.projects[0].board.nodes ?? []
    expect(nodes).toHaveLength(2)
    const added = nodes[1]
    expect(added.kind).toBe('image')
    expect(added.content).toBe('data:image/png;base64,AAAA')
    expect(added.status).toBe('success')
    // Right of the existing node (100 + 200) plus the 80px gutter.
    expect(added.position.x).toBe(380)
    expect(added.position.y).toBe(40)
  })

  it('does not return the previous account board name when the account changes during save', async () => {
    const storage = window.localStorage
    const setItem = storage.setItem.bind(storage)
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      setItem(key, value)
      useAuthStore
        .getState()
        .auth.setUser({ id: 2, username: 'next-user', role: 1 })
    })
    await expect(
      appendImageToCanvas({ source: 'data:image/png;base64,AAAA', title: 'x' })
    ).rejects.toThrow('canvas account changed')
  })

  it('throws when no board exists yet', async () => {
    window.localStorage.clear()
    await expect(
      appendImageToCanvas({ source: 'data:image/png;base64,AAAA', title: 'x' })
    ).rejects.toThrow('no board')
  })
})
