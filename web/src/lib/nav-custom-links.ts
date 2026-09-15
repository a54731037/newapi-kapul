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
 * Administrator-defined top navigation tabs.
 *
 * The backend (`ValidateHeaderNavCustomLinks`) owns the authoritative
 * validation; this module only mirrors the same rules so the settings form can
 * block a bad entry before it reaches the API and the header can tolerate a
 * legacy value that predates validation.
 */

export type HeaderNavCustomLink = {
  name: string
  url: string
}

export const MAX_CUSTOM_LINK_NAME_LENGTH = 32
export const MAX_CUSTOM_LINK_URL_LENGTH = 512
export const MAX_HEADER_NAV_CUSTOM_LINKS = 20

/** Mirrors the backend validator; returns a translation key or null when valid. */
export function validateHeaderNavCustomLinkUrl(raw: string): string | null {
  if (raw === '') return 'Link is required'
  if (raw !== raw.trim()) return 'Link cannot start or end with spaces'
  if (raw.length > MAX_CUSTOM_LINK_URL_LENGTH) {
    // The limit is baked into the message: call sites render these keys with
    // t() and no interpolation values, so a {{count}} placeholder would show
    // up literally.
    return `Link cannot exceed ${MAX_CUSTOM_LINK_URL_LENGTH} characters`
  }
  for (const character of raw) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x1f || codePoint === 0x7f || character === '\\') {
      return 'Link cannot contain backslashes or control characters'
    }
  }

  if (raw.startsWith('/')) {
    // `//host` is treated by browsers as protocol-relative, which would send
    // visitors to another origin from a link the operator meant as internal.
    if (raw.startsWith('//')) return 'Internal link cannot start with //'
    if (raw.includes('?') || raw.includes('#')) {
      return 'Internal link cannot contain ? or #; use a full https URL instead'
    }
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return 'Link must start with / or use http(s)'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Link must start with / or use http(s)'
  }
  if (
    parsed.hostname === '' ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    return 'Link must contain a host and no credentials'
  }
  return null
}

export function validateHeaderNavCustomLinkName(raw: string): string | null {
  if (raw === '') return 'Name is required'
  if (raw !== raw.trim()) return 'Name cannot start or end with spaces'
  if ([...raw].length > MAX_CUSTOM_LINK_NAME_LENGTH) {
    return `Name cannot exceed ${MAX_CUSTOM_LINK_NAME_LENGTH} characters`
  }
  return null
}

/**
 * Read the persisted option into entries for editing.
 *
 * Entries are kept as stored — including ones that fail validation — so the
 * settings form can show the operator exactly what is saved and let them fix
 * it. Use {@link isRenderableHeaderNavCustomLink} before putting an entry in
 * the header.
 */
export function parseHeaderNavCustomLinks(raw: unknown): HeaderNavCustomLink[] {
  if (!raw) return []
  let decoded: unknown = raw
  if (typeof raw === 'string') {
    if (raw.trim() === '') return []
    try {
      decoded = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(decoded)) return []

  const links: HeaderNavCustomLink[] = []
  for (const entry of decoded) {
    if (!entry || typeof entry !== 'object') continue
    const { name, url } = entry as Record<string, unknown>
    links.push({
      name: typeof name === 'string' ? name : '',
      url: typeof url === 'string' ? url : '',
    })
    if (links.length >= MAX_HEADER_NAV_CUSTOM_LINKS) break
  }
  return links
}

/** Whether a stored entry is safe to turn into a header tab. */
export function isRenderableHeaderNavCustomLink(
  link: HeaderNavCustomLink
): boolean {
  return (
    validateHeaderNavCustomLinkName(link.name) === null &&
    validateHeaderNavCustomLinkUrl(link.url) === null
  )
}

/** First problem found in a row, so the editor can block saving on it. */
export function headerNavCustomLinkError(
  link: HeaderNavCustomLink
): string | null {
  return (
    validateHeaderNavCustomLinkName(link.name) ??
    validateHeaderNavCustomLinkUrl(link.url)
  )
}

export function hasInvalidHeaderNavCustomLink(
  links: HeaderNavCustomLink[]
): boolean {
  return links.some((link) => headerNavCustomLinkError(link) !== null)
}

export function serializeHeaderNavCustomLinks(
  links: HeaderNavCustomLink[]
): string {
  if (links.length === 0) return ''
  return JSON.stringify(
    links.map((link) => ({ name: link.name, url: link.url }))
  )
}
