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
export type GeneratedImage = {
  id: string
  source: string
  prompt: string
  model: string
  size: string
  createdAt: number
}

export type GenerationResult =
  | { id: string; status: 'pending' }
  | {
      id: string
      status: 'success'
      image: GeneratedImage
      /** Set when the file belongs to a server job. */
      jobId?: number
      imageIndex?: number
    }
  | { id: string; status: 'failed'; error: string; jobId?: number }

export type GenerationLog = {
  id: string
  createdAt: number
  prompt: string
  model: string
  size: string
  count: number
  durationMs: number
  images: GeneratedImage[]
  failures: number
}

export const IMAGE_SIZES = [
  { value: '512x512', label: '512 × 512' },
  { value: '1024x1024', label: '1024 × 1024' },
  { value: '1536x1024', label: '1536 × 1024' },
  { value: '1024x1536', label: '1024 × 1536' },
  { value: '2048x2048', label: '2048 × 2048' },
  { value: '2560x1440', label: '2560 × 1440' },
  { value: '1440x2560', label: '1440 × 2560' },
  { value: '4096x4096', label: '4096 × 4096' },
  { value: '3840x2160', label: '3840 × 2160' },
  { value: '2160x3840', label: '2160 × 3840' },
] as const

/** Default size: the square that every image model accepts. */
export const DEFAULT_IMAGE_SIZE = '1024x1024'

/** Bounds accepted by the custom width × height input. */
export const IMAGE_SIZE_MIN = 256
export const IMAGE_SIZE_MAX = 4096

export const IMAGE_COUNTS = ['1', '2', '3', '4'] as const
