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
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { loadProjects } from '../canvas-store'
import { useCanvasProjects } from '../use-canvas-projects'

function login(id: number) {
  useAuthStore.getState().auth.setUser({ id, username: `user-${id}`, role: 1 })
}

beforeEach(() => {
  window.localStorage.clear()
  login(11)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  useAuthStore.getState().auth.reset()
})

describe('canvas project ownership', () => {
  it('does not hydrate the unowned single-board legacy key into an account', async () => {
    const legacy = JSON.stringify({
      nodes: [{ id: 'private-a' }],
      connections: [],
      viewport: { x: 0, y: 0, k: 1 },
    })
    window.localStorage.setItem('infinite-canvas-board-v1', legacy)
    const { result } = renderHook(() => useCanvasProjects())
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.activeBoard.nodes).toEqual([])
    expect(window.localStorage.getItem('infinite-canvas-board-v1')).toBe(legacy)
  })

  it('resets visible projects on account change and keeps delayed updates owned by A', async () => {
    const { result } = renderHook(() => useCanvasProjects())
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    act(() =>
      result.current.renameProject(result.current.activeId, 'private-board-A')
    )
    const lateUpdate = result.current.updateBoard
    act(() => login(22))
    expect(result.current.activeProject.name).not.toBe('private-board-A')
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    act(() =>
      lateUpdate((board) => ({ ...board, viewport: { x: 99, y: 0, k: 1 } }))
    )
    expect(result.current.activeBoard.viewport.x).toBe(0)
  })

  it('ignores an account A IndexedDB read that finishes after B has hydrated', async () => {
    const reads: { result?: unknown; onsuccess?: () => void }[] = []
    const database = {
      close: vi.fn(),
      transaction: () => ({
        objectStore: () => ({
          get: () => {
            const read = {}
            reads.push(read)
            return read
          },
        }),
      }),
    }
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request: { result: typeof database; onsuccess?: () => void } = {
          result: database,
        }
        queueMicrotask(() => request.onsuccess?.())
        return request
      },
    })
    const { result } = renderHook(() => useCanvasProjects())
    await waitFor(() => expect(reads).toHaveLength(1))
    act(() => login(22))
    await waitFor(() => expect(reads).toHaveLength(2))
    await act(async () => reads[1].onsuccess?.())
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    const accountBId = result.current.activeId
    await act(async () => {
      reads[0].result = {
        projects: [{ id: 'private-A', name: 'private A' }],
        activeId: 'private-A',
      }
      reads[0].onsuccess?.()
    })
    expect(result.current.activeId).toBe(accountBId)
    expect(
      result.current.projects.some((project) => project.id === 'private-A')
    ).toBe(false)
  })

  it('applies a delayed generation update to its original project after switching boards', async () => {
    const { result } = renderHook(() => useCanvasProjects())
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    vi.useFakeTimers()
    const originalId = result.current.activeId
    const originalUpdate = result.current.updateBoard
    let finish!: () => void
    const generation = new Promise<void>((resolve) => {
      finish = resolve
    }).then(() => {
      originalUpdate((board) => ({ ...board, viewport: { x: 42, y: 0, k: 1 } }))
    })
    act(() => result.current.addProject('Board B'))
    await act(async () => {
      finish()
      await generation
    })
    expect(result.current.activeBoard.viewport.x).toBe(0)
    expect(
      result.current.projects.find((project) => project.id === originalId)
        ?.board.viewport.x
    ).toBe(42)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(
      (await loadProjects(11))?.projects.find(
        (project) => project.id === originalId
      )?.board.viewport.x
    ).toBe(42)
  })
})
