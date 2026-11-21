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
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { InfiniteBoard } from '../types'
import { useBoardHistory } from '../use-board-history'

const EMPTY: InfiniteBoard = {
  nodes: [],
  connections: [],
  viewport: { x: 0, y: 0, k: 1 },
}

function useHarness(projectId = 'board-1') {
  const [board, setBoard] = useState<InfiniteBoard>(EMPTY)
  const updateBoard = (updater: (board: InfiniteBoard) => InfiniteBoard) =>
    setBoard((previous) => updater(previous))
  const history = useBoardHistory(projectId, board, updateBoard)
  return { board, history }
}

describe('useBoardHistory', () => {
  it('undoes and redoes a committed mutation', () => {
    const { result } = renderHook(() => useHarness())

    act(() => {
      result.current.history.commit((board) => ({
        ...board,
        viewport: { x: 40, y: 0, k: 1 },
      }))
    })
    expect(result.current.board.viewport.x).toBe(40)

    act(() => {
      result.current.history.undo()
    })
    expect(result.current.board.viewport.x).toBe(0)

    act(() => {
      result.current.history.redo()
    })
    expect(result.current.board.viewport.x).toBe(40)
  })

  it('collapses rapid mutations into one history entry', () => {
    const { result } = renderHook(() => useHarness())

    act(() => {
      for (let step = 1; step <= 3; step += 1) {
        result.current.history.commit((board) => ({
          ...board,
          viewport: { x: step * 10, y: 0, k: 1 },
        }))
      }
    })
    expect(result.current.board.viewport.x).toBe(30)

    act(() => {
      result.current.history.undo()
    })
    // One undo rewinds the whole burst, not a single frame.
    expect(result.current.board.viewport.x).toBe(0)
  })

  it('exposes canUndo/canRedo according to the stack state', () => {
    const { result } = renderHook(() => useHarness())
    expect(result.current.history.canUndo).toBe(false)
    expect(result.current.history.canRedo).toBe(false)

    act(() => {
      result.current.history.commit((board) => ({
        ...board,
        viewport: { x: 5, y: 5, k: 1 },
      }))
    })
    expect(result.current.history.canUndo).toBe(true)

    act(() => {
      result.current.history.undo()
    })
    expect(result.current.history.canRedo).toBe(true)
  })

  it('clears the stacks when the project changes', () => {
    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string }) => useHarness(projectId),
      { initialProps: { projectId: 'board-1' } }
    )

    act(() => {
      result.current.history.commit((board) => ({
        ...board,
        viewport: { x: 9, y: 0, k: 1 },
      }))
    })
    expect(result.current.history.canUndo).toBe(true)

    rerender({ projectId: 'board-2' })
    expect(result.current.history.canUndo).toBe(false)
  })

  it('does nothing when undo runs on an empty stack', () => {
    const { result } = renderHook(() => useHarness())
    const spy = vi.fn()
    act(() => {
      spy()
      result.current.history.undo()
    })
    expect(result.current.board).toEqual(EMPTY)
  })
})
