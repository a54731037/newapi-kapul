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

/**
 * Data model for the infinite canvas. Field names stay stable so boards can be
 * reasoned about (and later migrated) with one vocabulary:
 * position/width/height are world units, viewport is `{ x, y, k }`.
 */
export type CanvasPoint = {
  x: number
  y: number
}

export type CanvasViewport = {
  x: number
  y: number
  k: number
}

/** Built-in node kinds; plugins register extra ids through the node registry. */
export type BuiltinNodeKind =
  | 'prompt'
  | 'image'
  | 'video'
  | 'audio'
  | 'sticky'
  | 'markdown'

/** Node kinds are open strings, mirroring the upstream `<pluginId>:<name>` model. */
export type InfiniteNodeKind = BuiltinNodeKind | (string & {})

export type CanvasNodeStatus = 'idle' | 'loading' | 'success' | 'error'

export type InfiniteNode = {
  id: string
  kind: InfiniteNodeKind
  title: string
  position: CanvasPoint
  width: number
  height: number
  /** Prompt text, image URL, markdown source, speech text … */
  content: string
  status?: CanvasNodeStatus
  error?: string
  /** Async task handle for video generation polled by the board. */
  taskId?: string
  model?: string
  /** Sticky note tint index (also reused as panorama offset). */
  tint?: number
  /** Locked nodes stay in place but can still be selected and deleted. */
  locked?: boolean
}

export type InfiniteConnection = {
  id: string
  fromNodeId: string
  toNodeId: string
}

export type SelectionBox = {
  start: CanvasPoint
  current: CanvasPoint
}

export type InfiniteBoard = {
  nodes: InfiniteNode[]
  connections: InfiniteConnection[]
  viewport: CanvasViewport
}

export type CanvasProject = {
  id: string
  name: string
  board: InfiniteBoard
  createdAt: number
  updatedAt: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 3
export const GRID_SIZE = 48
export const DEFAULT_NODE_SIZE = { width: 280, height: 200 }
export const STICKY_TINTS = [
  'bg-amber-50 border-amber-200 text-amber-900',
  'bg-sky-50 border-sky-200 text-sky-900',
  'bg-emerald-50 border-emerald-200 text-emerald-900',
  'bg-rose-50 border-rose-200 text-rose-900',
]
