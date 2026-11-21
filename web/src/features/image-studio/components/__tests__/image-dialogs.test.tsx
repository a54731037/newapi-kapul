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

import type { GeneratedImage } from '../../types'
import { ImageEditDialog } from '../image-edit-dialog'
import { ImagePreviewDialog } from '../image-preview-dialog'

const image: GeneratedImage = {
  id: 'batch-1-image-0',
  source: 'data:image/png;base64,aGVsbG8=',
  prompt: 'a red circle',
  model: 'gpt-image-2.5',
  size: '1024x1024',
  createdAt: Date.now(),
}

describe('generated image preview', () => {
  it('shows the full-size image and forwards every action', async () => {
    const onDownload = vi.fn()
    const onEdit = vi.fn()
    const onSendToCanvas = vi.fn()
    render(
      <ImagePreviewDialog
        image={image}
        onOpenChange={() => {}}
        onDownload={onDownload}
        onEdit={onEdit}
        onSendToCanvas={onSendToCanvas}
      />
    )

    const preview = await screen.findByRole('img', { name: 'a red circle' })
    expect(preview).toHaveAttribute('src', image.source)

    await userEvent.click(screen.getByRole('button', { name: /Download/ }))
    expect(onDownload).toHaveBeenCalledWith(image)

    await userEvent.click(
      screen.getByRole('button', { name: /Edit this image/ })
    )
    expect(onEdit).toHaveBeenCalledWith(image)

    await userEvent.click(
      screen.getByRole('button', { name: /Send to canvas/ })
    )
    expect(onSendToCanvas).toHaveBeenCalledWith(image)
  })
})

describe('image edit dialog', () => {
  it('submits the edited prompt with the chosen size and count', async () => {
    const onSubmit = vi.fn()
    render(
      <ImageEditDialog
        image={image}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        isSubmitting={false}
      />
    )

    const prompt = await screen.findByLabelText('Edit prompt')
    await userEvent.clear(prompt)
    await userEvent.type(prompt, 'make the circle blue')
    await userEvent.click(screen.getByRole('button', { name: 'Apply edit' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        prompt: 'make the circle blue',
        size: '1024x1024',
        count: 1,
      })
    )
  })

  it('keeps the apply button disabled while the prompt is empty', async () => {
    render(
      <ImageEditDialog
        image={image}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        isSubmitting={false}
      />
    )

    const prompt = await screen.findByLabelText('Edit prompt')
    await userEvent.clear(prompt)
    expect(screen.getByRole('button', { name: 'Apply edit' })).toBeDisabled()
  })
})
