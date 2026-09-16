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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { UpdateCheckerSection } from '../update-checker-section'

/**
 * The release feed is asserted as a literal on purpose. This build publishes its
 * own releases, so the update check must never fall back to the upstream feed
 * (which would announce versions this build does not contain) — an upstream
 * merge silently reverting the URL is the regression this locks down.
 */
const RELEASE_FEED_URL =
  'https://api.github.com/repos/a54731037/newapi-kapul/releases/latest'

function mockReleaseFeed(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('update checker', () => {
  test('checks this build release feed when the administrator asks for updates', async () => {
    const fetchMock = mockReleaseFeed({ tag_name: 'v0.2.0' })
    render(<UpdateCheckerSection currentVersion='v0.1.8' startTime={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    expect(fetchMock.mock.calls[0][0]).toBe(RELEASE_FEED_URL)
  })

  test('reports the running version as current when the feed matches it', async () => {
    mockReleaseFeed({
      tag_name: 'v0.1.8',
      html_url: 'https://example.com/v0.1.8',
    })
    render(<UpdateCheckerSection currentVersion='v0.1.8' startTime={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))

    await waitFor(() => {
      expect(screen.queryByText('Checking updates...')).not.toBeInTheDocument()
    })
    expect(
      screen.queryByText('New version available: v0.1.8')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Release details')).not.toBeInTheDocument()
  })

  test('offers the release notes when the feed publishes a newer version', async () => {
    mockReleaseFeed({
      tag_name: 'v0.2.0',
      body: 'Adds the fork branding',
      html_url: 'https://example.com/v0.2.0',
      published_at: '2026-09-15T10:44:57Z',
    })
    render(<UpdateCheckerSection currentVersion='v0.1.8' startTime={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))

    expect(
      await screen.findByText('New version available: v0.2.0')
    ).toBeInTheDocument()
    expect(screen.getByText('Adds the fork branding')).toBeInTheDocument()
  })
})
