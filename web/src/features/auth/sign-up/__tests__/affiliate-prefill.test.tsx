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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

import { saveAffiliateCode } from '@/features/auth/lib/storage'

import { SignUpForm } from '../components/sign-up-form'

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: {}, isLoading: false }),
}))

vi.mock('@/features/auth/hooks/use-turnstile', () => ({
  useTurnstile: () => ({
    isTurnstileEnabled: false,
    turnstileSiteKey: '',
    turnstileToken: '',
    setTurnstileToken: () => undefined,
    validateTurnstile: () => true,
  }),
}))

vi.mock('@/features/auth/hooks/use-email-verification', () => ({
  useEmailVerification: () => ({
    isSending: false,
    secondsLeft: 0,
    isActive: false,
    sendCode: async () => true,
  }),
}))

vi.mock('@/features/auth/components/oauth-providers', () => ({
  OAuthProviders: () => null,
}))

// Mirrors the root route: the invitation code in the URL is persisted in an
// effect, i.e. after the sign-up form has already been created.
function RootHarness() {
  useEffect(() => {
    const aff = new URLSearchParams(window.location.search).get('aff')?.trim()
    if (aff) {
      saveAffiliateCode(aff)
    }
  }, [])
  return <Outlet />
}

function renderInviteLink(url: string) {
  window.history.replaceState({}, '', url)
  const root = createRootRoute({ component: RootHarness })
  const signUp = createRoute({
    getParentRoute: () => root,
    path: '/sign-up',
    component: SignUpForm,
  })
  const router = createRouter({
    routeTree: root.addChildren([signUp]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  window.localStorage.clear()
})

it('prefills the invitation code when an invite link is the first page opened', async () => {
  renderInviteLink('/sign-up?aff=INVITE123')

  const field = await screen.findByLabelText('邀请码')
  await waitFor(() => expect(field).toHaveValue('INVITE123'))
})

it('lets the invite link replace an affiliate code stored by an earlier visit', async () => {
  saveAffiliateCode('STALE456')

  renderInviteLink('/sign-up?aff=INVITE123')

  const field = await screen.findByLabelText('邀请码')
  await waitFor(() => expect(field).toHaveValue('INVITE123'))
})
