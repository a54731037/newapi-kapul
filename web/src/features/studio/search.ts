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
import { z } from 'zod'

export const STUDIO_TABS = ['canvas', 'video'] as const

export type StudioTab = (typeof STUDIO_TABS)[number]

/** The drawing board offers a plain form and the node canvas. */
export const BOARD_VIEWS = ['image', 'canvas'] as const

export type BoardView = (typeof BOARD_VIEWS)[number]

/**
 * `?tab=` keeps a workspace shareable and lets the browser back button work;
 * `?view=` selects the mode inside the drawing board. Old links that still say
 * `?tab=image` fall back to the board, which opens in image mode anyway.
 */
export const studioSearchSchema = z.object({
  tab: z.enum(STUDIO_TABS).optional().catch('canvas'),
  view: z.enum(BOARD_VIEWS).optional().catch('image'),
})
