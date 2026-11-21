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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DrawingSettingsSection } from '../drawing-settings-section'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../hooks/use-update-option', () => ({
  useUpdateOption: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

const allEnabled = {
  StudioEnabled: true,
  StudioImageEnabled: true,
  StudioCanvasEnabled: true,
  StudioVideoEnabled: true,
  StudioAudioEnabled: true,
}

describe('creative workspace switches', () => {
  it('exposes one switch per capability', () => {
    render(<DrawingSettingsSection defaultValues={allEnabled} />)

    expect(
      screen.getByRole('switch', { name: 'Enable creative workspace' })
    ).toBeChecked()
    for (const name of [
      'Image generation',
      'Node canvas',
      'Video creation',
      'Audio generation',
    ]) {
      expect(screen.getByRole('switch', { name })).toBeChecked()
    }
  })

  it('freezes the capability switches while the workspace is off', async () => {
    const user = userEvent.setup()
    render(<DrawingSettingsSection defaultValues={allEnabled} />)

    await user.click(
      screen.getByRole('switch', { name: 'Enable creative workspace' })
    )
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Enable creative workspace' })
      ).not.toBeChecked()
    )

    // Base UI marks a disabled switch with `data-disabled` and removes it from
    // the tab order instead of using the native attribute.
    for (const name of [
      'Image generation',
      'Node canvas',
      'Video creation',
      'Audio generation',
    ]) {
      const control = screen.getByRole('switch', { name })
      expect(control).toHaveAttribute('data-disabled')
      expect(control).toHaveAttribute('tabindex', '-1')
      await user.click(control)
      expect(control).toBeChecked()
    }
  })
})
