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
import { describe, expect, test } from 'vitest'

import {
  isRenderableHeaderNavCustomLink,
  MAX_CUSTOM_LINK_NAME_LENGTH,
  MAX_CUSTOM_LINK_URL_LENGTH,
  MAX_HEADER_NAV_CUSTOM_LINKS,
  parseHeaderNavCustomLinks,
  serializeHeaderNavCustomLinks,
  validateHeaderNavCustomLinkName,
  validateHeaderNavCustomLinkUrl,
} from '../nav-custom-links'

describe('custom header nav links', () => {
  test('keeps a stored entry that fails validation so the operator can fix it', () => {
    const links = parseHeaderNavCustomLinks(
      JSON.stringify([
        { name: 'Docs', url: 'https://docs.example.com' },
        { name: '', url: 'javascript:alert(1)' },
      ])
    )

    expect(links).toEqual([
      { name: 'Docs', url: 'https://docs.example.com' },
      { name: '', url: 'javascript:alert(1)' },
    ])
    expect(links.map(isRenderableHeaderNavCustomLink)).toEqual([true, false])
  })

  test('reads JSON arrays, tolerates malformed values, and drops non-string fields', () => {
    expect(parseHeaderNavCustomLinks('')).toEqual([])
    expect(parseHeaderNavCustomLinks('not json')).toEqual([])
    expect(parseHeaderNavCustomLinks('{"name":"Docs"}')).toEqual([])
    expect(parseHeaderNavCustomLinks([{ name: 1, url: null }])).toEqual([
      { name: '', url: '' },
    ])
  })

  test('accepts an already-decoded array from the status payload', () => {
    expect(parseHeaderNavCustomLinks([{ name: 'Docs', url: '/docs' }])).toEqual(
      [{ name: 'Docs', url: '/docs' }]
    )
  })

  test('caps the list at the backend limit', () => {
    const raw = Array.from(
      { length: MAX_HEADER_NAV_CUSTOM_LINKS + 5 },
      (_, i) => ({
        name: `tab-${i}`,
        url: `/path-${i}`,
      })
    )

    expect(parseHeaderNavCustomLinks(raw)).toHaveLength(
      MAX_HEADER_NAV_CUSTOM_LINKS
    )
  })

  test('serializes an empty list back to the empty option value', () => {
    expect(serializeHeaderNavCustomLinks([])).toBe('')
  })

  test('round-trips entries without leaking editor-only fields', () => {
    const serialized = serializeHeaderNavCustomLinks([
      { name: 'Docs', url: 'https://docs.example.com' },
    ])

    expect(serialized).toBe(
      '[{"name":"Docs","url":"https://docs.example.com"}]'
    )
    expect(parseHeaderNavCustomLinks(serialized)).toEqual([
      { name: 'Docs', url: 'https://docs.example.com' },
    ])
  })

  test('mirrors the backend rejection rules', () => {
    // Mirrors setting/operation_setting/header_nav_links.go
    const rejected = [
      '', // empty
      ' /docs', // surrounding whitespace
      'docs', // relative
      'example.com/docs', // no scheme
      '//evil.example.com', // protocol relative
      'javascript:alert(1)', // non-http scheme
      'data:text/html,<script>alert(1)</script>',
      'ftp://example.com',
      'https://', // no host
      'https://user:pass@example.com', // credentials
      '/pricing?tab=all', // internal query
      '/pricing#top', // internal fragment
      'https://example.com\\@evil.com', // backslash
      'https://example.com\n',
    ]
    for (const url of rejected) {
      expect(validateHeaderNavCustomLinkUrl(url), url).not.toBeNull()
    }

    for (const url of [
      '/docs',
      'https://docs.example.com',
      'http://example.com:8080/a?b=1#c',
    ]) {
      expect(validateHeaderNavCustomLinkUrl(url), url).toBeNull()
    }
  })

  // Call sites render these keys with t() and no interpolation values, so the
  // message must carry the limit itself; a {{count}} placeholder would render
  // literally. This locks the message/constant coupling.
  test('states the enforced limit directly in the length messages', () => {
    const longName = 'a'.repeat(MAX_CUSTOM_LINK_NAME_LENGTH + 1)
    const longUrl = `/${'a'.repeat(MAX_CUSTOM_LINK_URL_LENGTH)}`

    expect(validateHeaderNavCustomLinkName(longName)).toBe(
      `Name cannot exceed ${MAX_CUSTOM_LINK_NAME_LENGTH} characters`
    )
    expect(validateHeaderNavCustomLinkUrl(longUrl)).toBe(
      `Link cannot exceed ${MAX_CUSTOM_LINK_URL_LENGTH} characters`
    )
    expect(
      validateHeaderNavCustomLinkName('a'.repeat(MAX_CUSTOM_LINK_NAME_LENGTH))
    ).toBeNull()
    expect(
      validateHeaderNavCustomLinkUrl(
        `/${'a'.repeat(MAX_CUSTOM_LINK_URL_LENGTH - 1)}`
      )
    ).toBeNull()
  })
})
