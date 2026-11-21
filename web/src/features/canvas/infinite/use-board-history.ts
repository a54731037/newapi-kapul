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
import { useCallback, useRef, useState } from 'react'

import type { InfiniteBoard } from './types'

const COALESCE_MS = 350
const HISTORY_LIMIT = 60

/**
 * Undo/redo for the active board. Mutations that land within `COALESCE_MS`
 * (drag frames, slider bursts) collapse into a single history entry.
 */
export function useBoardHistory(
  projectId: string,
  board: InfiniteBoard,
  updateBoard: (updater: (board: InfiniteBoard) => InfiniteBoard) => void
) {
  const [past, setPast] = useState<InfiniteBoard[]>([])
  const [future, setFuture] = useState<InfiniteBoard[]>([])
  const [trackedProject, setTrackedProject] = useState(projectId)
  const lastCommit = useRef(0)

  // Switching boards starts a fresh history; adjusting state during render is
  // the documented way to react to a prop change without an extra effect.
  if (trackedProject !== projectId) {
    setTrackedProject(projectId)
    setPast([])
    setFuture([])
  }

  const commit = useCallback(
    (updater: (board: InfiniteBoard) => InfiniteBoard) => {
      const now = Date.now()
      if (now - lastCommit.current > COALESCE_MS) {
        setPast((previous) => [...previous, board].slice(-HISTORY_LIMIT))
        setFuture([])
      }
      lastCommit.current = now
      updateBoard(updater)
    },
    [board, updateBoard]
  )

  const undo = useCallback(() => {
    const snapshot = past.at(-1)
    if (!snapshot) return
    setPast((previous) => previous.slice(0, -1))
    setFuture((previous) => [board, ...previous].slice(0, HISTORY_LIMIT))
    lastCommit.current = 0
    updateBoard(() => snapshot)
  }, [board, past, updateBoard])

  const redo = useCallback(() => {
    if (future.length === 0) return
    const snapshot = future[0]
    setFuture((previous) => previous.slice(1))
    setPast((previous) => [...previous, board].slice(-HISTORY_LIMIT))
    lastCommit.current = 0
    updateBoard(() => snapshot)
  }, [board, future, updateBoard])

  return {
    commit,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  }
}
