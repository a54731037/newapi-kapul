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
import type { InfiniteNodeKind } from './types'

export type NodeTypeDefinition = {
  id: InfiniteNodeKind
  /** English source string used with `t()`. */
  labelKey: string
  /** Defaults applied when the node is created. */
  defaults: {
    width: number
    height: number
    content: string
    title: string
    tint?: number
  }
  /** Only media nodes open the generation panel's media tab. */
  capability?: 'image' | 'video' | 'audio'
}

/**
 * Node registry — the same "open node type" model the reference canvas uses for
 * its plugins: anything registered here shows up in the add-node menu and gets
 * a renderer in the board. Adding a node type never touches the board component
 * beyond the renderer switch.
 */
export const NODE_TYPES: NodeTypeDefinition[] = [
  {
    id: 'prompt',
    labelKey: 'Prompt node',
    defaults: {
      width: 280,
      height: 180,
      content: '',
      title: 'Prompt',
    },
  },
  {
    id: 'image',
    labelKey: 'Image node',
    defaults: { width: 320, height: 260, content: '', title: 'Image' },
    capability: 'image',
  },
  {
    id: 'video',
    labelKey: 'Video node',
    defaults: { width: 360, height: 260, content: '', title: 'Video' },
    capability: 'video',
  },
  {
    id: 'audio',
    labelKey: 'Audio node',
    defaults: { width: 300, height: 150, content: '', title: 'Audio' },
    capability: 'audio',
  },
  {
    id: 'sticky',
    labelKey: 'Sticky note',
    defaults: {
      width: 220,
      height: 160,
      content: '',
      title: 'Note',
      tint: 0,
    },
  },
  {
    id: 'markdown',
    labelKey: 'Markdown node',
    defaults: {
      width: 320,
      height: 220,
      content: '# Title\n\nWrite markdown here.',
      title: 'Markdown',
    },
  },
  {
    id: 'svg',
    labelKey: 'SVG node',
    defaults: {
      width: 260,
      height: 260,
      content:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#6366f1"/></svg>',
      title: 'SVG',
    },
  },
  {
    id: 'html',
    labelKey: 'HTML node',
    defaults: {
      width: 320,
      height: 220,
      content:
        '<div style="font:14px system-ui;padding:12px">Hello from a sandboxed HTML node.</div>',
      title: 'HTML',
    },
  },
  {
    id: 'panorama',
    labelKey: 'Panorama node',
    defaults: { width: 360, height: 200, content: '', title: 'Panorama' },
    capability: 'image',
  },
]

/**
 * Locally loaded plugins register their node types here at runtime, so the
 * add-node menu and the board renderer agree on one source of truth.
 */
const pluginTypes = new Map<string, NodeTypeDefinition>()

export function registerPluginNodeType(definition: NodeTypeDefinition) {
  pluginTypes.set(definition.id, definition)
}

export function clearPluginNodeTypes() {
  pluginTypes.clear()
}

export function allNodeTypes(): NodeTypeDefinition[] {
  return [...NODE_TYPES, ...pluginTypes.values()]
}

export function nodeTypeDefinition(kind: InfiniteNodeKind): NodeTypeDefinition {
  return (
    pluginTypes.get(kind) ??
    NODE_TYPES.find((definition) => definition.id === kind) ??
    NODE_TYPES[0]
  )
}

/** Cycle sticky note tints so consecutive notes stay distinguishable. */
export function nextStickyTint(previous: number | undefined): number {
  const current = previous ?? -1
  return (current + 1) % 4
}
