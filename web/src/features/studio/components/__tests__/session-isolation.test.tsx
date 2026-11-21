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
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { DrawingBoardView } from '../drawing-board-view'

const route = vi.hoisted(() => ({ view: 'canvas' }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => route,
}))
vi.mock('@/hooks/use-status', () => ({ useStatus: () => ({ status: {} }) }))
// Stateful child fixtures expose the session-scoped credential lifetime owned by
// the workspace boundary without invoking upstream generation or rendering a canvas.
function CredentialFixture() {
  const [value, setValue] = useState('')
  return (
    <input
      aria-label='Selected API key'
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}
vi.mock('@/features/canvas', () => ({ CanvasStudioView: CredentialFixture }))
vi.mock('@/features/image-studio', () => ({
  ImageStudioView: CredentialFixture,
}))

function login(id: number, sid = 'session-one') {
  useAuthStore.getState().auth.setBundle({
    access_token: 'fixture-access',
    access_expires_at: 9999999999,
    token_type: 'Bearer',
    user: { id, username: `user-${id}`, role: 1 },
    session: {
      sid,
      current: true,
      login_method: 'password',
      ip: '',
      user_agent: '',
      created_at: 0,
      last_active_at: 0,
      expires_at: 9999999999,
    },
  })
}

beforeEach(() => login(11))
afterEach(() => useAuthStore.getState().auth.reset())

describe.each(['canvas', 'image'])('%s workspace session boundary', (view) => {
  beforeEach(() => {
    route.view = view
  })

  it('clears selected credentials when another account becomes active', () => {
    render(<DrawingBoardView />)
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Selected API key' }),
      { target: { value: 'account-A-key' } }
    )
    act(() => login(22))
    expect(
      screen.getByRole('textbox', { name: 'Selected API key' })
    ).toHaveValue('')
  })

  it('clears selected credentials when the same account starts a different session', () => {
    render(<DrawingBoardView />)
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Selected API key' }),
      { target: { value: 'prior-session-key' } }
    )
    act(() => login(11, 'session-two'))
    expect(
      screen.getByRole('textbox', { name: 'Selected API key' })
    ).toHaveValue('')
  })

  it('unmounts private content when the login is cleared', () => {
    render(<DrawingBoardView />)
    act(() => useAuthStore.getState().auth.reset())
    expect(
      screen.queryByRole('textbox', { name: 'Selected API key' })
    ).not.toBeInTheDocument()
  })
})
