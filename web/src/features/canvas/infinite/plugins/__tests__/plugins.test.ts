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
import { describe, expect, it } from 'vitest'

import {
  allNodeTypes,
  nodeTypeDefinition,
  registerPluginNodeType,
  clearPluginNodeTypes,
} from '../../node-registry'
import { normalizePluginModule } from '../registry'

describe('local canvas plugins', () => {
  it('accepts a module with an id and label', () => {
    const plugin = normalizePluginModule({
      id: 'clock',
      label: 'Clock',
      size: { width: 260, height: 160 },
      render: () => '<div />',
    })
    expect(plugin?.id).toBe('clock')
    expect(plugin?.size).toEqual({ width: 260, height: 160 })
    expect(plugin?.render?.({} as never)).toBe('<div />')
  })

  it('rejects modules without an id or label', () => {
    expect(normalizePluginModule({ label: 'Clock' })).toBeNull()
    expect(normalizePluginModule({ id: 'clock' })).toBeNull()
    expect(normalizePluginModule({ id: '  ', label: 'Clock' })).toBeNull()
    expect(normalizePluginModule('not a plugin')).toBeNull()
  })

  it('drops an invalid size instead of failing the plugin', () => {
    const plugin = normalizePluginModule({
      id: 'swatch',
      label: 'Swatch',
      size: { width: 'wide', height: 100 },
    })
    expect(plugin?.size).toBeUndefined()
  })

  it('registers a plugin node type for the add-node menu', () => {
    clearPluginNodeTypes()
    registerPluginNodeType({
      id: 'clock',
      labelKey: 'Clock',
      defaults: { width: 260, height: 160, content: '', title: 'Clock' },
    })
    expect(allNodeTypes().some((item) => item.id === 'clock')).toBe(true)
    expect(nodeTypeDefinition('clock').labelKey).toBe('Clock')
    clearPluginNodeTypes()
    expect(allNodeTypes().some((item) => item.id === 'clock')).toBe(false)
  })

  it('falls back to the prompt node for unknown kinds', () => {
    expect(nodeTypeDefinition('mystery').id).toBe('prompt')
  })
})
