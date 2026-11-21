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
export type SavedPlugin = {
  id: string
  label: string
  entryUrl: string
  source: string
  savedAt: number
}

/**
 * Marketplace installs stay in this browser: the plugin source is stored in
 * IndexedDB and executed from a Blob URL. Nothing is written to the server.
 */
const DB_NAME = 'ai-studio-canvas-plugins'
const DB_VERSION = 1
const STORE_NAME = 'plugins'

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('idb open failed'))
  })
}

export async function listSavedPlugins(): Promise<SavedPlugin[]> {
  if (!hasIndexedDb()) return []
  try {
    const db = await openDb()
    const rows = await new Promise<SavedPlugin[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve(request.result as SavedPlugin[])
      request.onerror = () => reject(request.error)
    })
    db.close()
    return rows
  } catch {
    return []
  }
}

export async function savePluginRecord(record: SavedPlugin): Promise<void> {
  if (!hasIndexedDb()) throw new Error('IndexedDB unavailable')
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function removeSavedPlugin(id: string): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}
