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
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GeneratedImage } from '../../types'
import { dataUrlToBlob, downloadImage, imageFileName } from '../download'

const image: GeneratedImage = {
  id: 'batch-abc-image-0',
  source: 'data:image/png;base64,aGVsbG8=',
  prompt: 'a red circle',
  model: 'gpt-image-2.5',
  size: '1024x1024',
  createdAt: Date.UTC(2026, 0, 2, 3, 4, 5),
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('image download', () => {
  it('builds a filesystem-safe file name from model, time and id', () => {
    expect(imageFileName(image)).toBe(
      'ai-studio-gpt-image-2.5-2026-01-02T03-04-05-abc-image-0.png'
    )
  })

  it('decodes a base64 data URL into a png blob', async () => {
    const blob = dataUrlToBlob(image.source)
    expect(blob.type).toBe('image/png')
    expect(await blob.text()).toBe('hello')
  })

  it('saves through an object URL instead of relying on the raw data URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    await downloadImage(image)

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('reads remote sources as bytes before saving', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['bytes'], { type: 'image/png' }), {
        status: 200,
      })
    )
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:remote'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadImage({ ...image, source: 'https://example.test/a.png' })

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/a.png')
  })
})
