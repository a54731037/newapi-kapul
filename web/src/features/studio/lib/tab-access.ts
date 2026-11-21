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
  BOARD_VIEWS,
  STUDIO_TABS,
  type BoardView,
  type StudioTab,
} from '../search'

/** The subset of `/api/status` that decides which workspace parts exist. */
export type StudioAccessStatus = {
  enable_studio?: boolean
  enable_studio_image?: boolean
  enable_studio_canvas?: boolean
  enable_studio_video?: boolean
  enable_studio_audio?: boolean
  /** Legacy switch kept as an extra gate for the drawing board. */
  enable_drawing?: boolean
}

/** Which generation targets the canvas panel may offer. */
export type GenerationTarget = 'image' | 'video' | 'audio'

function studioOpen(status: StudioAccessStatus | null | undefined): boolean {
  return status?.enable_studio !== false
}

function canvasOpen(status: StudioAccessStatus | null | undefined): boolean {
  return (
    status?.enable_studio_canvas !== false && status?.enable_drawing !== false
  )
}

function imageOpen(status: StudioAccessStatus | null | undefined): boolean {
  return status?.enable_studio_image !== false
}

/**
 * Resolves the creative workspace tabs.
 *
 * The board hosts image generation and the node canvas, so it stays as long as
 * either of them is enabled; video keeps its own tab.
 */
export function resolveStudioTabs(
  status: StudioAccessStatus | null | undefined
): StudioTab[] {
  if (!studioOpen(status)) return []
  return STUDIO_TABS.filter((tab) => {
    if (tab === 'video') return status?.enable_studio_video !== false
    return canvasOpen(status) || imageOpen(status)
  })
}

/** Modes inside the board, in the order they are offered. */
export function resolveBoardViews(
  status: StudioAccessStatus | null | undefined
): BoardView[] {
  if (!studioOpen(status)) return []
  return BOARD_VIEWS.filter((view) => {
    if (view === 'image') return imageOpen(status)
    return canvasOpen(status)
  })
}

/** Generation buttons the canvas panel may show. */
export function resolveGenerationTargets(
  status: StudioAccessStatus | null | undefined
): GenerationTarget[] {
  if (!studioOpen(status)) return []
  const targets: GenerationTarget[] = []
  if (imageOpen(status)) targets.push('image')
  if (status?.enable_studio_video !== false) targets.push('video')
  if (status?.enable_studio_audio !== false) targets.push('audio')
  return targets
}
