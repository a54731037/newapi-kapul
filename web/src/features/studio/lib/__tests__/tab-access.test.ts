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

import {
  resolveBoardViews,
  resolveGenerationTargets,
  resolveStudioTabs,
} from '../tab-access'

describe('creative workspace access', () => {
  it('closes everything when the master switch is off', () => {
    expect(resolveStudioTabs({ enable_studio: false })).toEqual([])
    expect(resolveBoardViews({ enable_studio: false })).toEqual([])
    expect(resolveGenerationTargets({ enable_studio: false })).toEqual([])
  })

  it('shows the board and the video tab by default', () => {
    expect(resolveStudioTabs({})).toEqual(['canvas', 'video'])
    expect(resolveBoardViews({})).toEqual(['image', 'canvas'])
    expect(resolveGenerationTargets({})).toEqual(['image', 'video', 'audio'])
  })

  it('keeps the board alive while image generation or the canvas is on', () => {
    expect(resolveStudioTabs({ enable_studio_image: false })).toEqual([
      'canvas',
      'video',
    ])
    expect(resolveStudioTabs({ enable_studio_canvas: false })).toEqual([
      'canvas',
      'video',
    ])
    expect(
      resolveStudioTabs({
        enable_studio_image: false,
        enable_studio_canvas: false,
      })
    ).toEqual(['video'])
  })

  it('offers only the enabled board modes', () => {
    expect(resolveBoardViews({ enable_studio_image: false })).toEqual(['canvas'])
    expect(resolveBoardViews({ enable_studio_canvas: false })).toEqual([
      'image',
    ])
    expect(resolveBoardViews({ enable_drawing: false })).toEqual(['image'])
  })

  it('drops video and audio from the canvas panel on their own', () => {
    expect(resolveGenerationTargets({ enable_studio_video: false })).toEqual([
      'image',
      'audio',
    ])
    expect(resolveGenerationTargets({ enable_studio_audio: false })).toEqual([
      'image',
      'video',
    ])
    expect(resolveGenerationTargets({ enable_studio_image: false })).toEqual([
      'video',
      'audio',
    ])
  })
})
