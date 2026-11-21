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
import type { InfiniteNode } from '../types'

export type PluginManifestEntry = {
  id: string
  entry: string
}

export type PluginManifestFile = {
  version: number
  plugins: PluginManifestEntry[]
}

/** Shape the local module has to satisfy; everything else is optional. */
export type CanvasPluginModule = {
  id: string
  label: string
  size?: { width: number; height: number }
  create?: () => { title?: string; content?: string }
  render?: (node: InfiniteNode) => string
  /** Doubles as the node settings panel when the node is double-clicked. */
  editor?: (node: InfiniteNode) => string
}

export type LoadedPlugin = {
  module: CanvasPluginModule
  source: 'local' | 'installed'
}

export type PluginLoadResult = {
  plugins: LoadedPlugin[]
  errors: string[]
}
