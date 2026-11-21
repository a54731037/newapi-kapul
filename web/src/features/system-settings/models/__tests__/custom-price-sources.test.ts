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
import { afterEach, describe, expect, it } from 'vitest'

import {
  CUSTOM_PRICE_SOURCES_STORAGE_KEY,
  customSourceUpstream,
  readCustomPriceSources,
  writeCustomPriceSources,
} from '../upstream-ratio-sync-helpers'

afterEach(() => {
  window.localStorage.removeItem(CUSTOM_PRICE_SOURCES_STORAGE_KEY)
})

describe('custom price sources', () => {
  it('round-trips sources through local storage', () => {
    writeCustomPriceSources([
      {
        id: 'a',
        name: 'LiteLLM',
        url: 'https://cdn.jsdelivr.net/gh/BerriAI/litellm@main/x.json',
      },
    ])
    expect(readCustomPriceSources()).toEqual([
      {
        id: 'a',
        name: 'LiteLLM',
        url: 'https://cdn.jsdelivr.net/gh/BerriAI/litellm@main/x.json',
      },
    ])
  })

  it('ignores malformed stored entries', () => {
    window.localStorage.setItem(
      CUSTOM_PRICE_SOURCES_STORAGE_KEY,
      JSON.stringify([{ id: 'a' }, 'nope', null, { name: 'n', url: 42 }])
    )
    expect(readCustomPriceSources()).toEqual([])

    window.localStorage.setItem(CUSTOM_PRICE_SOURCES_STORAGE_KEY, 'not json')
    expect(readCustomPriceSources()).toEqual([])
  })

  it('sends the sync API a base URL plus the full endpoint', () => {
    expect(
      customSourceUpstream({
        id: 'a',
        name: '',
        url: 'https://cdn.jsdelivr.net/gh/BerriAI/litellm@main/model_prices.json',
      })
    ).toEqual({
      id: 0,
      name: 'cdn.jsdelivr.net',
      base_url: 'https://cdn.jsdelivr.net',
      endpoint:
        'https://cdn.jsdelivr.net/gh/BerriAI/litellm@main/model_prices.json',
    })
  })
})
