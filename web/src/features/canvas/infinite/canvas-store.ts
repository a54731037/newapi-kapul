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
import type { CanvasProject } from './types'

/**
 * Local-only store for canvases. Generated media is embedded as data URLs, so a
 * single board easily exceeds the ~5 MB localStorage budget; IndexedDB has no
 * such limit and stays inside the browser. localStorage is only a fallback for
 * environments without IndexedDB. Unowned legacy records are left untouched
 * for explicit recovery/export, never assigned to whichever account logs in next.
 */
export type StoredProjects = {
  projects: CanvasProject[]
  activeId: string
}

const DB_NAME = 'ai-studio-canvas'
const DB_VERSION = 1
const STORE_NAME = 'boards'
const RECORD_PREFIX = 'projects:user:'
const STORAGE_PREFIX = 'infinite-canvas-projects-v2:user:'
const MEDIA_KINDS = new Set(['image', 'video', 'audio'])
const pendingSaves = new Map<number, Promise<void>>()

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('idb open failed'))
  })
}

export async function loadProjects(
  ownerId: number
): Promise<StoredProjects | null> {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) return null
  let stored: StoredProjects | undefined
  if (hasIndexedDb()) {
    const db = await openDb()
    try {
      stored = await new Promise<StoredProjects | undefined>(
        (resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readonly')
          const request = transaction
            .objectStore(STORE_NAME)
            .get(`${RECORD_PREFIX}${ownerId}`)
          request.onsuccess = () =>
            resolve(request.result as StoredProjects | undefined)
          request.onerror = () => reject(request.error)
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('idb read aborted'))
        }
      )
    } finally {
      db.close()
    }
  } else {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${ownerId}`)
    if (raw) stored = JSON.parse(raw) as StoredProjects
  }
  if (!stored) return null
  if (!Array.isArray(stored.projects) || stored.projects.length === 0) {
    throw new Error('invalid canvas store')
  }
  return stored
}

/** Blob URLs belong to a document; persist bytes only for known media fields. */
async function materializeCanvasMedia(
  state: StoredProjects
): Promise<StoredProjects> {
  const sources = new Set(
    state.projects.flatMap((project) =>
      project.board.nodes
        .filter(
          (node) =>
            MEDIA_KINDS.has(node.kind) && node.content.startsWith('blob:')
        )
        .map((node) => node.content)
    )
  )
  if (sources.size === 0) return state
  const media = new Map<string, string>()
  await Promise.all(
    [...sources].map(async (source) => {
      const response = await fetch(source, { credentials: 'omit' })
      if (!response.ok) throw new Error('Failed to read canvas media')
      const blob = await response.blob()
      if (blob.size === 0) throw new Error('Canvas media is empty')
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result)
          else reject(new Error('Failed to encode canvas media'))
        }
        reader.onerror = () =>
          reject(reader.error ?? new Error('Failed to encode canvas media'))
        reader.onabort = () => reject(new Error('Canvas media read aborted'))
        reader.readAsDataURL(blob)
      })
      media.set(source, dataUrl)
    })
  )
  return {
    ...state,
    projects: state.projects.map((project) => ({
      ...project,
      board: {
        ...project.board,
        nodes: project.board.nodes.map((node) =>
          MEDIA_KINDS.has(node.kind) && media.has(node.content)
            ? { ...node, content: media.get(node.content) ?? node.content }
            : node
        ),
      },
    })),
  }
}

export async function saveProjects(
  state: StoredProjects,
  ownerId: number
): Promise<void> {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
    throw new Error('canvas owner required')
  }
  // Preserve invocation order even when an older snapshot has a slower blob.
  const pending = (pendingSaves.get(ownerId) ?? Promise.resolve())
    .catch(() => {
      /* A failed snapshot must not block the next save. */
    })
    .then(async () => {
      const persistable = await materializeCanvasMedia(state)
      if (!hasIndexedDb()) {
        window.localStorage.setItem(
          `${STORAGE_PREFIX}${ownerId}`,
          JSON.stringify(persistable)
        )
        return
      }
      const db = await openDb()
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite')
          transaction
            .objectStore(STORE_NAME)
            .put(persistable, `${RECORD_PREFIX}${ownerId}`)
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('idb write aborted'))
        })
      } finally {
        db.close()
      }
    })
  pendingSaves.set(ownerId, pending)
  try {
    await pending
  } finally {
    if (pendingSaves.get(ownerId) === pending) pendingSaves.delete(ownerId)
  }
}
