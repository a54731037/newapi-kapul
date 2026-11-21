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
import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CapabilityKeySelect } from '../capability-key-select'

const tokens = [
  { id: 111, name: 'main', group: 'default', status: 1 },
  { id: 222, name: 'backup', group: 'vip', status: 1 },
]

vi.mock('../../hooks/use-creative-assets', () => ({
  useCreativeAssets: () => ({
    tokens,
    groups: ['default', 'vip'],
    isLoading: false,
  }),
}))

vi.mock('../../api', () => ({
  revealTokenKey: vi.fn(async (id: number) => `sk-${id}`),
}))

afterEach(() => {
  window.localStorage.removeItem('creative-key-selection')
  vi.clearAllMocks()
})

describe('CapabilityKeySelect auto selection', () => {
  it('preselects the first capable key so generating is not blocked', async () => {
    const onSelect = vi.fn()
    render(
      <CapabilityKeySelect
        capability='image'
        selection={null}
        onSelect={onSelect}
      />
    )
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({
        tokenId: 111,
        key: 'sk-111',
        group: 'default',
      })
    )
  })

  it('prefers the key this browser used last', async () => {
    window.localStorage.setItem('creative-key-selection', '222')
    const onSelect = vi.fn()
    render(
      <CapabilityKeySelect
        capability='image'
        selection={null}
        onSelect={onSelect}
      />
    )
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({
        tokenId: 222,
        key: 'sk-222',
        group: 'vip',
      })
    )
  })

  it('leaves an explicit selection untouched', async () => {
    const onSelect = vi.fn()
    render(
      <CapabilityKeySelect
        capability='image'
        selection={{ tokenId: 222, key: 'sk-222', group: 'vip' }}
        onSelect={onSelect}
      />
    )
    await Promise.resolve()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
