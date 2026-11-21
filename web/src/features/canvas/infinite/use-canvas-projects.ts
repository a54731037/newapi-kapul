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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from 'react'

import { useAuthStore } from '@/stores/auth-store'

import { loadProjects, saveProjects, type StoredProjects } from './canvas-store'
import type { CanvasProject, InfiniteBoard } from './types'

const EMPTY_BOARD: InfiniteBoard = {
  nodes: [],
  connections: [],
  viewport: { x: 0, y: 0, k: 1 },
}

let sequence = 0
function newId(prefix = 'project'): string {
  sequence += 1
  return `${prefix}-${Date.now().toString(36)}-${sequence}`
}

function createProject(
  name: string,
  board: InfiniteBoard = EMPTY_BOARD
): CanvasProject {
  const now = Date.now()
  return {
    id: newId(),
    name,
    board,
    createdAt: now,
    updatedAt: now,
  }
}

function initialProjects(): StoredProjects {
  const project = createProject('Board 1')
  return { projects: [project], activeId: project.id }
}

/**
 * Project (multi-board) store for the canvas. Boards live entirely in the
 * browser (IndexedDB, localStorage as fallback) — generated media never leaves
 * the machine.
 */
export function useCanvasProjects() {
  const ownerId = useAuthStore((store) => store.auth.user?.id ?? null)
  const sessionId = useAuthStore((store) => store.auth.session?.sid ?? null)
  const scope = `${ownerId}:${sessionId}`
  const [trackedScope, setTrackedScope] = useState(scope)
  const [state, setStoredState] = useState<StoredProjects>(initialProjects)
  const [hydrated, setHydrated] = useState(false)
  const [persistFailed, setPersistFailed] = useState(false)
  const readable = useRef(false)
  const isCurrent = useCallback(() => {
    const auth = useAuthStore.getState().auth
    return (
      auth.user?.id === ownerId && (auth.session?.sid ?? null) === sessionId
    )
  }, [ownerId, sessionId])

  // Reset before rendering any account-owned data under a different session.
  if (trackedScope !== scope) {
    setTrackedScope(scope)
    setStoredState(initialProjects())
    setHydrated(false)
    setPersistFailed(false)
  }

  const setState = useCallback(
    (updater: SetStateAction<StoredProjects>) => {
      if (!isCurrent()) return
      setStoredState(updater)
    },
    [isCurrent]
  )

  useEffect(() => {
    readable.current = false
    if (ownerId === null) return
    let cancelled = false
    void loadProjects(ownerId)
      .then((stored) => {
        if (cancelled || !isCurrent()) return
        readable.current = true
        if (stored) setState(stored)
      })
      .catch(() => {
        if (!cancelled && isCurrent()) setPersistFailed(true)
      })
      .finally(() => {
        if (!cancelled && isCurrent()) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [isCurrent, ownerId, scope, setState])

  useEffect(() => {
    if (!hydrated || !readable.current || ownerId === null) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!isCurrent()) return
      void saveProjects(state, ownerId)
        .then(() => {
          if (!cancelled && isCurrent()) {
            setPersistFailed(false)
          }
        })
        .catch(() => {
          if (!cancelled && isCurrent()) {
            setPersistFailed(true)
          }
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [hydrated, isCurrent, ownerId, scope, state])

  const activeProject = useMemo(
    () =>
      state.projects.find((project) => project.id === state.activeId) ??
      state.projects[0],
    [state.activeId, state.projects]
  )

  const updateBoard = useCallback(
    (updater: (board: InfiniteBoard) => InfiniteBoard) => {
      setState((previous) => ({
        ...previous,
        projects: previous.projects.map((project) =>
          project.id === state.activeId
            ? {
                ...project,
                board: updater(project.board),
                updatedAt: Date.now(),
              }
            : project
        ),
      }))
    },
    [setState, state.activeId]
  )

  const selectProject = useCallback(
    (id: string) => {
      setState((previous) => ({ ...previous, activeId: id }))
    },
    [setState]
  )

  const addProject = useCallback(
    (name?: string) => {
      setState((previous) => {
        const project = createProject(
          name ?? `Board ${previous.projects.length + 1}`
        )
        return {
          projects: [...previous.projects, project],
          activeId: project.id,
        }
      })
    },
    [setState]
  )

  const renameProject = useCallback(
    (id: string, name: string) => {
      setState((previous) => ({
        ...previous,
        projects: previous.projects.map((project) =>
          project.id === id
            ? { ...project, name, updatedAt: Date.now() }
            : project
        ),
      }))
    },
    [setState]
  )

  const duplicateProject = useCallback(
    (id: string) => {
      setState((previous) => {
        const source = previous.projects.find((project) => project.id === id)
        if (!source) return previous
        const copy = createProject(
          `${source.name} copy`,
          JSON.parse(JSON.stringify(source.board)) as InfiniteBoard
        )
        return { projects: [...previous.projects, copy], activeId: copy.id }
      })
    },
    [setState]
  )

  const deleteProject = useCallback(
    (id: string) => {
      setState((previous) => {
        if (previous.projects.length <= 1) return previous
        const projects = previous.projects.filter(
          (project) => project.id !== id
        )
        return {
          projects,
          activeId:
            previous.activeId === id ? projects[0].id : previous.activeId,
        }
      })
    },
    [setState]
  )

  /** Import a previously exported project JSON (board payload). */
  const importProject = useCallback(
    (raw: string) => {
      const parsed = JSON.parse(raw) as Partial<CanvasProject>
      const incoming = parsed.board
      if (!incoming || !Array.isArray(incoming.nodes)) {
        throw new Error('invalid board file')
      }
      setState((previous) => {
        const project = createProject(
          parsed.name ?? `Imported ${previous.projects.length + 1}`,
          {
            nodes: incoming.nodes,
            connections: incoming.connections ?? [],
            viewport: incoming.viewport ?? EMPTY_BOARD.viewport,
          }
        )
        return {
          projects: [...previous.projects, project],
          activeId: project.id,
        }
      })
    },
    [setState]
  )

  return {
    projects: state.projects,
    activeId: state.activeId,
    activeProject,
    activeBoard: activeProject.board,
    hydrated,
    persistFailed,
    updateBoard,
    selectProject,
    addProject,
    renameProject,
    duplicateProject,
    deleteProject,
    importProject,
  }
}

export function exportProjectFile(project: CanvasProject) {
  const payload = JSON.stringify(project, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${project.name.replaceAll(/\s+/g, '-').toLowerCase()}.json`
  link.click()
  URL.revokeObjectURL(url)
}
