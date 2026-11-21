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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SearchBar } from '../components/search-bar'

describe('pricing search bar', () => {
  it('focuses the search field from the command shortcut', async () => {
    const user = userEvent.setup()
    render(<SearchBar value='' onChange={vi.fn()} onClear={vi.fn()} />)

    const field = screen.getByRole('textbox', { name: 'Search models' })
    expect(field).not.toHaveFocus()

    await user.keyboard('{Control>}k{/Control}')

    expect(field).toHaveFocus()
  })

  it('releases focus when Escape is pressed inside the field', async () => {
    const user = userEvent.setup()
    render(<SearchBar value='' onChange={vi.fn()} onClear={vi.fn()} />)

    const field = screen.getByRole('textbox', { name: 'Search models' })
    await user.click(field)
    expect(field).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(field).not.toHaveFocus()
  })

  it('shows the clear action only for a non-empty query', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    const { rerender } = render(
      <SearchBar value='' onChange={vi.fn()} onClear={onClear} />
    )

    expect(
      screen.queryByRole('button', { name: 'Clear search' })
    ).not.toBeInTheDocument()

    rerender(<SearchBar value='gpt-4o' onChange={vi.fn()} onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
