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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useTopNavLinks } from '../use-top-nav-links'

/** Every built-in item disabled, so assertions only see the custom tabs. */
const NO_BUILT_IN_MODULES = {
  home: false,
  console: false,
  pricing: { enabled: false, requireAuth: false },
  rankings: { enabled: false, requireAuth: false },
  docs: false,
  about: false,
}

function renderNavLinks(status: Record<string, unknown>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(['status'], status)
  function Wrapper(props: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    )
  }
  return renderHook(() => useTopNavLinks(), { wrapper: Wrapper })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useTopNavLinks custom tabs', () => {
  it('appends administrator tabs after the built-in items', () => {
    const { result } = renderNavLinks({
      HeaderNavModules: { ...NO_BUILT_IN_MODULES, home: true },
      HeaderNavCustomLinks: JSON.stringify([
        { name: 'My Portal', url: 'https://portal.example.com' },
        { name: 'Handbook', url: '/handbook' },
      ]),
    })

    expect(result.current.map((link) => link.title)).toEqual([
      'Home',
      'My Portal',
      'Handbook',
    ])
    expect(result.current[1]).toMatchObject({
      href: 'https://portal.example.com',
      external: true,
    })
    expect(result.current[2]).toMatchObject({
      href: '/handbook',
      external: false,
    })
  })

  it('keeps the operator-typed name verbatim instead of translating it', () => {
    const { result } = renderNavLinks({
      HeaderNavModules: NO_BUILT_IN_MODULES,
      // "Docs" is an existing translation key; a custom tab must not be
      // re-translated into the built-in label.
      HeaderNavCustomLinks: [{ name: 'Docs', url: '/handbook' }],
    })

    expect(result.current.map((link) => link.title)).toEqual(['Docs'])
  })

  it('skips entries that fail validation so an unsafe href never reaches the header', () => {
    const { result } = renderNavLinks({
      HeaderNavModules: NO_BUILT_IN_MODULES,
      HeaderNavCustomLinks: JSON.stringify([
        { name: 'Unsafe', url: 'javascript:alert(1)' },
        { name: 'Protocol relative', url: '//evil.example.com' },
        { name: 'Safe', url: '/safe' },
      ]),
    })

    expect(result.current).toEqual([
      { title: 'Safe', href: '/safe', external: false },
    ])
  })

  it('renders no custom tabs when the option is absent or malformed', () => {
    const base = { HeaderNavModules: NO_BUILT_IN_MODULES }

    expect(renderNavLinks(base).result.current).toEqual([])
    expect(
      renderNavLinks({ ...base, HeaderNavCustomLinks: 'not json' }).result
        .current
    ).toEqual([])
  })
})
