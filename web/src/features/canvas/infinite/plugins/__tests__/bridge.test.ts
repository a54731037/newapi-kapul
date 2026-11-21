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
import { describe, expect, it, vi } from 'vitest'

import type { InfiniteNode } from '../../types'
import { createPluginMessageHandler, type BridgeHandlers } from '../bridge'

const node: InfiniteNode = {
  id: 'node-1',
  kind: 'note',
  title: 'Bridge note',
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
  content: 'hello',
}

function makeHandlers(overrides: Partial<BridgeHandlers> = {}): BridgeHandlers {
  return {
    nodes: [node],
    getKey: () => null,
    patchNode: vi.fn(),
    addNode: vi.fn(() => ({ ...node, id: 'new-node' })),
    generateImage: vi.fn(async () => 'data:image/png;base64,AAAA'),
    notify: vi.fn(),
    ...overrides,
  }
}

function event(data: unknown, origin = 'null') {
  const postMessage = vi.fn()
  return {
    event: {
      data,
      origin,
      source: { postMessage } as {
        postMessage: (payload: unknown, target: string) => void
      },
    },
    postMessage,
  }
}

describe('plugin bridge protocol', () => {
  it('ignores messages from a same-origin frame', () => {
    const patchNode = vi.fn()
    const handler = createPluginMessageHandler(makeHandlers({ patchNode }))
    const { event: message } = event(
      {
        __plugin: 'ai-studio',
        type: 'set-node',
        requestId: 'r1',
        nodeId: 'node-1',
        fields: { title: 'hack' },
      },
      'http://127.0.0.1:3000'
    )
    handler(message)
    expect(patchNode).not.toHaveBeenCalled()
  })

  it('patches a node for a sandboxed frame', () => {
    const patchNode = vi.fn()
    const handler = createPluginMessageHandler(makeHandlers({ patchNode }))
    const { event: message, postMessage } = event({
      __plugin: 'ai-studio',
      type: 'set-node',
      requestId: 'r2',
      nodeId: 'node-1',
      fields: { title: 'renamed' },
    })
    handler(message)
    expect(patchNode).toHaveBeenCalledWith('node-1', { title: 'renamed' })
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, requestId: 'r2' }),
      '*'
    )
  })

  it('refuses to touch an unknown node', () => {
    const patchNode = vi.fn()
    const handler = createPluginMessageHandler(makeHandlers({ patchNode }))
    const { event: message } = event({
      __plugin: 'ai-studio',
      type: 'set-node',
      requestId: 'r3',
      nodeId: 'missing',
      fields: { title: 'x' },
    })
    handler(message)
    expect(patchNode).not.toHaveBeenCalled()
  })

  it('reports a missing key instead of generating', () => {
    const generateImage = vi.fn()
    const handler = createPluginMessageHandler(makeHandlers({ generateImage }))
    const { event: message, postMessage } = event({
      __plugin: 'ai-studio',
      type: 'generate-image',
      requestId: 'r4',
      nodeId: 'node-1',
      prompt: 'a circle',
    })
    handler(message)
    expect(generateImage).not.toHaveBeenCalled()
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: 'no api key selected' }),
      '*'
    )
  })

  it('generates into the requesting node when a key is selected', async () => {
    const patchNode = vi.fn()
    const handler = createPluginMessageHandler(
      makeHandlers({ getKey: () => 'sk-test', patchNode })
    )
    const { event: message, postMessage } = event({
      __plugin: 'ai-studio',
      type: 'generate-image',
      requestId: 'r5',
      nodeId: 'node-1',
      prompt: 'a circle',
    })
    handler(message)
    await Promise.resolve()
    await Promise.resolve()
    expect(patchNode).toHaveBeenCalledWith('node-1', {
      content: 'data:image/png;base64,AAAA',
    })
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      '*'
    )
  })

  it('creates a node through the bridge', () => {
    const addNode = vi.fn(() => ({ ...node, id: 'new-node' }))
    const handler = createPluginMessageHandler(makeHandlers({ addNode }))
    const { event: message } = event({
      __plugin: 'ai-studio',
      type: 'add-node',
      requestId: 'r6',
      kind: 'sticky',
      content: 'from plugin',
    })
    handler(message)
    expect(addNode).toHaveBeenCalledWith('sticky', 'from plugin')
  })
})
