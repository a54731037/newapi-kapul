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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadProjects, saveProjects } from '../canvas-store'
import type { CanvasProject } from '../types'

const project: CanvasProject = {
  id: 'project-1',
  name: 'Board 1',
  createdAt: 1,
  updatedAt: 2,
  board: {
    nodes: [
      {
        id: 'node-1',
        kind: 'image',
        title: 'Image',
        position: { x: 0, y: 0 },
        width: 200,
        height: 200,
        content: 'data:image/png;base64,AAAA',
      },
    ],
    connections: [],
    viewport: { x: 0, y: 0, k: 1 },
  },
}

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('canvas-store', () => {
  it('persists blob media bytes but does not fetch text content or remote media', async () => {
    const fetchMedia = vi.fn(async () => ({
      ok: true,
      blob: async () =>
        new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    }))
    vi.stubGlobal('fetch', fetchMedia)
    const nodes = [
      {
        ...project.board.nodes[0],
        id: 'local-image',
        kind: 'image',
        content: 'blob:local-image',
      },
      {
        ...project.board.nodes[0],
        id: 'same-local-image',
        kind: 'image',
        content: 'blob:local-image',
      },
      {
        ...project.board.nodes[0],
        id: 'local-audio',
        kind: 'audio',
        content: 'blob:local-audio',
      },
      {
        ...project.board.nodes[0],
        id: 'text',
        kind: 'prompt',
        content: 'blob:plain-text',
      },
      {
        ...project.board.nodes[0],
        id: 'remote',
        kind: 'image',
        content: 'https://media.example/image.png',
      },
    ]
    await saveProjects(
      {
        projects: [{ ...project, board: { ...project.board, nodes } }],
        activeId: project.id,
      },
      1
    )
    const stored = await loadProjects(1)
    expect(
      stored?.projects[0].board.nodes.slice(0, 3).map((node) => node.content)
    ).toEqual(Array(3).fill('data:image/png;base64,AQID'))
    expect(stored?.projects[0].board.nodes[3].content).toBe('blob:plain-text')
    expect(stored?.projects[0].board.nodes[4].content).toBe(
      'https://media.example/image.png'
    )
    expect(fetchMedia).toHaveBeenCalledTimes(2)
    expect(fetchMedia).toHaveBeenCalledWith('blob:local-image', {
      credentials: 'omit',
    })
  })

  it('preserves the last saved board when reading a media blob fails', async () => {
    await saveProjects({ projects: [project], activeId: project.id }, 1)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('blob expired')
      })
    )
    const changed = {
      ...project,
      board: {
        ...project.board,
        nodes: [{ ...project.board.nodes[0], content: 'blob:expired' }],
      },
    }
    await expect(
      saveProjects({ projects: [changed], activeId: project.id }, 1)
    ).rejects.toThrow('blob expired')
    expect((await loadProjects(1))?.projects[0].board.nodes[0].content).toBe(
      'data:image/png;base64,AAAA'
    )
    await saveProjects(
      { projects: [{ ...project, name: 'recovered' }], activeId: project.id },
      1
    )
    expect((await loadProjects(1))?.projects[0].name).toBe('recovered')
  })

  it('keeps the newest snapshot when an earlier media conversion is delayed', async () => {
    let finish!: (response: { ok: boolean; blob: () => Promise<Blob> }) => void
    const mediaResponse = new Promise<{
      ok: boolean
      blob: () => Promise<Blob>
    }>((resolve) => {
      finish = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => mediaResponse)
    )
    const old = {
      ...project,
      name: 'old',
      board: {
        ...project.board,
        nodes: [{ ...project.board.nodes[0], content: 'blob:slow' }],
      },
    }
    const first = saveProjects({ projects: [old], activeId: project.id }, 1)
    const latest = saveProjects(
      { projects: [{ ...project, name: 'latest' }], activeId: project.id },
      1
    )
    finish({
      ok: true,
      blob: async () => new Blob(['rendered'], { type: 'image/png' }),
    })
    await Promise.all([first, latest])
    expect((await loadProjects(1))?.projects[0].name).toBe('latest')
  })

  it('keeps boards separate for two accounts in one browser', async () => {
    await saveProjects({ projects: [project], activeId: project.id }, 11)
    expect(await loadProjects(22)).toBeNull()
    expect((await loadProjects(11))?.projects[0].name).toBe('Board 1')
  })

  it('preserves unowned legacy boards without assigning them to the next login', async () => {
    const legacy = JSON.stringify({ projects: [project], activeId: project.id })
    window.localStorage.setItem('infinite-canvas-projects-v1', legacy)
    expect(await loadProjects(33)).toBeNull()
    expect(window.localStorage.getItem('infinite-canvas-projects-v1')).toBe(
      legacy
    )
  })

  it('round-trips boards through the localStorage fallback', async () => {
    // jsdom has no IndexedDB, which exercises the fallback path used on
    // browsers that block the database.
    await saveProjects({ projects: [project], activeId: project.id }, 1)
    const loaded = await loadProjects(1)
    expect(loaded?.activeId).toBe(project.id)
    expect(loaded?.projects[0].board.nodes[0].content).toBe(
      'data:image/png;base64,AAAA'
    )
  })

  it('returns null when nothing was stored yet', async () => {
    window.localStorage.clear()
    expect(await loadProjects(1)).toBeNull()
  })

  it('survives a corrupted store instead of throwing', async () => {
    window.localStorage.setItem('infinite-canvas-projects-v1', '{not json')
    expect(await loadProjects(1)).toBeNull()
  })
})
