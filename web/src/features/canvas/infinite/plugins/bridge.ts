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
import { useEffect } from 'react'

import type { InfiniteNode, InfiniteNodeKind } from '../types'

/** Message envelope a plugin iframe posts to the app. */
export type PluginBridgeRequest =
  | {
      __plugin: 'ai-studio'
      type: 'generate-image'
      requestId: string
      nodeId: string
      prompt: string
      size?: string
    }
  | {
      __plugin: 'ai-studio'
      type: 'set-node'
      requestId: string
      nodeId: string
      fields: { title?: string; content?: string }
    }
  | {
      __plugin: 'ai-studio'
      type: 'get-node'
      requestId: string
      nodeId: string
    }
  | {
      __plugin: 'ai-studio'
      type: 'add-node'
      requestId: string
      kind: string
      content?: string
    }
  | {
      __plugin: 'ai-studio'
      type: 'toast'
      requestId?: string
      message: string
      level?: 'info' | 'success' | 'error'
    }

export type BridgeHandlers = {
  nodes: InfiniteNode[]
  /** Plaintext key of the currently selected creative key, if any. */
  getKey: () => string | null
  patchNode: (id: string, fields: { title?: string; content?: string }) => void
  addNode: (kind: InfiniteNodeKind, content?: string) => InfiniteNode
  generateImage: (args: {
    key: string
    prompt: string
    size?: string
  }) => Promise<string>
  notify: (message: string, level?: 'info' | 'success' | 'error') => void
}

type MessageLike = {
  data: unknown
  origin: string
  source: { postMessage: (payload: unknown, target: string) => void } | null
}

function isBridgeRequest(value: unknown): value is PluginBridgeRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { __plugin?: unknown; type?: unknown }
  return (
    candidate.__plugin === 'ai-studio' && typeof candidate.type === 'string'
  )
}

/**
 * Plugin iframes talk to the canvas through `postMessage`. Only opaque-origin
 * frames (exactly how `sandbox="allow-scripts"` reports itself) are accepted,
 * and only node ids that currently exist can be touched.
 */
export function createPluginMessageHandler(handlers: BridgeHandlers) {
  return (event: MessageLike) => {
    if (event.origin !== 'null') return
    if (!isBridgeRequest(event.data)) return
    const request = event.data
    const respond = (payload: {
      ok: boolean
      data?: unknown
      error?: string
    }) => {
      if (!request.requestId) return
      event.source?.postMessage(
        {
          __plugin: 'ai-studio:result',
          requestId: request.requestId,
          ...payload,
        },
        '*'
      )
    }

    const node = handlers.nodes.find((item) =>
      'nodeId' in request ? item.id === request.nodeId : false
    )

    switch (request.type) {
      case 'get-node': {
        if (!node) {
          respond({ ok: false, error: 'node not found' })
          return
        }
        respond({
          ok: true,
          data: {
            id: node.id,
            kind: node.kind,
            title: node.title,
            content: node.content,
          },
        })
        return
      }
      case 'set-node': {
        if (!node) {
          respond({ ok: false, error: 'node not found' })
          return
        }
        handlers.patchNode(node.id, request.fields ?? {})
        respond({ ok: true })
        return
      }
      case 'add-node': {
        const created = handlers.addNode(
          request.kind as InfiniteNodeKind,
          request.content
        )
        respond({ ok: true, data: { id: created.id } })
        return
      }
      case 'generate-image': {
        const key = handlers.getKey()
        if (!key) {
          respond({ ok: false, error: 'no api key selected' })
          return
        }
        handlers
          .generateImage({ key, prompt: request.prompt, size: request.size })
          .then((source) => {
            if (node) handlers.patchNode(node.id, { content: source })
            respond({ ok: true, data: { source } })
          })
          .catch((error: unknown) => {
            respond({
              ok: false,
              error: error instanceof Error ? error.message : 'failed',
            })
          })
        return
      }
      case 'toast': {
        handlers.notify(request.message, request.level)
        respond({ ok: true })
        return
      }
      default:
        respond({ ok: false, error: 'unsupported action' })
    }
  }
}

export function usePluginBridge(handlers: BridgeHandlers) {
  useEffect(() => {
    const listener = (event: MessageEvent) =>
      createPluginMessageHandler(handlers)(event as MessageLike)
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [handlers])
}
