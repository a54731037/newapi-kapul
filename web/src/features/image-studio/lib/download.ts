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
import type { GeneratedImage } from '../types'

/** A stable, filesystem-safe name for a generated image. */
export function imageFileName(image: GeneratedImage): string {
  const stamp = new Date(image.createdAt)
    .toISOString()
    .replaceAll(/[:.]/g, '-')
    .slice(0, 19)
  const model = (image.model || 'image').replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
  const suffix = image.id
    .replaceAll(/[^a-zA-Z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(-12)
    .replace(/^-+/, '')
  return `ai-studio-${model}-${stamp}-${suffix}.png`
}

/** Decode a `data:` URL into a Blob without touching the network. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload = ''] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/png'
  if (header.includes(';base64')) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(payload)], { type: mime })
}

/**
 * Resolve any drawable source (data URL, blob URL or remote URL) to bytes so a
 * download never depends on the anchor honouring `download` on the raw src.
 */
export async function sourceToBlob(source: string): Promise<Blob> {
  if (source.startsWith('data:')) return dataUrlToBlob(source)
  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`Unable to read the image (${response.status})`)
  }
  return response.blob()
}

/** Save a generated image to the user's downloads directory. */
export async function downloadImage(image: GeneratedImage): Promise<void> {
  const blob = await sourceToBlob(image.source)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = imageFileName(image)
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser a tick to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
