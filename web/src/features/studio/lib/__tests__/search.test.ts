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
import { describe, expect, it } from 'vitest'

import { studioSearchSchema } from '../../search'

describe('studio search parameters', () => {
  it('accepts the drawing board and its image/canvas modes', () => {
    expect(studioSearchSchema.parse({ tab: 'canvas', view: 'image' })).toEqual({
      tab: 'canvas',
      view: 'image',
    })
    expect(studioSearchSchema.parse({ tab: 'canvas', view: 'canvas' })).toEqual(
      {
        tab: 'canvas',
        view: 'canvas',
      }
    )
    expect(studioSearchSchema.parse({ tab: 'video' })).toEqual({
      tab: 'video',
    })
  })

  it('folds the retired image tab into the drawing board', () => {
    expect(studioSearchSchema.parse({ tab: 'image' })).toEqual({
      tab: 'canvas',
    })
  })

  it('falls back to the image form when the mode is unknown', () => {
    expect(
      studioSearchSchema.parse({ tab: 'canvas', view: 'gallery' })
    ).toEqual({
      tab: 'canvas',
      view: 'image',
    })
  })
})
