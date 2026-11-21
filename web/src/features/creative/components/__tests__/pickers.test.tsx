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
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { DurationPicker } from '../duration-picker'
import { SizePicker } from '../size-picker'

const SIZE_PRESETS = [
  { value: '1024x1024', label: '1:1 · 1024' },
  { value: '1792x1024', label: '16:9 · 1792×1024' },
]

function SizeHarness(props: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('1024x1024')
  return (
    <SizePicker
      value={value}
      presets={SIZE_PRESETS}
      label='Size'
      min={256}
      max={4096}
      onChange={(next) => {
        setValue(next)
        props.onChange(next)
      }}
    />
  )
}

describe('size picker', () => {
  it('applies a preset resolution', async () => {
    const onChange = vi.fn()
    render(<SizeHarness onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Size' }))
    await userEvent.click(
      await screen.findByRole('option', { name: '16:9 · 1792×1024' })
    )

    expect(onChange).toHaveBeenCalledWith('1792x1024')
  })

  it('combines the custom width and height into a size string', async () => {
    const onChange = vi.fn()
    render(<SizeHarness onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Size' }))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Custom size' })
    )

    const width = screen.getByLabelText('Width')
    const height = screen.getByLabelText('Height')
    await userEvent.clear(width)
    await userEvent.clear(height)
    await userEvent.type(width, '800')
    await userEvent.type(height, '600')

    expect(onChange).toHaveBeenLastCalledWith('800x600')
  })

  it('ignores custom sizes outside the allowed range', async () => {
    const onChange = vi.fn()
    render(<SizeHarness onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Size' }))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Custom size' })
    )

    await userEvent.type(screen.getByLabelText('Width'), '10')
    await userEvent.type(screen.getByLabelText('Height'), '10')

    expect(onChange).not.toHaveBeenCalledWith('10x10')
  })
})

function DurationHarness(props: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('5')
  return (
    <DurationPicker
      value={value}
      presets={['4', '5', '10']}
      label='Duration'
      min={1}
      max={60}
      onChange={(next) => {
        setValue(next)
        props.onChange(next)
      }}
    />
  )
}

describe('duration picker', () => {
  it('applies a preset duration', async () => {
    const onChange = vi.fn()
    render(<DurationHarness onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Duration' }))
    await userEvent.click(await screen.findByRole('option', { name: '10s' }))

    expect(onChange).toHaveBeenCalledWith('10')
  })

  it('accepts a custom duration inside the allowed range', async () => {
    const onChange = vi.fn()
    render(<DurationHarness onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Duration' }))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Custom duration' })
    )
    await userEvent.type(screen.getByLabelText('Seconds'), '7')

    expect(onChange).toHaveBeenLastCalledWith('7')
  })

  it('ignores durations above the maximum', async () => {
    const onChange = vi.fn()
    render(<DurationHarness onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Duration' }))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Custom duration' })
    )
    await userEvent.type(screen.getByLabelText('Seconds'), '999')

    expect(onChange).not.toHaveBeenCalledWith('999')
  })
})
